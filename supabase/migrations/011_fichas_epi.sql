-- ENGMARQ SST - Migration 011: Fichas de EPI (cabeçalho + itens)
--
-- Substitui o hack da Etapa 4 (cada item de EPI virava uma linha solta na
-- tabela genérica `documentos`, sem nenhum vínculo entre itens entregues
-- juntos, e sem como assinar a entrega como um todo). Agora uma "ficha" é
-- uma entidade própria: um evento de entrega (data, colaborador), com N
-- itens (equipamento + CA + validade) e uma assinatura (foto) única pra
-- ficha inteira — não por item.
--
-- Mesmo padrão de `documentos`/`treinamentos` (001_base_schema.sql):
-- status calculado por trigger, RLS por empresa_id + role.

-- ---------------------------------------------------------------------------
-- Cabeçalho: um registro por evento de entrega/assinatura
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fichas_epi (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  colaborador_id      UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_entrega        DATE NOT NULL,
  observacoes         TEXT,
  -- Assinatura: hoje é só uma foto capturada na hora (presencial), sem
  -- verificação automática de identidade (ver comentário na Etapa D do
  -- planejamento — "validação facial" fica em breve). NULL = ainda não
  -- assinada (rascunho, ainda editável).
  foto_assinatura_url TEXT,
  assinado_em         TIMESTAMPTZ,
  assinado_por        UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fichas_epi_empresa_id     ON fichas_epi (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fichas_epi_colaborador_id ON fichas_epi (colaborador_id);

-- ---------------------------------------------------------------------------
-- Itens: um por equipamento entregue naquela ficha
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fichas_epi_itens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_epi_id  UUID NOT NULL REFERENCES fichas_epi(id) ON DELETE CASCADE,
  -- Denormalizado (mesmo padrão de `treinamentos`/`documentos`) pra permitir
  -- RLS direto na linha do item, sem precisar de join até fichas_epi.
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  equipamento   TEXT NOT NULL,
  ca            TEXT,
  data_validade DATE,
  status        doc_status NOT NULL DEFAULT 'vigente',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fichas_epi_itens_ficha_epi_id ON fichas_epi_itens (ficha_epi_id);
CREATE INDEX IF NOT EXISTS idx_fichas_epi_itens_empresa_id   ON fichas_epi_itens (empresa_id);

-- ---------------------------------------------------------------------------
-- Status calculado por trigger (mesmo padrão de update_documento_status())
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_ficha_epi_item_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.data_validade IS NULL THEN NEW.status = 'vigente';
  ELSIF NEW.data_validade < CURRENT_DATE THEN NEW.status = 'vencido';
  ELSIF NEW.data_validade <= CURRENT_DATE + INTERVAL '60 days' THEN NEW.status = 'vencendo';
  ELSE NEW.status = 'vigente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ficha_epi_item_status ON fichas_epi_itens;
CREATE TRIGGER trg_ficha_epi_item_status
  BEFORE INSERT OR UPDATE ON fichas_epi_itens
  FOR EACH ROW EXECUTE FUNCTION update_ficha_epi_item_status();

-- ---------------------------------------------------------------------------
-- RLS — mesmo padrão de `documentos` (007_empresa_permissions_fix.sql):
-- admin vê/edita tudo; gestor/empresa só a própria empresa.
-- ---------------------------------------------------------------------------
ALTER TABLE fichas_epi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_epi_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fichas_epi_select" ON fichas_epi;
CREATE POLICY "fichas_epi_select" ON fichas_epi FOR SELECT
  USING (
    get_user_role() = 'admin'
    OR empresa_id = get_user_empresa_id()
  );

DROP POLICY IF EXISTS "fichas_epi_write" ON fichas_epi;
CREATE POLICY "fichas_epi_write" ON fichas_epi FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );

DROP POLICY IF EXISTS "fichas_epi_itens_select" ON fichas_epi_itens;
CREATE POLICY "fichas_epi_itens_select" ON fichas_epi_itens FOR SELECT
  USING (
    get_user_role() = 'admin'
    OR empresa_id = get_user_empresa_id()
  );

DROP POLICY IF EXISTS "fichas_epi_itens_write" ON fichas_epi_itens;
CREATE POLICY "fichas_epi_itens_write" ON fichas_epi_itens FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (empresa_id = get_user_empresa_id() AND get_user_role() IN ('gestor', 'empresa'))
  );
