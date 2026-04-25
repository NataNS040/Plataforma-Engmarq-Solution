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
  'Nome da Empresa Ltda',    -- <ALTERAR> Razão social do cliente
  '00.000.000/0001-00'       -- <ALTERAR> CNPJ do cliente
)
ON CONFLICT DO NOTHING;

-- PASSO 2: Criar o perfil do admin
-- Substitua o UUID abaixo pelo UUID do usuário criado no Auth
INSERT INTO user_profiles (id, email, full_name, role, empresa_id)
VALUES (
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- <ALTERAR> UUID do usuário (Authentication → Users)
  'admin@empresa.com',                      -- <ALTERAR> Email do usuário
  'Administrador',                          -- <ALTERAR> Nome completo
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
