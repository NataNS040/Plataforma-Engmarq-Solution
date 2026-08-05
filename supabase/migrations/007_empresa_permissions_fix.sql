-- ENGMARQ SST - Migration 007: Garante permissões completas para role 'empresa'
--
-- Idempotente: usa DROP IF EXISTS + CREATE em todas as políticas.
-- Resolve casos em que a migration 005 ETAPA 2 não foi aplicada.

-- -------------------------------------------------------
-- documentos: empresa pode ler e escrever os próprios
-- -------------------------------------------------------
DROP POLICY IF EXISTS "documentos_select" ON documentos;
CREATE POLICY "documentos_select" ON documentos FOR SELECT
  USING (
    get_user_role() = 'admin'
    OR empresa_id = get_user_empresa_id()
  );

DROP POLICY IF EXISTS "documentos_write" ON documentos;
CREATE POLICY "documentos_write" ON documentos FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );

-- -------------------------------------------------------
-- colaboradores: empresa pode ler e escrever os próprios
-- -------------------------------------------------------
DROP POLICY IF EXISTS "colaboradores_write" ON colaboradores;
CREATE POLICY "colaboradores_write" ON colaboradores FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );

-- -------------------------------------------------------
-- treinamentos: empresa pode ler e escrever os próprios
-- -------------------------------------------------------
DROP POLICY IF EXISTS "treinamentos_write" ON treinamentos;
CREATE POLICY "treinamentos_write" ON treinamentos FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );

-- -------------------------------------------------------
-- setores / funcoes / ambientes: empresa pode escrever
-- -------------------------------------------------------
DROP POLICY IF EXISTS "setores_write" ON setores;
CREATE POLICY "setores_write" ON setores FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );

DROP POLICY IF EXISTS "funcoes_write" ON funcoes;
CREATE POLICY "funcoes_write" ON funcoes FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );

DROP POLICY IF EXISTS "ambientes_write" ON ambientes;
CREATE POLICY "ambientes_write" ON ambientes FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );

-- -------------------------------------------------------
-- matriz_treinamentos: empresa pode escrever
-- -------------------------------------------------------
DROP POLICY IF EXISTS "matriz_write" ON matriz_treinamentos;
CREATE POLICY "matriz_write" ON matriz_treinamentos FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );
