-- =====================================================
-- ENGMARQ SST — Seed: Empresa + Primeiro Admin
-- =====================================================
-- INSTRUÇÕES:
-- 1. Primeiro crie o usuário no Supabase:
--    Authentication → Users → "Add user" → preencha email e senha
--    Copie o UUID gerado (ex: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
--
-- 2. Substitua os valores marcados com <ALTERAR> abaixo
--
-- 3. Rode este script inteiro no SQL Editor do Supabase
-- =====================================================

-- PASSO 1: Criar a empresa
INSERT INTO empresas (id, razao_social, cnpj)
VALUES (
  gen_random_uuid(),
  'EngMarq Solucoes em Engenharia',
  '12.345.678/0001-99'
)
ON CONFLICT DO NOTHING;

-- PASSO 2: Criar o perfil do admin
-- ⚠️ ÚNICA COISA QUE VOCÊ PRECISA MUDAR:
--    1. Vá em Authentication → Users → "Add user"
--    2. Email: admin@engmarq.com  |  Senha: Admin@123456
--    3. Copie o UUID gerado e cole no lugar abaixo
INSERT INTO user_profiles (id, email, full_name, role, empresa_id)
VALUES (
  '1e021eea-2970-4345-b652-228b829690d1',
  'natan@engmarq.com.br',
  'Administrador',
  'admin',
  (SELECT id FROM empresas ORDER BY created_at DESC LIMIT 1)
)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  empresa_id = (SELECT id FROM empresas ORDER BY created_at DESC LIMIT 1);

-- =====================================================
-- VERIFICAÇÃO — rode para confirmar que funcionou
-- =====================================================
SELECT
  e.razao_social,
  e.cnpj,
  u.full_name,
  u.email,
  u.role
FROM user_profiles u
JOIN empresas e ON e.id = u.empresa_id;
