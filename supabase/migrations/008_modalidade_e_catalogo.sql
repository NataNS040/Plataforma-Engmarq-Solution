-- ENGMARQ SST - Migration 008: Modalidade de treinamento + catálogo completo de NRs
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + ON CONFLICT DO NOTHING.

-- -------------------------------------------------------
-- Adiciona coluna modalidade em treinamentos
-- -------------------------------------------------------
ALTER TABLE treinamentos
  ADD COLUMN IF NOT EXISTS modalidade TEXT
    CHECK (modalidade IN ('presencial', 'online', 'semipresencial'));

-- -------------------------------------------------------
-- treinamento_tipos: garante RLS + política de leitura
-- -------------------------------------------------------
ALTER TABLE treinamento_tipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "treinamento_tipos_read" ON treinamento_tipos;
CREATE POLICY "treinamento_tipos_read" ON treinamento_tipos FOR SELECT
  TO authenticated
  USING (true);

-- -------------------------------------------------------
-- Catálogo completo de treinamentos NR
-- -------------------------------------------------------
INSERT INTO treinamento_tipos (nome, nr_referencia, validade_meses) VALUES
  ('NR 01 – Integração à Norma Regulamentadora NR 01',                                                              'NR 01',  24),
  ('NR 01 – Integração de Segurança do Trabalho',                                                                   'NR 01',  24),
  ('NR 05 – CIPA – Comissão Interna de Prevenção de Acidentes e de Assédio',                                        'NR 05',  12),
  ('NR 05 – CIPA – Representante Nomeado',                                                                          'NR 05',  12),
  ('NR 06 – Equipamentos de Proteção Individual (EPI)',                                                             'NR 06',  12),
  ('NR 10 – Segurança em Instalações e Serviços em Eletricidade',                                                   'NR 10',  24),
  ('NR 10 SEP – Segurança no Sistema Elétrico de Potência',                                                         'NR 10',  12),
  ('NR 11 – Segurança na Operação de Empilhadeira',                                                                 'NR 11',  12),
  ('NR 11 – Segurança nas Operações com Ponte Rolante',                                                             'NR 11',  12),
  ('NR 12 – Segurança na Operação e Intervenção em Máquinas e Equipamentos',                                        'NR 12',  12),
  ('NR 12 – Máquinas e Equipamentos – Ferramentas Elétricas e Manuais',                                             'NR 12',  12),
  ('NR 12 – Treinamento de Operador de Motosserra',                                                                 'NR 12',  12),
  ('NR 13 – Segurança na Operação de Caldeiras e Vasos de Pressão',                                                 'NR 13',  12),
  ('NR 13 – Segurança na Operação de Caldeiras',                                                                    'NR 13',  12),
  ('NR 17 – Ergonomia',                                                                                             'NR 17',  NULL),
  ('NR 17 – Ergonomia para Teleatendimento/Telemarketing',                                                          'NR 17',  NULL),
  ('NR 17 – Ergonomia para Operadores de Check-Out',                                                                'NR 17',  NULL),
  ('NR 18 – Integração de Segurança na Construção Civil',                                                           'NR 18',  12),
  ('NR 20 – Exposição Ocupacional ao Benzeno em Postos Revendedores de Combustíveis',                               'NR 20',  12),
  ('NR 20 – Iniciação sobre Inflamáveis e Combustíveis',                                                            'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Básico Classe 1',                                                'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Básico Classe 2',                                                'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Básico Classe 3',                                                'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Intermediário Classe 1',                                         'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Intermediário Classe 2',                                         'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Intermediário Classe 3',                                         'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Avançado 1',                                                     'NR 20',  12),
  ('NR 20 – Segurança com Líquidos e Inflamáveis – Avançado 2',                                                     'NR 20',  12),
  ('NR 23 – Combate a Incêndio – Básico',                                                                           'NR 23',  12),
  ('NR 23 – Combate a Incêndio – Intermediário',                                                                    'NR 23',  12),
  ('NR 23 – Prevenção e Combate a Incêndios – Avançado',                                                            'NR 23',  12),
  ('NR 26 – Sinalização de Segurança',                                                                              'NR 26',  24),
  ('NR 31 – Segurança na Aplicação e Manejo de Agrotóxicos',                                                        'NR 31',  12),
  ('NR 31 – CIPATR',                                                                                                'NR 31',  12),
  ('NR 32 – Capacitação para Serviços de Saúde',                                                                    'NR 32',  24),
  ('NR 33 – Segurança em Espaço Confinado – Vigia e Trabalhador Autorizado',                                        'NR 33',  12),
  ('NR 33 – Segurança em Espaço Confinado – Supervisor de Entrada',                                                 'NR 33',  12),
  ('NR 34.5 – Segurança para Trabalho a Quente',                                                                    'NR 34',  12),
  ('NR 35 – Trabalho em Altura',                                                                                    'NR 35',  24),
  ('NR 38 – Segurança e Saúde no Trabalho nas Atividades de Limpeza Urbana e Manejo de Resíduos Sólidos',           'NR 38',  12),
  ('Direção Defensiva',                                                                                             NULL,     24),
  ('Primeiros Socorros',                                                                                            NULL,     12),
  ('Prevenção ao Assédio Moral e Sexual no Trabalho',                                                               NULL,     12),
  ('Segurança na Operação, Distribuição, Armazenagem e Transporte de Cilindros de Gases',                           NULL,     12),
  ('Programa de Conservação Auditiva (PCA)',                                                                        NULL,     12),
  ('LOTO – Lockout e Tagout',                                                                                       NULL,     12),
  ('Brigada de Incêndio',                                                                                           NULL,     12)
ON CONFLICT (nome) DO NOTHING;
