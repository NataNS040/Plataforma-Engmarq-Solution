-- ENGMARQ SST - Migration 002: Campos adicionais em empresas (idempotent)
--
-- Adiciona colunas de cadastro administrativo usadas pela tela de Empresas
-- (setor, endereço, contato, status). Todas opcionais para não quebrar
-- registros existentes.

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS setor        TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cidade       TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS uf           TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS responsavel  TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS email        TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS telefone     TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'ativa'
  CHECK (status IN ('ativa','pendente','suspensa'));
