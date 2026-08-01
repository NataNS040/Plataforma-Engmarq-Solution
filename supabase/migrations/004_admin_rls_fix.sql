-- =====================================================
-- Fix: políticas RLS para role 'admin' na tabela empresas
-- Admins da EngMarq precisam ver, criar e editar qualquer empresa-cliente.
-- =====================================================

-- SELECT: admin vê todas as empresas; gestor/operacional só a própria
DROP POLICY IF EXISTS "empresa_select" ON empresas;
CREATE POLICY "empresa_select" ON empresas FOR SELECT USING (
  get_user_role() = 'admin'
  OR id = get_user_empresa_id()
);

-- INSERT: somente admin pode criar novas empresas-cliente
DROP POLICY IF EXISTS "empresa_insert_admin" ON empresas;
CREATE POLICY "empresa_insert_admin" ON empresas FOR INSERT WITH CHECK (
  get_user_role() = 'admin'
);

-- UPDATE: admin pode editar qualquer empresa; gestor só a própria
DROP POLICY IF EXISTS "empresa_update_admin" ON empresas;
CREATE POLICY "empresa_update_admin" ON empresas FOR UPDATE USING (
  get_user_role() = 'admin'
  OR (id = get_user_empresa_id() AND get_user_role() = 'gestor')
);

-- DELETE: somente admin pode suspender/excluir empresas
DROP POLICY IF EXISTS "empresa_delete_admin" ON empresas;
CREATE POLICY "empresa_delete_admin" ON empresas FOR DELETE USING (
  get_user_role() = 'admin'
);
