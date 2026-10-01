-- Expand only. Deployment order for the failed-018 environment is documented in
-- docs/STORAGE_DOCUMENTOS.md; do not run pending migrations in numeric order.
BEGIN;
ALTER TABLE public.documentos ADD COLUMN arquivo_path text;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_arquivo_path_check CHECK (
  arquivo_path IS NULL OR arquivo_path ~
    ('^' || empresa_id::text || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')
);
COMMENT ON COLUMN public.documentos.arquivo_path IS 'Canonical documentos object path; never a URL';
GRANT SELECT (arquivo_path), INSERT (arquivo_path), UPDATE (arquivo_path) ON public.documentos TO authenticated;

CREATE FUNCTION engmarq_private.documento_legacy_path(reference text, company uuid, origin text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE prefix text; object_path text;
BEGIN
  IF origin IS NULL OR origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
    RAISE EXCEPTION 'Explicit trusted Storage origin required';
  END IF;
  prefix := origin || '/storage/v1/object/public/documentos/';
  IF reference IS NULL OR left(reference,length(prefix)) <> prefix THEN
    RAISE EXCEPTION 'Unrecognized legacy document reference';
  END IF;
  object_path := substr(reference,length(prefix)+1);
  IF company IS NULL OR object_path !~ ('^' || company::text || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$') THEN
    RAISE EXCEPTION 'Invalid legacy document tenant/path';
  END IF;
  RETURN object_path;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.documento_legacy_path(text,uuid,text) FROM PUBLIC,anon,authenticated;
COMMIT;
