-- Execute on a NEW read-only database session. Never reapply 018 to investigate.
BEGIN TRANSACTION READ ONLY;
DO $$
BEGIN
  IF to_regprocedure('engmarq_private.can_access_catalogos(uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION '017 prerequisite missing; stop deployment';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname IN
    ('colaboradores_empresa_id_id_key','treinamentos_certificado_path_check'))
    OR to_regprocedure('engmarq_private.guard_treinamento_write()') IS NOT NULL
    OR to_regprocedure('engmarq_private.can_access_certificado(text,boolean)') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgname='guard_treinamento_write')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE
      (schemaname='storage' AND policyname IN ('certificados_select_guard','certificados_insert_guard',
        'certificados_update_guard','certificados_delete_guard')) OR
      (schemaname='public' AND tablename IN ('treinamentos','matriz_treinamentos') AND
        policyname NOT IN ('treinamentos_select','treinamentos_write','matriz_select','matriz_write')))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='vw_dashboard_treinamentos' AND
        'security_invoker=true'=ANY(coalesce(c.reloptions,ARRAY[]::text[])))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.contype='f' AND
      c.conrelid IN ('public.treinamentos'::regclass,'public.matriz_treinamentos'::regclass) AND
      c.conname IN ('treinamentos_colaborador_id_fkey','matriz_treinamentos_funcao_id_fkey') AND cardinality(c.conkey)<>1)
  THEN RAISE EXCEPTION '018 footprint or unexpected drift found; stop deployment and review'; END IF;
END;
$$;
DO $$
DECLARE applied_count bigint;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = ''018'''
      INTO applied_count;
    IF applied_count > 0 THEN RAISE EXCEPTION '018 recorded as applied; stop and review'; END IF;
  END IF;
END;
$$;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='documentos';
-- Catalog definitions contain no real object names or personal records.
SELECT policyname,roles,cmd,permissive,qual,with_check FROM pg_catalog.pg_policies
  WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_catalog.pg_policies
  WHERE schemaname='public' AND tablename IN ('treinamentos','matriz_treinamentos','treinamento_tipos');
SELECT table_name,grantee,privilege_type FROM information_schema.table_privileges
  WHERE table_schema='public' AND table_name IN ('treinamentos','matriz_treinamentos','treinamento_tipos','vw_dashboard_treinamentos');
SELECT table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name IN ('treinamentos','matriz_treinamentos','treinamento_tipos','vw_dashboard_treinamentos');
SELECT count(*) AS documentos, count(arquivo_url) AS legacy_references FROM public.documentos;
SELECT count(*) AS object_count FROM storage.objects WHERE bucket_id='documentos';
SELECT count(*) AS invalid_training_employee_tenants FROM public.treinamentos t
  LEFT JOIN public.colaboradores c ON c.id=t.colaborador_id AND c.empresa_id=t.empresa_id
  WHERE c.id IS NULL;
SELECT count(*) AS invalid_requirement_function_tenants FROM public.matriz_treinamentos m
  LEFT JOIN public.funcoes f ON f.id=m.funcao_id AND f.empresa_id=m.empresa_id
  WHERE f.id IS NULL;
SELECT count(*) AS invalid_certificate_paths FROM public.treinamentos
  WHERE certificado_url IS NOT NULL AND certificado_url !~
    ('^' || empresa_id::text || '/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$');
-- Absence must also be verified against migration history, if your runner uses it.
SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS migration_history_available;
ROLLBACK;
