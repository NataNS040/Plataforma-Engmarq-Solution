-- Functional user administration belongs only to the tenant.
-- Requires the already-applied 014; preserves its policies, grants and trigger.
-- The technical service_role provisioning path remains privileged.
BEGIN;

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

COMMIT;
