-- ENGMARQ SST - Migration 003: ASOs — colunas adicionais em documentos (idempotent)
--
-- ASOs são tratados como documentos com tipo='ASO'.
-- Adicionamos colunas opcionais para vincular ao colaborador
-- e registrar o subtipo de exame ocupacional.

ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;

ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS subtipo_exame TEXT
    CHECK (subtipo_exame IN (
      'admissional',
      'periodico',
      'mudanca_risco',
      'retorno_trabalho',
      'demissional'
    ) OR subtipo_exame IS NULL);

-- Índice para buscar ASOs por colaborador
CREATE INDEX IF NOT EXISTS idx_documentos_colaborador_id
  ON documentos (colaborador_id)
  WHERE colaborador_id IS NOT NULL;

-- RLS: mantém mesmas políticas (empresa_id já garante isolamento)
-- A nova coluna colaborador_id é informativa — acesso controlado via empresa_id
