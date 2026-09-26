-- User administration: JWT/RLS for reads and edits; Auth provisioning remains
-- server-side. Apply as migration owner, after 013, before deploying the API.
BEGIN;

CREATE SCHEMA IF NOT EXISTS engmarq_private;
REVOKE ALL ON SCHEMA engmarq_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA engmarq_private TO authenticated;

-- No recursive RLS lookup and no caller-supplied actor identity. This schema
-- must not be added to PostgREST's exposed schemas.
CREATE OR REPLACE FUNCTION engmarq_private.can_manage_profile(
  target_empresa uuid, target_role public.user_role DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND p.active AND e.status = 'ativa'
      AND (
        p.role = 'admin'
        OR (p.role IN ('gestor', 'empresa') AND p.empresa_id = target_empresa
            AND (target_role IS NULL OR target_role <> 'admin'))
      )
  );
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_manage_profile(uuid, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_manage_profile(uuid, public.user_role) TO authenticated;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select ON public.user_profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON public.user_profiles;
DROP POLICY IF EXISTS profiles_update_admin ON public.user_profiles;
DROP POLICY IF EXISTS profiles_update_managers ON public.user_profiles;

-- Own profile remains readable even when inactive so AuthProvider can show the
-- existing unavailable-account screen. Operational users cannot read the team.
CREATE POLICY profiles_select ON public.user_profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR engmarq_private.can_manage_profile(empresa_id));

-- USING checks the old row; WITH CHECK checks the new row. A manager cannot
-- edit an existing admin or promote a non-admin. No self role/status changes.
CREATE POLICY profiles_update_managers ON public.user_profiles FOR UPDATE TO authenticated
USING (id <> auth.uid() AND engmarq_private.can_manage_profile(empresa_id, role))
WITH CHECK (id <> auth.uid() AND engmarq_private.can_manage_profile(empresa_id, role));

-- Revoke both table AND any historical column grants. Restrict writes to the
-- only fields edited by the UI. No direct INSERT/DELETE/TRUNCATE for clients.
REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, email, full_name, role, empresa_id, active, created_at),
       UPDATE (id, email, full_name, role, empresa_id, active, created_at)
ON public.user_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT UPDATE (role, active) ON public.user_profiles TO authenticated;

-- Recheck the actor under row locks at write time, even if the HTTP request or
-- RLS snapshot saw an older role/status. Concurrent mutual admin demotions
-- cannot both commit: actor/target locks serialize them or abort a deadlock.
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
     OR actor.role NOT IN ('admin', 'gestor', 'empresa')
     OR OLD.id = actor.id
     OR (to_jsonb(NEW) - ARRAY['role', 'active']) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['role', 'active']) THEN
    RAISE EXCEPTION 'Profile update denied' USING ERRCODE = '42501';
  END IF;

  IF actor.role <> 'admin' AND (
    OLD.empresa_id <> actor.empresa_id OR NEW.empresa_id <> actor.empresa_id
    OR OLD.role = 'admin' OR NEW.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Profile update denied' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.guard_profile_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_profile_update ON public.user_profiles;
CREATE TRIGGER guard_profile_update BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_profile_update();

COMMIT;
