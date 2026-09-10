-- ENGMARQ SST - Migration 013: Etapa 7 (Configurações) — logo da empresa + gestão de equipe
--
-- 1) Bucket 'logos' (público) para a identidade visual de cada empresa.
-- 2) Amplia quem pode atualizar user_profiles (gestor/empresa também
--    gerenciam a própria equipe, não só admin) — necessário pro botão
--    "Ações" (editar papel / ativar-desativar) na aba Equipe.

-- -------------------------------------------------------
-- Bucket 'logos' (idempotente)
-- -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152, -- 2 MB
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Leitura é pública (bucket público) — política aqui só cobre chamadas
-- autenticadas à API de storage (ex.: list()), não a URL pública.
DROP POLICY IF EXISTS "logos_storage_select" ON storage.objects;
CREATE POLICY "logos_storage_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "logos_storage_insert" ON storage.objects;
CREATE POLICY "logos_storage_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      get_user_role() = 'admin'
      OR (
        (storage.foldername(name))[1] = get_user_empresa_id()::text
        AND get_user_role() IN ('gestor', 'empresa')
      )
    )
  );

DROP POLICY IF EXISTS "logos_storage_update" ON storage.objects;
CREATE POLICY "logos_storage_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      get_user_role() = 'admin'
      OR (storage.foldername(name))[1] = get_user_empresa_id()::text
    )
  );

-- -------------------------------------------------------
-- user_profiles: gestor/empresa também administram a própria equipe
-- (antes só 'admin' conseguia dar UPDATE, o que quebrava o botão
-- "Ações" e qualquer edição de papel/ativação pro lado empresa-cliente)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "profiles_update_admin" ON user_profiles;
CREATE POLICY "profiles_update_admin" ON user_profiles FOR UPDATE USING (
  get_user_role() = 'admin'
  OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
);
