-- Requires 019. Same session: SET engmarq.storage_origin to the trusted project
-- origin verified against deployment configuration (no trailing slash).
BEGIN TRANSACTION READ ONLY;
DO $$
DECLARE d record; candidate text;
        origin text := current_setting('engmarq.storage_origin',true);
BEGIN
  IF origin IS NULL OR origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'Explicit trusted Storage origin required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='documentos') THEN
    RAISE EXCEPTION 'Required documentos bucket missing';
  END IF;
  FOR d IN SELECT empresa_id,arquivo_path,arquivo_url FROM public.documentos LOOP
    IF d.arquivo_url IS NOT NULL THEN
      candidate := engmarq_private.documento_legacy_path(d.arquivo_url,d.empresa_id,origin);
      IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=candidate) THEN
        RAISE EXCEPTION 'Legacy reference has no object';
      END IF;
    END IF;
    IF d.arquivo_path IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=d.arquivo_path
    ) THEN RAISE EXCEPTION 'Canonical reference has no object'; END IF;
  END LOOP;
END;
$$;
SELECT count(*) AS object_count,
  count(*) FILTER (WHERE metadata->>'mimetype' IS NULL OR metadata->>'mimetype' NOT IN (
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png')) AS incompatible_mime,
  count(*) FILTER (WHERE metadata->>'size' IS NULL OR (metadata->>'size')::bigint>10485760
    OR (metadata->>'size')::bigint<0) AS incompatible_size
FROM storage.objects WHERE bucket_id='documentos';
SELECT count(*) AS documents, count(arquivo_url) AS legacy_references,
  count(arquivo_path) AS canonical_references,
  count(*) FILTER (WHERE arquivo_path IS NULL AND arquivo_url IS NOT NULL) AS pending_backfill
FROM public.documentos;
ROLLBACK;
