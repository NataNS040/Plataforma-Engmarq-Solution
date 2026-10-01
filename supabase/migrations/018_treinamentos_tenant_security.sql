-- Requires 017. No data repair: incompatible legacy relationships abort atomically.
BEGIN;
LOCK TABLE public.treinamentos, public.matriz_treinamentos, public.colaboradores IN SHARE ROW EXCLUSIVE MODE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='documentos' AND public=false) THEN
    RAISE EXCEPTION 'Private documentos bucket required; review storage drift before applying 018';
  END IF;
END; $$;

ALTER TABLE public.colaboradores ADD CONSTRAINT colaboradores_empresa_id_id_key UNIQUE (empresa_id, id);
ALTER TABLE public.treinamentos
  DROP CONSTRAINT treinamentos_colaborador_id_fkey,
  ADD CONSTRAINT treinamentos_colaborador_id_fkey FOREIGN KEY (empresa_id,colaborador_id)
    REFERENCES public.colaboradores(empresa_id,id),
  ADD CONSTRAINT treinamentos_certificado_path_check CHECK (certificado_url IS NULL OR
    certificado_url ~ ('^' || empresa_id::text || '/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'));
ALTER TABLE public.matriz_treinamentos
  DROP CONSTRAINT matriz_treinamentos_funcao_id_fkey,
  ADD CONSTRAINT matriz_treinamentos_funcao_id_fkey FOREIGN KEY (empresa_id,funcao_id)
    REFERENCES public.funcoes(empresa_id,id);

-- Preserve the existing columns/calculation, but make the view obey caller RLS.
ALTER VIEW public.vw_dashboard_treinamentos SET (security_invoker = true);

CREATE FUNCTION engmarq_private.guard_treinamento_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor record;
  editable text[];
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT p.empresa_id,p.role,p.active,e.status INTO actor
    FROM public.user_profiles p JOIN public.empresas e ON e.id=p.empresa_id
    WHERE p.id=auth.uid() FOR SHARE OF p,e;
  IF NOT FOUND OR NOT actor.active OR actor.status <> 'ativa' OR actor.role NOT IN ('empresa','gestor') THEN
    RAISE EXCEPTION 'Training write denied' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME <> 'matriz_treinamentos' OR OLD.empresa_id IS DISTINCT FROM actor.empresa_id THEN
      RAISE EXCEPTION 'History deletion denied' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM actor.empresa_id THEN
    RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE='42501';
  END IF;
  editable := CASE WHEN TG_TABLE_NAME='treinamentos' THEN
    ARRAY['colaborador_id','treinamento_tipo_id','data_realizacao','data_vencimento','carga_horaria','instrutor','modalidade','certificado_url','status']
    ELSE ARRAY['obrigatorio'] END;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-editable) IS DISTINCT FROM (to_jsonb(OLD)-editable) THEN
    RAISE EXCEPTION 'Immutable training fields' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.guard_treinamento_write() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE t text; prefix text; cols text; col record;
BEGIN
  FOREACH t IN ARRAY ARRAY['treinamentos','matriz_treinamentos'] LOOP
    prefix := CASE WHEN t='treinamentos' THEN 'treinamentos' ELSE 'matriz' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',prefix || '_select',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',prefix || '_write',t);
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename=t) THEN
      RAISE EXCEPTION 'Unexpected policies on %, review drift before applying 018',t;
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (engmarq_private.can_access_catalogos(empresa_id))',prefix || '_select',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (engmarq_private.can_access_catalogos(empresa_id,true))',prefix || '_insert',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (engmarq_private.can_access_catalogos(empresa_id,true)) WITH CHECK (engmarq_private.can_access_catalogos(empresa_id,true))',prefix || '_update',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    FOR col IN SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',col.attname,t);
    END LOOP;
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    cols := CASE WHEN t='treinamentos' THEN 'colaborador_id,treinamento_tipo_id,data_realizacao,data_vencimento,carga_horaria,instrutor,modalidade,certificado_url'
      ELSE 'funcao_id,treinamento_tipo_id,obrigatorio' END;
    EXECUTE format('GRANT INSERT (empresa_id,%s) ON public.%I TO authenticated',cols,t);
    EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated',CASE WHEN t='treinamentos' THEN cols ELSE 'obrigatorio' END,t);
    EXECUTE format('CREATE TRIGGER guard_treinamento_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_treinamento_write()',t);
  END LOOP;
END;
$$;
-- Requirements are configuration, not completed history; no training FK points here.
CREATE POLICY matriz_delete ON public.matriz_treinamentos FOR DELETE TO authenticated
  USING (engmarq_private.can_access_catalogos(empresa_id,true));
GRANT DELETE ON public.matriz_treinamentos TO authenticated;

REVOKE ALL ON public.treinamento_tipos FROM PUBLIC,anon,authenticated;
DO $$
DECLARE t text; col record;
BEGIN
  FOREACH t IN ARRAY ARRAY['treinamento_tipos','vw_dashboard_treinamentos'] LOOP
    FOR col IN SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated',col.attname,t);
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='treinamento_tipos' AND policyname <> 'treinamento_tipos_read') THEN
    RAISE EXCEPTION 'Unexpected policies on treinamento_tipos; review drift before applying 018';
  END IF;
END; $$;
ALTER TABLE public.treinamento_tipos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.treinamento_tipos TO authenticated;
DROP POLICY IF EXISTS treinamento_tipos_read ON public.treinamento_tipos;
CREATE POLICY treinamento_tipos_read ON public.treinamento_tipos FOR SELECT TO authenticated
  USING (engmarq_private.can_access_catalogos(public.get_user_empresa_id()));
REVOKE ALL ON public.vw_dashboard_treinamentos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vw_dashboard_treinamentos TO authenticated;

-- Narrow restrictive policies supplement existing shared-bucket policies.
-- Certificate objects remain immutable so historical references cannot be destroyed.
CREATE FUNCTION engmarq_private.can_access_certificado(object_name text, for_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles p JOIN public.empresas e ON e.id=p.empresa_id
    WHERE p.id=auth.uid() AND p.active AND e.status='ativa'
      AND split_part(object_name,'/',1)=p.empresa_id::text
      AND object_name ~ ('^' || p.empresa_id::text || '/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')
      AND (p.role IN ('empresa','gestor') OR (NOT for_write AND p.role='operacional')));
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_access_certificado(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_access_certificado(text,boolean) TO authenticated;
CREATE POLICY certificados_select_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'documentos' OR split_part(name,'/',2) <> 'certificados' OR engmarq_private.can_access_certificado(name));
CREATE POLICY certificados_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'documentos' OR split_part(name,'/',2) <> 'certificados' OR engmarq_private.can_access_certificado(name,true));
CREATE POLICY certificados_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'documentos' OR split_part(name,'/',2) <> 'certificados')
  WITH CHECK (bucket_id <> 'documentos' OR split_part(name,'/',2) <> 'certificados');
CREATE POLICY certificados_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'documentos' OR split_part(name,'/',2) <> 'certificados');
COMMIT;
