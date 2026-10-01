-- Requires 016. Security only: no business-data changes, no FK/index replacement.
BEGIN;
LOCK TABLE public.funcoes, public.setores, public.ambientes IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION engmarq_private.can_access_catalogos(target_empresa uuid, for_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND p.active AND e.status = 'ativa'
      AND p.empresa_id = target_empresa
      AND (p.role IN ('empresa', 'gestor') OR (NOT for_write AND p.role = 'operacional'))
  );
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_access_catalogos(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_access_catalogos(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION engmarq_private.guard_catalogo_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor record;
  editable text[] := ARRAY['nome','descricao','active'];
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  SELECT p.empresa_id, p.role, p.active, e.status AS company_status INTO actor
    FROM public.user_profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() FOR SHARE OF p, e;
  IF NOT FOUND OR NOT actor.active OR actor.company_status <> 'ativa'
     OR actor.role NOT IN ('empresa','gestor') OR NEW.empresa_id IS DISTINCT FROM actor.empresa_id THEN
    RAISE EXCEPTION 'Catalog write denied' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'funcoes' THEN editable := editable || ARRAY['riscos']; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.empresa_id IS DISTINCT FROM actor.empresa_id
       OR (to_jsonb(NEW) - editable) IS DISTINCT FROM (to_jsonb(OLD) - editable) THEN
      RAISE EXCEPTION 'Immutable catalog fields' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'New catalog must be active' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.guard_catalogo_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  catalog text;
  col record;
  write_columns text;
BEGIN
  FOREACH catalog IN ARRAY ARRAY['funcoes','setores','ambientes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', catalog);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', catalog || '_select', catalog);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', catalog || '_write', catalog);
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename=catalog) THEN
      RAISE EXCEPTION 'Unexpected policies on %; review schema drift before applying 017', catalog;
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (engmarq_private.can_access_catalogos(empresa_id))', catalog || '_select', catalog);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (engmarq_private.can_access_catalogos(empresa_id, true))', catalog || '_insert', catalog);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (engmarq_private.can_access_catalogos(empresa_id, true)) WITH CHECK (engmarq_private.can_access_catalogos(empresa_id, true))', catalog || '_update', catalog);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', catalog);
    -- Table REVOKE does not remove old column-level grants.
    FOR col IN SELECT attname FROM pg_catalog.pg_attribute
      WHERE attrelid=format('public.%I', catalog)::regclass AND attnum > 0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated', col.attname, catalog);
    END LOOP;
    write_columns := 'nome, descricao, active' || CASE WHEN catalog='funcoes' THEN ', riscos' ELSE '' END;
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', catalog);
    EXECUTE format('GRANT INSERT (empresa_id, %s) ON public.%I TO authenticated', write_columns, catalog);
    EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated', write_columns, catalog);
    EXECUTE format('CREATE TRIGGER guard_catalogo_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_catalogo_write()', catalog);
  END LOOP;
END;
$$;
COMMIT;
