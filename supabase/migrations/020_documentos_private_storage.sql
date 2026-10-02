-- ============================================================
-- MIGRATION 020 — DOCUMENTOS PRIVATE STORAGE
-- Hosted Supabase Storage
--
-- Requer:
--   - Migration 017
--   - Migration 019
--   - Frontend/backend compatíveis com arquivo_path + signed URL
--
-- IMPORTANTE:
-- Executar ESTE SCRIPT INTEIRO em uma única execução.
-- ============================================================


-- ------------------------------------------------------------
-- 1. TRUSTED STORAGE ORIGIN
-- ------------------------------------------------------------

SET engmarq.storage_origin = 'https://kkjckayiqvlqpdjyoxyv.supabase.co';


-- Confirma que o origin foi realmente definido nesta sessão
-- antes de iniciar o cutover.

DO $$
BEGIN
  IF current_setting('engmarq.storage_origin', true)
     IS DISTINCT FROM 'https://kkjckayiqvlqpdjyoxyv.supabase.co' THEN
    RAISE EXCEPTION
      'Trusted Storage origin was not configured correctly';
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 2. INÍCIO DA TRANSAÇÃO
-- ------------------------------------------------------------

BEGIN;


-- Evita alterações concorrentes durante o cutover.

LOCK TABLE public.documentos
  IN SHARE ROW EXCLUSIVE MODE;

LOCK TABLE storage.buckets, storage.objects
  IN SHARE ROW EXCLUSIVE MODE;


-- ------------------------------------------------------------
-- 3. CONFIRMAR RLS DO STORAGE
-- ------------------------------------------------------------
--
-- storage.objects pertence ao Supabase Storage.
-- NÃO executar ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
-- Apenas verificamos que o RLS já está habilitado.
-- ------------------------------------------------------------

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class
    WHERE oid = 'storage.objects'::regclass
      AND relrowsecurity
  ) THEN

    RAISE EXCEPTION
      'Storage RLS must already be enabled by Supabase; cutover aborted';

  END IF;

END;
$$;


-- ------------------------------------------------------------
-- 4. VALIDAÇÃO DO INVENTÁRIO ANTES DO CUTOVER
-- ------------------------------------------------------------

DO $$
DECLARE
  origin text :=
    current_setting('engmarq.storage_origin', true);

  d record;
  candidate text;
  invalid_count bigint;

BEGIN

  -- Bucket documentos precisa existir.

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'documentos'
  ) THEN

    RAISE EXCEPTION
      'Required documentos bucket missing';

  END IF;


  -- Origin precisa estar explicitamente configurado.

  IF origin IS NULL
     OR origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN

    RAISE EXCEPTION
      'Explicit trusted Storage origin required';

  END IF;


  -- Trigger existente de status precisa estar habilitado.

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.documentos'::regclass
      AND tgname = 'trg_documento_status'
      AND tgenabled = 'O'
  ) THEN

    RAISE EXCEPTION
      'Unexpected document status trigger state; cutover aborted';

  END IF;


  -- ----------------------------------------------------------
  -- Validar referências existentes
  -- ----------------------------------------------------------

  FOR d IN
    SELECT
      empresa_id,
      arquivo_url,
      arquivo_path
    FROM public.documentos

  LOOP

    -- Referência legada.

    IF d.arquivo_url IS NOT NULL THEN

      candidate :=
        engmarq_private.documento_legacy_path(
          d.arquivo_url,
          d.empresa_id,
          origin
        );

      IF NOT EXISTS (
        SELECT 1
        FROM storage.objects
        WHERE bucket_id = 'documentos'
          AND name = candidate
      ) THEN

        RAISE EXCEPTION
          'Legacy document object missing; cutover aborted';

      END IF;

    END IF;


    -- Referência canônica existente.

    IF d.arquivo_path IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM storage.objects
         WHERE bucket_id = 'documentos'
           AND name = d.arquivo_path
       ) THEN

      RAISE EXCEPTION
        'Canonical document object missing; cutover aborted';

    END IF;

  END LOOP;


  -- ----------------------------------------------------------
  -- Validar todos os objetos do bucket
  -- ----------------------------------------------------------

  SELECT count(*)
  INTO invalid_count
  FROM storage.objects o
  WHERE bucket_id = 'documentos'
    AND (

      name !~
        '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'

      OR NOT EXISTS (
        SELECT 1
        FROM public.empresas e
        WHERE e.id::text = split_part(o.name, '/', 1)
      )

      OR metadata->>'mimetype' IS NULL

      OR metadata->>'mimetype' NOT IN (
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png'
      )

      OR metadata->>'size' IS NULL

      OR (metadata->>'size')::bigint > 10485760

      OR (metadata->>'size')::bigint < 0
    );


  IF invalid_count > 0 THEN

    RAISE EXCEPTION
      'Storage inventory incompatible (% objects); cutover aborted',
      invalid_count;

  END IF;

END;
$$;


-- ------------------------------------------------------------
-- 5. BACKFILL arquivo_url -> arquivo_path
-- ------------------------------------------------------------
--
-- Apenas registros sem arquivo_path são convertidos.
-- arquivo_url é preservado para compatibilidade.
--
-- O trigger de status é temporariamente desabilitado para
-- evitar recalcular status por uma alteração puramente técnica.
-- ------------------------------------------------------------

ALTER TABLE public.documentos
  DISABLE TRIGGER trg_documento_status;


UPDATE public.documentos

SET arquivo_path =
  engmarq_private.documento_legacy_path(
    arquivo_url,
    empresa_id,
    current_setting('engmarq.storage_origin')
  )

WHERE arquivo_path IS NULL
  AND arquivo_url IS NOT NULL;


ALTER TABLE public.documentos
  ENABLE TRIGGER trg_documento_status;


-- ------------------------------------------------------------
-- 6. AUTORIZAÇÃO CENTRALIZADA DO STORAGE
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION
  engmarq_private.can_access_documento(
    object_name text,
    for_write boolean DEFAULT false
  )

RETURNS boolean

LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''

AS $$

  SELECT

    current_setting('role', true) = 'authenticated'

    AND EXISTS (

      SELECT 1

      FROM public.user_profiles p

      JOIN public.empresas e
        ON e.id = p.empresa_id

      WHERE p.id = auth.uid()

        AND p.active

        AND e.status = 'ativa'

        AND object_name ~ (
          '^'
          || p.empresa_id::text
          || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
        )

        AND (
          p.role IN ('empresa', 'gestor')

          OR (
            NOT for_write
            AND p.role = 'operacional'
          )
        )
    );

$$;


REVOKE ALL
ON FUNCTION
  engmarq_private.can_access_documento(text, boolean)
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION
  engmarq_private.can_access_documento(text, boolean)
TO anon, authenticated;


-- ------------------------------------------------------------
-- 7. POLICIES PRINCIPAIS DO BUCKET documentos
-- ------------------------------------------------------------

DROP POLICY IF EXISTS
  documentos_storage_select
ON storage.objects;

DROP POLICY IF EXISTS
  documentos_storage_insert
ON storage.objects;

DROP POLICY IF EXISTS
  documentos_storage_update
ON storage.objects;

DROP POLICY IF EXISTS
  documentos_storage_delete
ON storage.objects;


-- SELECT

CREATE POLICY documentos_storage_select

ON storage.objects

FOR SELECT

TO authenticated

USING (
  bucket_id = 'documentos'
  AND engmarq_private.can_access_documento(name)
);


-- INSERT

CREATE POLICY documentos_storage_insert

ON storage.objects

FOR INSERT

TO authenticated

WITH CHECK (
  bucket_id = 'documentos'
  AND engmarq_private.can_access_documento(name, true)
);


-- UPDATE

CREATE POLICY documentos_storage_update

ON storage.objects

FOR UPDATE

TO authenticated

USING (
  bucket_id = 'documentos'
  AND engmarq_private.can_access_documento(name, true)
  AND split_part(name, '/', 2) <> 'certificados'
)

WITH CHECK (
  bucket_id = 'documentos'
  AND engmarq_private.can_access_documento(name, true)
  AND split_part(name, '/', 2) <> 'certificados'
);


-- DELETE

CREATE POLICY documentos_storage_delete

ON storage.objects

FOR DELETE

TO authenticated

USING (
  bucket_id = 'documentos'
  AND engmarq_private.can_access_documento(name, true)
  AND split_part(name, '/', 2) <> 'certificados'
);


-- ------------------------------------------------------------
-- 8. RESTRICTIVE GUARDS
-- ------------------------------------------------------------
--
-- Protegem especificamente o bucket documentos mesmo que
-- existam outras policies permissivas no Storage.
--
-- Outros buckets continuam utilizando suas próprias policies.
-- ------------------------------------------------------------


-- SELECT GUARD

DROP POLICY IF EXISTS
  documentos_tenant_select_guard
ON storage.objects;


CREATE POLICY documentos_tenant_select_guard

ON storage.objects

AS RESTRICTIVE

FOR SELECT

TO PUBLIC

USING (
  bucket_id <> 'documentos'
  OR engmarq_private.can_access_documento(name)
);


-- INSERT GUARD

DROP POLICY IF EXISTS
  documentos_tenant_insert_guard
ON storage.objects;


CREATE POLICY documentos_tenant_insert_guard

ON storage.objects

AS RESTRICTIVE

FOR INSERT

TO PUBLIC

WITH CHECK (
  bucket_id <> 'documentos'
  OR engmarq_private.can_access_documento(name, true)
);


-- UPDATE GUARD

DROP POLICY IF EXISTS
  documentos_tenant_update_guard
ON storage.objects;


CREATE POLICY documentos_tenant_update_guard

ON storage.objects

AS RESTRICTIVE

FOR UPDATE

TO PUBLIC

USING (
  bucket_id <> 'documentos'

  OR (
    engmarq_private.can_access_documento(name, true)

    AND split_part(name, '/', 2) <> 'certificados'
  )
)

WITH CHECK (
  bucket_id <> 'documentos'

  OR (
    engmarq_private.can_access_documento(name, true)

    AND split_part(name, '/', 2) <> 'certificados'
  )
);


-- DELETE GUARD

DROP POLICY IF EXISTS
  documentos_tenant_delete_guard
ON storage.objects;


CREATE POLICY documentos_tenant_delete_guard

ON storage.objects

AS RESTRICTIVE

FOR DELETE

TO PUBLIC

USING (
  bucket_id <> 'documentos'

  OR (
    engmarq_private.can_access_documento(name, true)

    AND split_part(name, '/', 2) <> 'certificados'
  )
);


-- ------------------------------------------------------------
-- 9. PROTEGER REFERÊNCIAS EM public.documentos
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION
  engmarq_private.guard_documento_reference()

RETURNS trigger

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

  IF current_setting('role', true) = 'authenticated' THEN


    -- URLs legadas tornam-se somente leitura.

    IF (
      TG_OP = 'INSERT'
      AND NEW.arquivo_url IS NOT NULL
    )

    OR (
      TG_OP = 'UPDATE'
      AND NEW.arquivo_url IS DISTINCT FROM OLD.arquivo_url
    )

    THEN

      RAISE EXCEPTION
        'Legacy document URLs are read-only'
        USING ERRCODE = '42501';

    END IF;


    -- Tenant do documento é imutável.

    IF TG_OP = 'UPDATE'
       AND NEW.empresa_id IS DISTINCT FROM OLD.empresa_id

    THEN

      RAISE EXCEPTION
        'Document tenant is immutable'
        USING ERRCODE = '42501';

    END IF;


    -- Validar alterações em arquivo_path.

    IF (
      TG_OP = 'INSERT'
      AND NEW.arquivo_path IS NOT NULL
    )

    OR (
      TG_OP = 'UPDATE'
      AND NEW.arquivo_path IS DISTINCT FROM OLD.arquivo_path
    )

    THEN


      -- Referência anterior precisa ser autorizada.

      IF TG_OP = 'UPDATE'
         AND OLD.arquivo_path IS NOT NULL
         AND NOT engmarq_private.can_access_documento(
           OLD.arquivo_path,
           true
         )

      THEN

        RAISE EXCEPTION
          'Document reference write denied'
          USING ERRCODE = '42501';

      END IF;


      -- Nova referência precisa pertencer ao tenant
      -- e apontar para objeto existente.

      IF NEW.arquivo_path IS NOT NULL

         AND (

           NOT engmarq_private.can_access_documento(
             NEW.arquivo_path,
             true
           )

           OR NOT EXISTS (
             SELECT 1

             FROM storage.objects

             WHERE bucket_id = 'documentos'

               AND name = NEW.arquivo_path
           )
         )

      THEN

        RAISE EXCEPTION
          'Invalid document object reference'
          USING ERRCODE = '42501';

      END IF;

    END IF;

  END IF;


  RETURN NEW;

END;

$$;


REVOKE ALL
ON FUNCTION
  engmarq_private.guard_documento_reference()
FROM PUBLIC, anon, authenticated;


DROP TRIGGER IF EXISTS
  guard_documento_reference
ON public.documentos;


CREATE TRIGGER guard_documento_reference

BEFORE INSERT OR UPDATE

ON public.documentos

FOR EACH ROW

EXECUTE FUNCTION
  engmarq_private.guard_documento_reference();


-- ------------------------------------------------------------
-- 10. PRIVATIZAR BUCKET E APLICAR CONFIGURAÇÃO FINAL
-- ------------------------------------------------------------

UPDATE storage.buckets

SET

  public = false,

  file_size_limit = 10485760,

  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]

WHERE id = 'documentos';


-- ------------------------------------------------------------
-- 11. COMMIT
-- ------------------------------------------------------------

COMMIT;