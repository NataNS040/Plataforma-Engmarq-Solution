-- =====================================================
-- ENGMARQ SST — Migration 001: Base Schema
-- =====================================================
-- Rodar no SQL Editor do Supabase (projeto do cliente)
-- =====================================================

-- ENUMS
CREATE TYPE user_role AS ENUM ('admin', 'gestor', 'operacional');
CREATE TYPE doc_status AS ENUM ('vigente', 'vencendo', 'vencido');
CREATE TYPE treinamento_status AS ENUM ('em_dia', 'vencendo', 'vencido', 'pendente');

-- =====================================================
-- EMPRESA
-- =====================================================
CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- USER PROFILES (extends auth.users)
-- =====================================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'operacional',
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- ESTRUTURA ORGANIZACIONAL
-- =====================================================
CREATE TABLE setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, nome)
);

CREATE TABLE funcoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  riscos TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, nome)
);

CREATE TABLE ambientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, nome)
);

-- =====================================================
-- COLABORADORES
-- =====================================================
CREATE TABLE colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  matricula TEXT,
  funcao_id UUID NOT NULL REFERENCES funcoes(id),
  setor_id UUID NOT NULL REFERENCES setores(id),
  ambiente_id UUID REFERENCES ambientes(id),
  data_admissao DATE NOT NULL,
  data_demissao DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, cpf)
);

-- =====================================================
-- DOCUMENTOS
-- =====================================================
CREATE TABLE documento_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  validade_meses INTEGER
);

-- Seed: tipos padrão
INSERT INTO documento_tipos (nome, descricao, validade_meses) VALUES
  ('PGR', 'Programa de Gerenciamento de Riscos', 24),
  ('PCMSO', 'Programa de Controle Médico de Saúde Ocupacional', 12),
  ('LTCAT', 'Laudo Técnico das Condições Ambientais de Trabalho', 24),
  ('APR', 'Análise Preliminar de Risco', NULL),
  ('PT', 'Permissão de Trabalho', NULL),
  ('PPRA', 'Programa de Prevenção de Riscos Ambientais', 12),
  ('LAUDO NR17', 'Laudo Ergonômico (NR-17)', 24),
  ('LAUDO NR10', 'Laudo de Segurança em Instalações Elétricas (NR-10)', 24),
  ('LAUDO NR12', 'Laudo de Segurança em Máquinas e Equipamentos (NR-12)', 36),
  ('ASO', 'Atestado de Saúde Ocupacional', 12);

CREATE TABLE documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  tipo_id UUID NOT NULL REFERENCES documento_tipos(id),
  titulo TEXT NOT NULL,
  numero TEXT,
  emissao DATE,
  vencimento DATE,
  arquivo_url TEXT,
  status doc_status NOT NULL DEFAULT 'vigente',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TREINAMENTOS
-- =====================================================
CREATE TABLE treinamento_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  nr_referencia TEXT,
  validade_meses INTEGER
);

-- Seed: tipos padrão (NRs mais comuns)
INSERT INTO treinamento_tipos (nome, nr_referencia, validade_meses) VALUES
  ('NR-06 — EPI', 'NR-06', 12),
  ('NR-10 — Segurança em Instalações Elétricas', 'NR-10', 12),
  ('NR-11 — Transporte de Cargas', 'NR-11', 12),
  ('NR-12 — Máquinas e Equipamentos', 'NR-12', 12),
  ('NR-17 — Ergonomia', 'NR-17', NULL),
  ('NR-18 — Construção Civil', 'NR-18', 12),
  ('NR-20 — Inflamáveis e Combustíveis', 'NR-20', 12),
  ('NR-23 — Proteção Contra Incêndios', 'NR-23', 12),
  ('NR-33 — Espaço Confinado', 'NR-33', 12),
  ('NR-35 — Trabalho em Altura', 'NR-35', 12),
  ('Combate a Incêndio', NULL, 12),
  ('Primeiros Socorros', NULL, 24),
  ('CIPA', 'NR-05', 12),
  ('Operador de Empilhadeira', NULL, 36),
  ('Integração SST', NULL, NULL);

CREATE TABLE matriz_treinamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  funcao_id UUID NOT NULL REFERENCES funcoes(id),
  treinamento_tipo_id UUID NOT NULL REFERENCES treinamento_tipos(id),
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, funcao_id, treinamento_tipo_id)
);

CREATE TABLE treinamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  colaborador_id UUID NOT NULL REFERENCES colaboradores(id),
  treinamento_tipo_id UUID NOT NULL REFERENCES treinamento_tipos(id),
  data_realizacao DATE NOT NULL,
  data_vencimento DATE,
  carga_horaria NUMERIC(5,1),
  instrutor TEXT,
  certificado_url TEXT,
  status treinamento_status NOT NULL DEFAULT 'em_dia',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_colaboradores_empresa ON colaboradores(empresa_id);
CREATE INDEX idx_colaboradores_funcao ON colaboradores(funcao_id);
CREATE INDEX idx_documentos_empresa ON documentos(empresa_id);
CREATE INDEX idx_documentos_vencimento ON documentos(vencimento);
CREATE INDEX idx_treinamentos_colaborador ON treinamentos(colaborador_id);
CREATE INDEX idx_treinamentos_vencimento ON treinamentos(data_vencimento);
CREATE INDEX idx_user_profiles_empresa ON user_profiles(empresa_id);

-- =====================================================
-- VIEWS PARA DASHBOARD
-- =====================================================

-- View: status dos documentos por empresa
CREATE OR REPLACE VIEW vw_dashboard_documentos AS
SELECT
  d.empresa_id,
  dt.nome AS tipo_nome,
  d.titulo,
  d.vencimento,
  CASE
    WHEN d.vencimento IS NULL THEN 'vigente'
    WHEN d.vencimento < CURRENT_DATE THEN 'vencido'
    WHEN d.vencimento <= CURRENT_DATE + INTERVAL '30 days' THEN 'vencendo'
    WHEN d.vencimento <= CURRENT_DATE + INTERVAL '60 days' THEN 'vencendo'
    ELSE 'vigente'
  END AS status_calculado,
  (d.vencimento - CURRENT_DATE) AS dias_restantes
FROM documentos d
JOIN documento_tipos dt ON dt.id = d.tipo_id;

-- View: status de treinamentos por colaborador
CREATE OR REPLACE VIEW vw_dashboard_treinamentos AS
SELECT
  t.empresa_id,
  t.colaborador_id,
  c.nome AS colaborador_nome,
  tt.nome AS treinamento_nome,
  t.data_realizacao,
  t.data_vencimento,
  CASE
    WHEN t.data_vencimento IS NULL THEN 'em_dia'
    WHEN t.data_vencimento < CURRENT_DATE THEN 'vencido'
    WHEN t.data_vencimento <= CURRENT_DATE + INTERVAL '30 days' THEN 'vencendo'
    ELSE 'em_dia'
  END AS status_calculado,
  (t.data_vencimento - CURRENT_DATE) AS dias_restantes
FROM treinamentos t
JOIN colaboradores c ON c.id = t.colaborador_id
JOIN treinamento_tipos tt ON tt.id = t.treinamento_tipo_id;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE treinamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE matriz_treinamentos ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's empresa_id
CREATE OR REPLACE FUNCTION get_user_empresa_id()
RETURNS UUID AS $$
  SELECT empresa_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- EMPRESA: user can only see their own empresa
CREATE POLICY "empresa_select" ON empresas FOR SELECT
  USING (id = get_user_empresa_id());

CREATE POLICY "empresa_update_admin" ON empresas FOR UPDATE
  USING (id = get_user_empresa_id() AND get_user_role() = 'admin');

-- USER_PROFILES: admin manages all, others see their empresa
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT
  USING (empresa_id = get_user_empresa_id());

CREATE POLICY "profiles_insert_admin" ON user_profiles FOR INSERT
  WITH CHECK (empresa_id = get_user_empresa_id() AND get_user_role() = 'admin');

CREATE POLICY "profiles_update_admin" ON user_profiles FOR UPDATE
  USING (empresa_id = get_user_empresa_id() AND get_user_role() = 'admin');

-- SETORES / FUNCOES / AMBIENTES: all roles read, admin+gestor write
CREATE POLICY "setores_select" ON setores FOR SELECT USING (empresa_id = get_user_empresa_id());
CREATE POLICY "setores_write" ON setores FOR ALL
  USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

CREATE POLICY "funcoes_select" ON funcoes FOR SELECT USING (empresa_id = get_user_empresa_id());
CREATE POLICY "funcoes_write" ON funcoes FOR ALL
  USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

CREATE POLICY "ambientes_select" ON ambientes FOR SELECT USING (empresa_id = get_user_empresa_id());
CREATE POLICY "ambientes_write" ON ambientes FOR ALL
  USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

-- COLABORADORES: all roles read, admin+gestor write
CREATE POLICY "colaboradores_select" ON colaboradores FOR SELECT USING (empresa_id = get_user_empresa_id());
CREATE POLICY "colaboradores_write" ON colaboradores FOR ALL
  USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

-- DOCUMENTOS: all roles read, admin+gestor write
CREATE POLICY "documentos_select" ON documentos FOR SELECT USING (empresa_id = get_user_empresa_id());
CREATE POLICY "documentos_write" ON documentos FOR ALL
  USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

-- TREINAMENTOS: all read, operacional inserts own, admin+gestor manage all
CREATE POLICY "treinamentos_select" ON treinamentos FOR SELECT USING (empresa_id = get_user_empresa_id());
CREATE POLICY "treinamentos_write" ON treinamentos FOR ALL
  USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

-- MATRIZ TREINAMENTOS: all read, admin+gestor write
CREATE POLICY "matriz_select" ON matriz_treinamentos FOR SELECT USING (empresa_id = get_user_empresa_id());
CREATE POLICY "matriz_write" ON matriz_treinamentos FOR ALL
  USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

-- =====================================================
-- TRIGGER: auto-update documento status
-- =====================================================
CREATE OR REPLACE FUNCTION update_documento_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vencimento IS NULL THEN
    NEW.status = 'vigente';
  ELSIF NEW.vencimento < CURRENT_DATE THEN
    NEW.status = 'vencido';
  ELSIF NEW.vencimento <= CURRENT_DATE + INTERVAL '60 days' THEN
    NEW.status = 'vencendo';
  ELSE
    NEW.status = 'vigente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_documento_status
BEFORE INSERT OR UPDATE ON documentos
FOR EACH ROW EXECUTE FUNCTION update_documento_status();

-- =====================================================
-- TRIGGER: auto-update treinamento status
-- =====================================================
CREATE OR REPLACE FUNCTION update_treinamento_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.data_vencimento IS NULL THEN
    NEW.status = 'em_dia';
  ELSIF NEW.data_vencimento < CURRENT_DATE THEN
    NEW.status = 'vencido';
  ELSIF NEW.data_vencimento <= CURRENT_DATE + INTERVAL '30 days' THEN
    NEW.status = 'vencendo';
  ELSE
    NEW.status = 'em_dia';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_treinamento_status
BEFORE INSERT OR UPDATE ON treinamentos
FOR EACH ROW EXECUTE FUNCTION update_treinamento_status();
