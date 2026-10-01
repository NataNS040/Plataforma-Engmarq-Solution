-- Reviewed cutover only: requires 017 + 019 and the compatible frontend.
-- Operator must set engmarq.storage_origin to the trusted frontend project origin
-- on this SAME database session before running this file. No embedded project URL.
BEGIN;
LOCK TABLE public.documentos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE storage.buckets, storage.objects IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE origin text := current_setting('engmarq.storage_origin',true);
        d record; candidate text; invalid_count bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='documentos') THEN
    RAISE EXCEPTION 'Required documentos bucket missing';
  END IF;
  IF origin IS NULL OR origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'Explicit trusted Storage origin required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE
    tgrelid='public.documentos'::regclass AND tgname='trg_documento_status' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Unexpected document status trigger state; cutover aborted';
  END IF;
  -- Validate every reference, including legacy URLs retained after replacement.
  FOR d IN SELECT empresa_id,arquivo_url,arquivo_path FROM public.documentos LOOP
    IF d.arquivo_url IS NOT NULL THEN
      candidate := engmarq_private.documento_legacy_path(d.arquivo_url,d.empresa_id,origin);
      IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=candidate) THEN
        RAISE EXCEPTION 'Legacy document object missing; cutover aborted';
      END IF;
    END IF;
    IF d.arquivo_path IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=d.arquivo_path
    ) THEN RAISE EXCEPTION 'Canonical document object missing; cutover aborted'; END IF;
  END LOOP;
  SELECT count(*) INTO invalid_count FROM storage.objects o WHERE bucket_id='documentos' AND (
    name !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
    OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(o.name,'/',1))
    OR metadata->>'mimetype' IS NULL
    OR metadata->>'mimetype' NOT IN ('application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png')
    OR metadata->>'size' IS NULL OR (metadata->>'size')::bigint > 10485760
    OR (metadata->>'size')::bigint < 0
  );
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Storage inventory incompatible (% objects); cutover aborted',invalid_count;
  END IF;
END;
$$;

-- Only NULL canonical references are backfilled; URLs and objects are preserved.
-- Avoid unrelated status recalculation by the existing BEFORE UPDATE trigger.
-- These DDL changes are transactional and restore its original enabled state.
ALTER TABLE public.documentos DISABLE TRIGGER trg_documento_status;
UPDATE public.documentos SET arquivo_path = engmarq_private.documento_legacy_path(
  arquivo_url,empresa_id,current_setting('engmarq.storage_origin'))
WHERE arquivo_path IS NULL AND arquivo_url IS NOT NULL;
ALTER TABLE public.documentos ENABLE TRIGGER trg_documento_status;

CREATE FUNCTION engmarq_private.can_access_documento(object_name text, for_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT current_setting('role',true)='authenticated' AND EXISTS (
    SELECT 1 FROM public.user_profiles p JOIN public.empresas e ON e.id=p.empresa_id
    WHERE p.id=auth.uid() AND p.active AND e.status='ativa'
      AND object_name ~ ('^' || p.empresa_id::text || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')
      AND (p.role IN ('empresa','gestor') OR (NOT for_write AND p.role='operacional'))
  );
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_access_documento(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engmarq_private.can_access_documento(text,boolean) TO anon,authenticated;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documentos_storage_select ON storage.objects;
DROP POLICY IF EXISTS documentos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS documentos_storage_update ON storage.objects;
DROP POLICY IF EXISTS documentos_storage_delete ON storage.objects;
CREATE POLICY documentos_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='documentos' AND engmarq_private.can_access_documento(name));
CREATE POLICY documentos_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='documentos' AND engmarq_private.can_access_documento(name,true));
CREATE POLICY documentos_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='documentos' AND engmarq_private.can_access_documento(name,true) AND split_part(name,'/',2)<>'certificados')
  WITH CHECK (bucket_id='documentos' AND engmarq_private.can_access_documento(name,true) AND split_part(name,'/',2)<>'certificados');
CREATE POLICY documentos_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='documentos' AND engmarq_private.can_access_documento(name,true) AND split_part(name,'/',2)<>'certificados');

-- Restrictive guards protect this bucket even in the presence of unrelated or
-- unexpectedly broad permissive policies. Other buckets keep their own policies.
CREATE POLICY documentos_tenant_select_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (bucket_id<>'documentos' OR engmarq_private.can_access_documento(name));
CREATE POLICY documentos_tenant_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (bucket_id<>'documentos' OR engmarq_private.can_access_documento(name,true));
CREATE POLICY documentos_tenant_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (bucket_id<>'documentos' OR (engmarq_private.can_access_documento(name,true) AND split_part(name,'/',2)<>'certificados'))
  WITH CHECK (bucket_id<>'documentos' OR (engmarq_private.can_access_documento(name,true) AND split_part(name,'/',2)<>'certificados'));
CREATE POLICY documentos_tenant_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (bucket_id<>'documentos' OR (engmarq_private.can_access_documento(name,true) AND split_part(name,'/',2)<>'certificados'));

CREATE FUNCTION engmarq_private.guard_documento_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('role',true)='authenticated' THEN
    IF (TG_OP='INSERT' AND NEW.arquivo_url IS NOT NULL) OR
       (TG_OP='UPDATE' AND NEW.arquivo_url IS DISTINCT FROM OLD.arquivo_url) THEN
      RAISE EXCEPTION 'Legacy document URLs are read-only' USING ERRCODE='42501';
    END IF;
    IF TG_OP='UPDATE' AND NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
      RAISE EXCEPTION 'Document tenant is immutable' USING ERRCODE='42501';
    END IF;
    IF (TG_OP='INSERT' AND NEW.arquivo_path IS NOT NULL) OR
       (TG_OP='UPDATE' AND NEW.arquivo_path IS DISTINCT FROM OLD.arquivo_path) THEN
      IF TG_OP='UPDATE' AND OLD.arquivo_path IS NOT NULL AND
         NOT engmarq_private.can_access_documento(OLD.arquivo_path,true) THEN
        RAISE EXCEPTION 'Document reference write denied' USING ERRCODE='42501';
      END IF;
      IF NEW.arquivo_path IS NOT NULL AND (
        NOT engmarq_private.can_access_documento(NEW.arquivo_path,true) OR
        NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=NEW.arquivo_path)
      ) THEN RAISE EXCEPTION 'Invalid document object reference' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.guard_documento_reference() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_documento_reference BEFORE INSERT OR UPDATE ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_documento_reference();

UPDATE storage.buckets SET public=false, file_size_limit=10485760,
  allowed_mime_types=ARRAY['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']
WHERE id='documentos';
COMMIT;
