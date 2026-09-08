-- ENGMARQ SST - Migration 010: Tipos de documento "Certificado de Treinamento" e "Ficha de EPI"
--
-- O catálogo documento_tipos nunca teve entradas pra esses dois tipos —
-- só PGR/PCMSO/LTCAT/APR/PT/PPRA/LAUDO NR*/ASO (ver migrations 001/007).
-- Isso fazia o DateEntryModal (DocumentosPage) resolver o tipo_id por
-- regex sobre o catálogo (/certif|treina/i, /epi/i), nunca achar nada e
-- cair silenciosamente no primeiro tipo em ordem alfabética (APR) —
-- registros de certificado/EPI eram salvos com o tipo errado.

INSERT INTO documento_tipos (nome, descricao, validade_meses) VALUES
  ('Certificado de Treinamento', 'Certificado de treinamento/NR por colaborador', NULL),
  ('Ficha de EPI',               'Ficha de entrega de Equipamento de Proteção Individual', NULL)
ON CONFLICT (nome) DO NOTHING;
