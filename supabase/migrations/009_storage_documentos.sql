-- ENGMARQ SST - Migration 009: Storage bucket + policies para documentos
--
-- Cria o bucket 'documentos' e define políticas RLS para storage.objects.
-- O path dos arquivos segue o padrão: {empresa_id}/{uuid}.{ext}
-- A policy extrai o primeiro segmento do path para validar a empresa do usuário.

-- -------------------------------------------------------
-- Criar bucket (idempotente)
-- -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos',
  'documentos',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------
-- SELECT: admin vê tudo; empresa/gestor só a própria pasta
-- -------------------------------------------------------
DROP POLICY IF EXISTS "documentos_storage_select" ON storage.objects;
CREATE POLICY "documentos_storage_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      get_user_role() = 'admin'
      OR (storage.foldername(name))[1] = get_user_empresa_id()::text
    )
  );

-- -------------------------------------------------------
-- INSERT: empresa/gestor só faz upload na própria pasta
-- -------------------------------------------------------
DROP POLICY IF EXISTS "documentos_storage_insert" ON storage.objects;
CREATE POLICY "documentos_storage_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND (
      get_user_role() = 'admin'
      OR (
        (storage.foldername(name))[1] = get_user_empresa_id()::text
        AND get_user_role() IN ('gestor', 'empresa')
      )
    )
  );

-- -------------------------------------------------------
-- UPDATE: mesmas regras do INSERT
-- -------------------------------------------------------
DROP POLICY IF EXISTS "documentos_storage_update" ON storage.objects;
CREATE POLICY "documentos_storage_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      get_user_role() = 'admin'
      OR (storage.foldername(name))[1] = get_user_empresa_id()::text
    )
  );

-- -------------------------------------------------------
-- DELETE: admin ou dono da pasta
-- -------------------------------------------------------
DROP POLICY IF EXISTS "documentos_storage_delete" ON storage.objects;
CREATE POLICY "documentos_storage_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documentos'
    AND (
      get_user_role() = 'admin'
      OR (storage.foldername(name))[1] = get_user_empresa_id()::text
    )
  );
