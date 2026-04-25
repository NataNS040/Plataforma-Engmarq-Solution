-- ENGMARQ SST - Migration 001: Base Schema (idempotent)

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'gestor', 'operacional'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE doc_status AS ENUM ('vigente', 'vencendo', 'vencido'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE treinamento_status AS ENUM ('em_dia', 'vencendo', 'vencido', 'pendente'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  cnpj TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'operacional',
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, nome)
);

CREATE TABLE IF NOT EXISTS funcoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  riscos TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, nome)
);

CREATE TABLE IF NOT EXISTS ambientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, nome)
);

CREATE TABLE IF NOT EXISTS colaboradores (
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

CREATE TABLE IF NOT EXISTS documento_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  validade_meses INTEGER
);

INSERT INTO documento_tipos (nome, descricao, validade_meses) VALUES
  ('PGR', 'Programa de Gerenciamento de Riscos', 24),
  ('PCMSO', 'Programa de Controle Medico de Saude Ocupacional', 12),
  ('LTCAT', 'Laudo Tecnico das Condicoes Ambientais de Trabalho', 24),
  ('APR', 'Analise Preliminar de Risco', NULL),
  ('PT', 'Permissao de Trabalho', NULL),
  ('PPRA', 'Programa de Prevencao de Riscos Ambientais', 12),
  ('LAUDO NR17', 'Laudo Ergonomico (NR-17)', 24),
  ('LAUDO NR10', 'Laudo de Seguranca em Instalacoes Eletricas (NR-10)', 24),
  ('LAUDO NR12', 'Laudo de Seguranca em Maquinas e Equipamentos (NR-12)', 36),
  ('ASO', 'Atestado de Saude Ocupacional', 12)
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS documentos (
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

CREATE TABLE IF NOT EXISTS treinamento_tipos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  nr_referencia TEXT,
  validade_meses INTEGER
);

INSERT INTO treinamento_tipos (nome, nr_referencia, validade_meses) VALUES
  ('NR-06 - EPI', 'NR-06', 12),
  ('NR-10 - Seguranca em Instalacoes Eletricas', 'NR-10', 12),
  ('NR-11 - Transporte de Cargas', 'NR-11', 12),
  ('NR-12 - Maquinas e Equipamentos', 'NR-12', 12),
  ('NR-17 - Ergonomia', 'NR-17', NULL),
  ('NR-18 - Construcao Civil', 'NR-18', 12),
  ('NR-20 - Inflamaveis e Combustiveis', 'NR-20', 12),
  ('NR-23 - Protecao Contra Incendios', 'NR-23', 12),
  ('NR-33 - Espaco Confinado', 'NR-33', 12),
  ('NR-35 - Trabalho em Altura', 'NR-35', 12),
  ('Combate a Incendio', NULL, 12),
  ('Primeiros Socorros', NULL, 24),
  ('CIPA', 'NR-05', 12),
  ('Operador de Empilhadeira', NULL, 36),
  ('Integracao SST', NULL, NULL)
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS matriz_treinamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  funcao_id UUID NOT NULL REFERENCES funcoes(id),
  treinamento_tipo_id UUID NOT NULL REFERENCES treinamento_tipos(id),
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(empresa_id, funcao_id, treinamento_tipo_id)
);

CREATE TABLE IF NOT EXISTS treinamentos (
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

CREATE INDEX IF NOT EXISTS idx_colaboradores_empresa ON colaboradores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao ON colaboradores(funcao_id);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_vencimento ON documentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_treinamentos_colaborador ON treinamentos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_treinamentos_vencimento ON treinamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_user_profiles_empresa ON user_profiles(empresa_id);

CREATE OR REPLACE VIEW vw_dashboard_documentos AS
SELECT
  d.empresa_id,
  dt.nome AS tipo_nome,
  d.titulo,
  d.vencimento,
  CASE
    WHEN d.vencimento IS NULL THEN 'vigente'
    WHEN d.vencimento < CURRENT_DATE THEN 'vencido'
    WHEN d.vencimento <= CURRENT_DATE + INTERVAL '60 days' THEN 'vencendo'
    ELSE 'vigente'
  END AS status_calculado,
  (d.vencimento - CURRENT_DATE) AS dias_restantes
FROM documentos d
JOIN documento_tipos dt ON dt.id = d.tipo_id;

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

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE treinamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE matriz_treinamentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_empresa_id()
RETURNS UUID AS $$
  SELECT empresa_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "empresa_select" ON empresas;
CREATE POLICY "empresa_select" ON empresas FOR SELECT USING (id = get_user_empresa_id());

DROP POLICY IF EXISTS "empresa_update_admin" ON empresas;
CREATE POLICY "empresa_update_admin" ON empresas FOR UPDATE USING (id = get_user_empresa_id() AND get_user_role() = 'admin');

DROP POLICY IF EXISTS "profiles_select" ON user_profiles;
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT USING (empresa_id = get_user_empresa_id());

DROP POLICY IF EXISTS "profiles_insert_admin" ON user_profiles;
CREATE POLICY "profiles_insert_admin" ON user_profiles FOR INSERT WITH CHECK (empresa_id = get_user_empresa_id() AND get_user_role() = 'admin');

DROP POLICY IF EXISTS "profiles_update_admin" ON user_profiles;
CREATE POLICY "profiles_update_admin" ON user_profiles FOR UPDATE USING (empresa_id = get_user_empresa_id() AND get_user_role() = 'admin');

DROP POLICY IF EXISTS "setores_select" ON setores;
CREATE POLICY "setores_select" ON setores FOR SELECT USING (empresa_id = get_user_empresa_id());
DROP POLICY IF EXISTS "setores_write" ON setores;
CREATE POLICY "setores_write" ON setores FOR ALL USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "funcoes_select" ON funcoes;
CREATE POLICY "funcoes_select" ON funcoes FOR SELECT USING (empresa_id = get_user_empresa_id());
DROP POLICY IF EXISTS "funcoes_write" ON funcoes;
CREATE POLICY "funcoes_write" ON funcoes FOR ALL USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "ambientes_select" ON ambientes;
CREATE POLICY "ambientes_select" ON ambientes FOR SELECT USING (empresa_id = get_user_empresa_id());
DROP POLICY IF EXISTS "ambientes_write" ON ambientes;
CREATE POLICY "ambientes_write" ON ambientes FOR ALL USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "colaboradores_select" ON colaboradores;
CREATE POLICY "colaboradores_select" ON colaboradores FOR SELECT USING (empresa_id = get_user_empresa_id());
DROP POLICY IF EXISTS "colaboradores_write" ON colaboradores;
CREATE POLICY "colaboradores_write" ON colaboradores FOR ALL USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "documentos_select" ON documentos;
CREATE POLICY "documentos_select" ON documentos FOR SELECT USING (empresa_id = get_user_empresa_id());
DROP POLICY IF EXISTS "documentos_write" ON documentos;
CREATE POLICY "documentos_write" ON documentos FOR ALL USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "treinamentos_select" ON treinamentos;
CREATE POLICY "treinamentos_select" ON treinamentos FOR SELECT USING (empresa_id = get_user_empresa_id());
DROP POLICY IF EXISTS "treinamentos_write" ON treinamentos;
CREATE POLICY "treinamentos_write" ON treinamentos FOR ALL USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "matriz_select" ON matriz_treinamentos;
CREATE POLICY "matriz_select" ON matriz_treinamentos FOR SELECT USING (empresa_id = get_user_empresa_id());
DROP POLICY IF EXISTS "matriz_write" ON matriz_treinamentos;
CREATE POLICY "matriz_write" ON matriz_treinamentos FOR ALL USING (empresa_id = get_user_empresa_id() AND get_user_role() IN ('admin', 'gestor'));

CREATE OR REPLACE FUNCTION update_documento_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vencimento IS NULL THEN NEW.status = 'vigente';
  ELSIF NEW.vencimento < CURRENT_DATE THEN NEW.status = 'vencido';
  ELSIF NEW.vencimento <= CURRENT_DATE + INTERVAL '60 days' THEN NEW.status = 'vencendo';
  ELSE NEW.status = 'vigente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documento_status ON documentos;
CREATE TRIGGER trg_documento_status BEFORE INSERT OR UPDATE ON documentos FOR EACH ROW EXECUTE FUNCTION update_documento_status();

CREATE OR REPLACE FUNCTION update_treinamento_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.data_vencimento IS NULL THEN NEW.status = 'em_dia';
  ELSIF NEW.data_vencimento < CURRENT_DATE THEN NEW.status = 'vencido';
  ELSIF NEW.data_vencimento <= CURRENT_DATE + INTERVAL '30 days' THEN NEW.status = 'vencendo';
  ELSE NEW.status = 'em_dia';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_treinamento_status ON treinamentos;
CREATE TRIGGER trg_treinamento_status BEFORE INSERT OR UPDATE ON treinamentos FOR EACH ROW EXECUTE FUNCTION update_treinamento_status();
