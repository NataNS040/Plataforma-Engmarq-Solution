-- ENGMARQ SST - Migration 006: Catálogo global de exames + coluna exames_realizados
--
-- exames_catalogo é uma tabela global (sem empresa_id) — todos os tenants compartilham.
-- exames_realizados em documentos armazena quais exames foram feitos em cada ASO.

-- Catálogo global de exames / procedimentos ocupacionais
CREATE TABLE IF NOT EXISTS exames_catalogo (
  id    SERIAL PRIMARY KEY,
  nome  TEXT NOT NULL UNIQUE,
  ordem INT  NOT NULL DEFAULT 0
);

-- Seed com os 27 exames padrão Engmarq
INSERT INTO exames_catalogo (nome, ordem) VALUES
  ('ASO / Avaliação Clínica Ocupacional',              1),
  ('Audiometria',                                      2),
  ('Espirometria',                                     3),
  ('Hemograma',                                        4),
  ('Sumário de Urina / EAS',                           5),
  ('Raio X',                                           6),
  ('Glicose',                                          7),
  ('VDRL',                                             8),
  ('Parasitológico de Fezes',                          9),
  ('TGO',                                             10),
  ('TGP',                                             11),
  ('Gama GT',                                         12),
  ('Colesterol Total',                                13),
  ('Triglicerídeos',                                  14),
  ('Creatinina',                                      15),
  ('Eletrocardiograma — ECG',                         16),
  ('Acuidade Visual',                                 17),
  ('Eletroencefalograma — EEG',                       18),
  ('Teste de Romberg / Teste de Equilíbrio',          19),
  ('Avaliação Psicossocial / Questionário Psicossocial', 20),
  ('Toxicológico',                                    21),
  ('Grupo Sanguíneo + Fator RH',                      22),
  ('Ácido Hipúrico',                                  23),
  ('Ácido Metil Hipúrico',                            24),
  ('Chumbo',                                          25),
  ('ALAU',                                            26),
  ('PSA',                                             27)
ON CONFLICT (nome) DO NOTHING;

-- Coluna para registrar quais exames foram realizados no ASO
ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS exames_realizados TEXT[] DEFAULT '{}';

-- RLS: catálogo é leitura pública para todos os usuários autenticados
ALTER TABLE exames_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exames_catalogo_read" ON exames_catalogo;
CREATE POLICY "exames_catalogo_read"
  ON exames_catalogo FOR SELECT
  TO authenticated
  USING (true);
