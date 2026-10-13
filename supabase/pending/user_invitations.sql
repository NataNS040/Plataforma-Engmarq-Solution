-- Reviewed component embedded in public_company_signup.sql; never apply alone.
-- Invitations create access identities, never colaboradores or quota reservations.
CREATE TABLE engmarq_private.user_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 actor_id uuid NOT NULL REFERENCES public.user_profiles(id),
 email text NOT NULL UNIQUE CHECK(email=lower(btrim(email))),
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 2 AND 150),
 invited_role public.user_role NOT NULL CHECK(invited_role IN ('gestor','operacional')),
 admission_hash text NOT NULL UNIQUE CHECK(admission_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','cancelled','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '48 hours'),
 accepted_at timestamptz,
 CHECK(expires_at>created_at),
 CHECK((state='accepted')=(accepted_at IS NOT NULL))
);
CREATE INDEX user_invitations_empresa_created ON engmarq_private.user_invitations(empresa_id,created_at DESC);
ALTER TABLE engmarq_private.user_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engmarq_private.user_invitations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.convite_autorizado(actor uuid,company uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT current_setting('role',true)='service_role' AND EXISTS(
 SELECT 1 FROM public.user_profiles p JOIN public.empresas a ON a.id=p.empresa_id
 JOIN public.empresas e ON e.id=company WHERE p.id=actor AND p.active
 AND a.status='ativa' AND e.status='ativa'
 AND (p.role='admin' OR (p.role IN ('empresa','gestor') AND p.empresa_id=company))
 AND EXISTS(SELECT 1 FROM public.empresa_features f WHERE f.empresa_id=company AND f.feature_key='usuarios.gestao' AND f.enabled))
$$;

CREATE FUNCTION public.convite_criar(actor uuid,company uuid,invite_email text,invite_name text,invite_role public.user_role,token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation uuid;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.user_profiles WHERE id=actor FOR SHARE;
 PERFORM 1 FROM public.empresas WHERE id IN(company,(SELECT empresa_id FROM public.user_profiles WHERE id=actor)) ORDER BY id FOR SHARE;
 IF NOT public.convite_autorizado(actor,company) OR invite_role NOT IN ('gestor','operacional') THEN
  RAISE EXCEPTION 'Invitation denied' USING ERRCODE='42501'; END IF;
 IF invite_email IS NULL OR length(btrim(invite_email)) NOT BETWEEN 3 AND 320 OR invite_name IS NULL
 OR length(btrim(invite_name)) NOT BETWEEN 2 AND 150 OR token_hash IS NULL OR token_hash !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=lower(btrim(invite_email))) THEN
  RAISE EXCEPTION 'Identity already registered' USING ERRCODE='23505'; END IF;
 INSERT INTO engmarq_private.user_invitations(empresa_id,actor_id,email,full_name,invited_role,admission_hash)
 VALUES(company,actor,lower(btrim(invite_email)),btrim(invite_name),invite_role,token_hash) RETURNING id INTO invitation;
 RETURN invitation;
END $$;

CREATE FUNCTION public.convite_listar(actor uuid,company uuid)
RETURNS TABLE(id uuid,email text,full_name text,invited_role public.user_role,state text,expires_at timestamptz,user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.convite_autorizado(actor,company) THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT i.id,i.email,i.full_name,i.invited_role,
 CASE WHEN i.state='pending' AND i.expires_at<=clock_timestamp() THEN 'expired' ELSE i.state END,
 i.expires_at,i.user_id FROM engmarq_private.user_invitations i WHERE i.empresa_id=company ORDER BY i.created_at DESC LIMIT 100;
END $$;

CREATE FUNCTION public.convite_cancelar(actor uuid,invitation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i engmarq_private.user_invitations;
BEGIN
 SELECT * INTO i FROM engmarq_private.user_invitations WHERE id=invitation FOR UPDATE;
 IF NOT FOUND OR NOT public.convite_autorizado(actor,i.empresa_id) THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
 IF i.state='accepted' THEN RAISE EXCEPTION 'Already accepted' USING ERRCODE='P2602'; END IF;
 UPDATE engmarq_private.user_invitations SET state='cancelled' WHERE id=i.id;
END $$;

CREATE FUNCTION public.convite_falhou(actor uuid,invitation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
 -- A failed/ambiguous delivery never activates access and is not retried automatically.
 UPDATE engmarq_private.user_invitations SET state='failed' WHERE id=invitation AND actor_id=actor AND state='pending';
END $$;

CREATE FUNCTION public.convite_aceitar(invitee uuid,invitation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i engmarq_private.user_invitations; p public.user_profiles; confirmed boolean;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM engmarq_private.user_invitations WHERE id=invitation FOR UPDATE;
 IF NOT FOUND OR i.user_id IS DISTINCT FROM invitee OR i.state<>'pending' OR i.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='P2602'; END IF;
 PERFORM 1 FROM public.user_profiles WHERE id=i.actor_id FOR SHARE;
 PERFORM 1 FROM public.empresas WHERE id IN(i.empresa_id,(SELECT empresa_id FROM public.user_profiles WHERE id=i.actor_id)) ORDER BY id FOR SHARE;
 IF NOT public.convite_autorizado(i.actor_id,i.empresa_id) THEN RAISE EXCEPTION 'Issuer revoked' USING ERRCODE='42501'; END IF;
 SELECT email_confirmed_at IS NOT NULL AND lower(email)=i.email AND NOT coalesce(is_anonymous,false)
 INTO confirmed FROM auth.users WHERE id=invitee FOR SHARE;
 IF confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Email not confirmed' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.user_profiles WHERE id=invitee FOR UPDATE;
 IF NOT FOUND OR p.empresa_id<>i.empresa_id OR p.role<>i.invited_role OR p.active OR lower(p.email)<>i.email THEN
  RAISE EXCEPTION 'Invitation profile mismatch' USING ERRCODE='42501'; END IF;
 UPDATE engmarq_private.user_invitations SET state='accepted',accepted_at=clock_timestamp() WHERE id=i.id;
 UPDATE public.user_profiles SET active=true WHERE id=invitee;
 RETURN i.empresa_id;
END $$;

CREATE FUNCTION public.convite_guard_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i engmarq_private.user_invitations;
BEGIN
 SELECT * INTO i FROM engmarq_private.user_invitations WHERE user_id=NEW.id;
 IF FOUND AND (NEW.empresa_id<>i.empresa_id OR lower(NEW.email)<>i.email
 OR (i.state<>'accepted' AND (NEW.active OR NEW.role<>i.invited_role))) THEN
  RAISE EXCEPTION 'Invitation profile is protected' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.convite_guard_profile() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_pending_invitation BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.convite_guard_profile();

REVOKE ALL ON FUNCTION public.convite_autorizado(uuid,uuid),public.convite_criar(uuid,uuid,text,text,public.user_role,text),
 public.convite_listar(uuid,uuid),public.convite_cancelar(uuid,uuid),public.convite_falhou(uuid,uuid),public.convite_aceitar(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.convite_autorizado(uuid,uuid),public.convite_criar(uuid,uuid,text,text,public.user_role,text),
 public.convite_listar(uuid,uuid),public.convite_cancelar(uuid,uuid),public.convite_falhou(uuid,uuid),public.convite_aceitar(uuid,uuid)
 TO service_role;
