-- Remediation B01/B02/B05 + scoped AT04/AT06; restore known Users 014 to 015.
-- No business-row writes; no Storage DDL, ALTER or ownership changes.
-- Run the complete file after 021_security_preflight_readonly.sql has no blocks.
BEGIN;
-- Fail before locks/DDL with an explicit prerequisite, rather than an ownership
-- error or an implicit regclass error. Do not recreate missing legacy modules.
DO $$ DECLARE missing text; BEGIN
 SELECT string_agg(relation,', ' ORDER BY relation) INTO missing
 FROM (VALUES ('public.empresas'),('public.documentos'),('public.colaboradores'),('public.vw_dashboard_documentos')) r(relation)
 WHERE to_regclass(relation) IS NULL;
 IF missing IS NOT NULL THEN
   RAISE EXCEPTION '021 prerequisite relations missing: %',missing;
 END IF;
END $$;
LOCK TABLE public.empresas, public.documentos, public.colaboradores IN SHARE ROW EXCLUSIVE MODE;

DO $$ BEGIN
  IF to_regprocedure('engmarq_private.can_access_catalogos(uuid,boolean)') IS NULL
     OR to_regprocedure('engmarq_private.guard_documento_reference()') IS NULL
     OR to_regprocedure('engmarq_private.guard_treinamento_write()') IS NULL
     OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname IN ('user_profiles','colaboradores','funcoes','setores','ambientes',
       'treinamentos','matriz_treinamentos','treinamento_tipos') AND NOT c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='documentos' AND NOT public
       AND file_size_limit=10485760 AND cardinality(allowed_mime_types)=7
       AND allowed_mime_types @> ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']) THEN
    RAISE EXCEPTION '021 requires completed 017/019/020/018 and private Storage';
  END IF;
END $$;

-- Only known 014/015 Users bodies are supported. Unknown drift must be reviewed.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('engmarq_private.can_manage_profile(uuid,public.user_role)')
  AND md5(replace(prosrc,E'\r\n',E'\n')) IN ('d480fa6014b6f8d31f7de479ebe4a087','4536fbb1e37b2407a080dafd59284ac0'))
 OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('engmarq_private.guard_profile_update()')
  AND md5(replace(prosrc,E'\r\n',E'\n')) IN ('49f698e85e928d639557804e7d9612de','5332dfa20dc5ad8f8b8a33f31102478c')) THEN
  RAISE EXCEPTION '021 requires known Users 014/015 bodies; review unknown drift';
 END IF;
END $$;
-- Restore the exact tenant-only 015 semantics, preserving signatures and trigger.
CREATE OR REPLACE FUNCTION engmarq_private.can_manage_profile(
  target_empresa uuid, target_role public.user_role DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND p.active AND e.status = 'ativa'
      AND p.role IN ('gestor', 'empresa')
      AND p.empresa_id = target_empresa
      AND (target_role IS NULL OR target_role <> 'admin')
  );
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_manage_profile(uuid, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_manage_profile(uuid, public.user_role) TO authenticated;

CREATE OR REPLACE FUNCTION engmarq_private.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor record;
BEGIN
  -- Trusted service_role provisioning and migration-owner maintenance remain
  -- explicit privileged operations. Browser requests use authenticated.
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT p.id, p.role, p.empresa_id, p.active, e.status AS company_status
    INTO actor
    FROM public.user_profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid()
    FOR SHARE OF p, e;

  IF NOT FOUND OR NOT actor.active OR actor.company_status <> 'ativa'
     OR actor.role NOT IN ('gestor', 'empresa')
     OR OLD.id = actor.id
     OR (to_jsonb(NEW) - ARRAY['role', 'active']) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['role', 'active']) THEN
    RAISE EXCEPTION 'Profile update denied' USING ERRCODE = '42501';
  END IF;

  IF (
    OLD.empresa_id <> actor.empresa_id OR NEW.empresa_id <> actor.empresa_id
    OR OLD.role = 'admin' OR NEW.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Profile update denied' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.guard_profile_update() FROM PUBLIC, anon, authenticated;

-- Old public helpers remain for legacy modules; fix name resolution without
-- changing their return semantics or granting any new functional privilege.
CREATE OR REPLACE FUNCTION public.get_user_empresa_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.empresa_id FROM public.user_profiles p WHERE p.id=auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.role FROM public.user_profiles p WHERE p.id=auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_user_empresa_id(),public.get_user_role() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id(),public.get_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION engmarq_private.can_access_documento_row(target_empresa uuid, for_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT current_setting('role',true)='authenticated'
    AND engmarq_private.can_access_catalogos(target_empresa,for_write)
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_access_documento_row(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_access_documento_row(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION engmarq_private.can_access_empresa(target_empresa uuid, for_write boolean DEFAULT false, for_insert boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT current_setting('role',true)='authenticated' AND EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid() AND p.active AND (
      p.role='admin' OR (NOT for_insert AND p.empresa_id=target_empresa
        AND (p.role IN ('empresa','gestor') OR (NOT for_write AND p.role='operacional'))
        AND (NOT for_write OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id=target_empresa AND e.status='ativa')))
    )
  )
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_access_empresa(uuid,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_access_empresa(uuid,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION engmarq_private.guard_empresa_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor record;
  editable text[] := ARRAY['razao_social','cnpj','setor','cidade','uf','responsavel','email','telefone','logo_url'];
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
  SELECT p.role,p.active,p.empresa_id INTO actor FROM public.user_profiles p WHERE p.id=auth.uid() FOR SHARE;
  IF NOT FOUND OR NOT actor.active THEN RAISE EXCEPTION 'Company write denied' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Immutable company fields' USING ERRCODE='42501';
    END IF;
    IF actor.role<>'admin' AND (actor.role NOT IN ('empresa','gestor') OR OLD.id<>actor.empresa_id
      OR OLD.status<>'ativa' OR (to_jsonb(NEW)-editable) IS DISTINCT FROM (to_jsonb(OLD)-editable)) THEN
      RAISE EXCEPTION 'Administrative company fields denied' USING ERRCODE='42501';
    END IF;
  ELSIF actor.role<>'admin' THEN
    RAISE EXCEPTION 'Only platform admin may create companies' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION engmarq_private.guard_empresa_write() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_empresa_write ON public.empresas;
CREATE TRIGGER guard_empresa_write BEFORE INSERT OR UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_empresa_write();

-- This tenant FK closes AT06 without starting the Exames/ASO API migration.
-- Validate existing rows; abort rather than changing any inconsistent reference.
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_colaborador_id_fkey;
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_colaborador_tenant_fkey;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_colaborador_tenant_fkey
  FOREIGN KEY (empresa_id,colaborador_id) REFERENCES public.colaboradores(empresa_id,id);

CREATE OR REPLACE FUNCTION engmarq_private.guard_documento_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor record;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'authenticated' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT p.empresa_id,p.role,p.active,e.status INTO actor
    FROM public.user_profiles p JOIN public.empresas e ON e.id=p.empresa_id
    WHERE p.id=auth.uid() FOR SHARE OF p,e;
  IF NOT FOUND OR NOT actor.active OR actor.status<>'ativa' OR actor.role NOT IN ('empresa','gestor') THEN
    RAISE EXCEPTION 'Document metadata write denied' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.empresa_id<>actor.empresa_id THEN RAISE EXCEPTION 'Foreign document' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.empresa_id<>actor.empresa_id OR (TG_OP='UPDATE' AND (
    OLD.empresa_id<>actor.empresa_id OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id)) THEN
    RAISE EXCEPTION 'Immutable document identity or foreign tenant' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION engmarq_private.guard_documento_metadata() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_documento_metadata ON public.documentos;
CREATE TRIGGER guard_documento_metadata BEFORE INSERT OR UPDATE OR DELETE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_documento_metadata();

-- Explicit replacement of known policies; unexpected drift aborts the whole transaction.
DO $$ DECLARE r record; col record; t text; allowed text[]; BEGIN
  FOREACH t IN ARRAY ARRAY['documentos','empresas'] LOOP
    allowed := CASE WHEN t='documentos' THEN ARRAY['documentos_select','documentos_write',
      'documentos_insert','documentos_update','documentos_delete','documentos_row_guard']
      ELSE ARRAY['empresa_select','empresa_insert_admin','empresa_update_admin','empresa_delete_admin',
        'empresas_select','empresas_insert','empresas_update','empresas_row_guard'] END;
    IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND NOT policyname=ANY(allowed)) THEN
      RAISE EXCEPTION 'Unexpected policies on %; review drift before 021',t;
    END IF;
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',col.attname,t);
    END LOOP;
  END LOOP;
END $$;
CREATE POLICY documentos_select ON public.documentos FOR SELECT TO authenticated
USING (engmarq_private.can_access_documento_row(empresa_id));
CREATE POLICY documentos_insert ON public.documentos FOR INSERT TO authenticated
WITH CHECK (engmarq_private.can_access_documento_row(empresa_id,true));
CREATE POLICY documentos_update ON public.documentos FOR UPDATE TO authenticated
USING (engmarq_private.can_access_documento_row(empresa_id,true)) WITH CHECK (engmarq_private.can_access_documento_row(empresa_id,true));
CREATE POLICY documentos_delete ON public.documentos FOR DELETE TO authenticated
USING (engmarq_private.can_access_documento_row(empresa_id,true));
CREATE POLICY documentos_row_guard ON public.documentos AS RESTRICTIVE FOR ALL TO authenticated
USING (engmarq_private.can_access_documento_row(empresa_id)) WITH CHECK (engmarq_private.can_access_documento_row(empresa_id,true));
GRANT SELECT,DELETE ON public.documentos TO authenticated;
GRANT INSERT (empresa_id,tipo_id,titulo,numero,emissao,vencimento,observacoes,arquivo_path,colaborador_id,subtipo_exame)
ON public.documentos TO authenticated;
GRANT UPDATE (tipo_id,titulo,numero,emissao,vencimento,observacoes,arquivo_path,colaborador_id,subtipo_exame)
ON public.documentos TO authenticated;

CREATE POLICY empresas_select ON public.empresas FOR SELECT TO authenticated
USING (engmarq_private.can_access_empresa(id));
CREATE POLICY empresas_insert ON public.empresas FOR INSERT TO authenticated
WITH CHECK (engmarq_private.can_access_empresa(id,true,true));
CREATE POLICY empresas_update ON public.empresas FOR UPDATE TO authenticated
USING (engmarq_private.can_access_empresa(id,true)) WITH CHECK (engmarq_private.can_access_empresa(id,true));
CREATE POLICY empresas_row_guard ON public.empresas AS RESTRICTIVE FOR ALL TO authenticated
USING (engmarq_private.can_access_empresa(id)) WITH CHECK (engmarq_private.can_access_empresa(id,true));
-- authenticated is shared by admin and tenant users: status needs a role-aware
-- trigger, not a blanket column revoke that would also break platform administration.
GRANT SELECT ON public.empresas TO authenticated;
GRANT INSERT (razao_social,cnpj,setor,cidade,uf,responsavel,email,telefone,logo_url,status),
UPDATE (razao_social,cnpj,setor,cidade,uf,responsavel,email,telefone,logo_url,status)
ON public.empresas TO authenticated;
ALTER VIEW public.vw_dashboard_documentos SET (security_invoker=true);
REVOKE ALL ON public.vw_dashboard_documentos FROM PUBLIC,anon,authenticated;
DO $$ DECLARE col record; BEGIN
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.vw_dashboard_documentos'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE ALL (%I) ON public.vw_dashboard_documentos FROM PUBLIC,anon,authenticated',col.attname);
  END LOOP;
END $$;
GRANT SELECT ON public.vw_dashboard_documentos TO authenticated;

-- EPI/assinaturas fora do escopo da 021; será tratado na migração própria do módulo EPI.
COMMIT;
