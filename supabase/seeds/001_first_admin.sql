-- =====================================================
-- ENGMARQ SST — Seed: Empresa + Primeiro Admin
-- =====================================================
-- INSTRUÇÕES:
-- 1. Primeiro crie o usuário no Supabase:
--    Authentication → Users → "Add user"
--    Email: admin@engmarq.com
--    Senha: Admin@123456
--
-- 2. Rode este script inteiro no SQL Editor do Supabase
-- =====================================================

-- PASSO 1: Criar a empresa
INSERT INTO empresas (razao_social, cnpj)
VALUES (
  'EngMarq Solucoes em Engenharia',
  '12.345.678/0001-99'
)
ON CONFLICT (cnpj) DO UPDATE SET
  razao_social = EXCLUDED.razao_social;

-- PASSO 2: Criar o perfil do admin
DO $$
DECLARE
  admin_user_id UUID;
  admin_email TEXT := 'admin@engmarq.com';
  admin_empresa_id UUID;
BEGIN
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = admin_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário % não encontrado em auth.users. Crie-o em Authentication → Users antes de rodar este seed.', admin_email;
  END IF;

  SELECT id INTO admin_empresa_id
  FROM empresas
  WHERE cnpj = '12.345.678/0001-99'
  LIMIT 1;

  INSERT INTO user_profiles (id, email, full_name, role, empresa_id, active)
  VALUES (
    admin_user_id,
    admin_email,
    'Administrador',
    'admin',
    admin_empresa_id,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    empresa_id = EXCLUDED.empresa_id,
    active = EXCLUDED.active;
END $$;

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
