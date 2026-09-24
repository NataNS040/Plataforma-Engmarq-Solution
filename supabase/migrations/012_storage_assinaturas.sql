-- ENGMARQ SST - Migration 012: Storage bucket + policies para assinaturas
--
-- Bucket dedicado pras fotos de "assinatura facial" das fichas de EPI
-- (mesmo padrão de 009_storage_documentos.sql, mas separado do bucket de
-- documentos: são imagens pequenas, não PDFs/planilhas, e semanticamente
-- são outra coisa — evidência de assinatura, não um documento anexado).
-- Path: {empresa_id}/{uuid}.jpg

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assinaturas',
  'assinaturas',
  false,
  2097152, -- 2 MB — foto única, não precisa do limite de documentos
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "assinaturas_storage_select" ON storage.objects;
CREATE POLICY "assinaturas_storage_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'assinaturas'
    AND (
      get_user_role() = 'admin'
      OR (storage.foldername(name))[1] = get_user_empresa_id()::text
    )
  );

DROP POLICY IF EXISTS "assinaturas_storage_insert" ON storage.objects;
CREATE POLICY "assinaturas_storage_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assinaturas'
    AND (
      get_user_role() = 'admin'
      OR (
        (storage.foldername(name))[1] = get_user_empresa_id()::text
        AND get_user_role() IN ('gestor', 'empresa')
      )
    )
  );

-- Sem UPDATE/DELETE de propósito: uma assinatura já capturada não deve ser
-- substituída nem apagada por cima (integridade do registro assinado).
