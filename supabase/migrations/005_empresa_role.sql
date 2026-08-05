-- =====================================================
-- Migration 005: role 'empresa' para acesso do cliente
-- Empresas-cliente têm login próprio e gerenciam apenas
-- os dados da sua empresa (colaboradores, docs, treinamentos).
-- =====================================================
-- ATENÇÃO: rodar em 2 etapas no SQL Editor do Supabase.
-- PostgreSQL exige que ADD VALUE seja commitado antes de ser
-- referenciado em outras instruções.
--
-- ▶ ETAPA 1: rode SOMENTE esta linha e clique em Run:
--   ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'empresa';
--
-- ▶ ETAPA 2: rode o restante do arquivo (a partir das policies).
-- =====================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'empresa';

-- -------------------------------------------------------
-- empresas: empresa-cliente pode atualizar só a própria
-- -------------------------------------------------------
DROP POLICY IF EXISTS "empresa_update_admin" ON empresas;
CREATE POLICY "empresa_update_admin" ON empresas FOR UPDATE USING (
  get_user_role() = 'admin'
  OR (id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
);

-- -------------------------------------------------------
-- setores / funcoes / ambientes: empresa pode escrever
-- -------------------------------------------------------
DROP POLICY IF EXISTS "setores_write" ON setores;
CREATE POLICY "setores_write" ON setores FOR ALL USING (
  empresa_id = get_user_empresa_id()
  AND get_user_role() IN ('admin', 'gestor', 'empresa')
);

DROP POLICY IF EXISTS "funcoes_write" ON funcoes;
CREATE POLICY "funcoes_write" ON funcoes FOR ALL USING (
  empresa_id = get_user_empresa_id()
  AND get_user_role() IN ('admin', 'gestor', 'empresa')
);

DROP POLICY IF EXISTS "ambientes_write" ON ambientes;
CREATE POLICY "ambientes_write" ON ambientes FOR ALL USING (
  empresa_id = get_user_empresa_id()
  AND get_user_role() IN ('admin', 'gestor', 'empresa')
);

-- -------------------------------------------------------
-- colaboradores: empresa pode escrever
-- -------------------------------------------------------
DROP POLICY IF EXISTS "colaboradores_write" ON colaboradores;
CREATE POLICY "colaboradores_write" ON colaboradores FOR ALL USING (
  empresa_id = get_user_empresa_id()
  AND get_user_role() IN ('admin', 'gestor', 'empresa')
);

-- -------------------------------------------------------
-- documentos: empresa pode escrever
-- -------------------------------------------------------
DROP POLICY IF EXISTS "documentos_write" ON documentos;
CREATE POLICY "documentos_write" ON documentos FOR ALL USING (
  empresa_id = get_user_empresa_id()
  AND get_user_role() IN ('admin', 'gestor', 'empresa')
);

-- -------------------------------------------------------
-- treinamentos: empresa pode escrever
-- -------------------------------------------------------
DROP POLICY IF EXISTS "treinamentos_write" ON treinamentos;
CREATE POLICY "treinamentos_write" ON treinamentos FOR ALL USING (
  empresa_id = get_user_empresa_id()
  AND get_user_role() IN ('admin', 'gestor', 'empresa')
);

-- -------------------------------------------------------
-- matriz_treinamentos: empresa pode escrever
-- -------------------------------------------------------
DROP POLICY IF EXISTS "matriz_write" ON matriz_treinamentos;
CREATE POLICY "matriz_write" ON matriz_treinamentos FOR ALL USING (
  empresa_id = get_user_empresa_id()
  AND get_user_role() IN ('admin', 'gestor', 'empresa')
);

-- -------------------------------------------------------
-- user_profiles: empresa NÃO gerencia usuários do sistema
-- Apenas admin pode criar/editar profiles.
-- -------------------------------------------------------
-- (sem alteração nas políticas de profiles)
