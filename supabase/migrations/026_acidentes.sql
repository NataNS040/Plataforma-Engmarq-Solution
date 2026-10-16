-- 026 Acidentes de trabalho (registro e investigação) + catálogos eSocial do S-2210.
-- Requires 025-A. Additive only: one feature, two tables, one view, one guard trigger.
-- Catalog rows are GENERATED from supabase/data/esocial/*.tsv by tests/026_esocial_generate.mjs;
-- never edit the seed block by hand (`npm run test:026` fails on drift).
-- No DELETE: accidents are history; mistakes are annulled with a reason (server-side authorship).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('engmarq_private.can_use_feature(uuid,text,boolean)') IS NULL
     OR to_regprocedure('engmarq_private.can_access_catalogos(uuid,boolean)') IS NULL
     OR to_regclass('public.empresa_features') IS NULL THEN
    RAISE EXCEPTION '026 requires 025-A entitlements; review before applying';
  END IF;
  IF to_regclass('public.acidentes') IS NOT NULL OR to_regclass('public.esocial_codigos') IS NOT NULL
     OR to_regclass('public.vw_acidentes_resumo') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.features WHERE feature_key = 'acidentes') THEN
    RAISE EXCEPTION '026 objects already present; review drift, no automatic repair';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                 WHERE conname = 'colaboradores_empresa_id_id_key' AND conrelid = 'public.colaboradores'::regclass) THEN
    RAISE EXCEPTION 'Composite colaboradores(empresa_id,id) key from 018 required';
  END IF;
END $$;

LOCK TABLE public.features, public.empresa_features, public.colaboradores IN SHARE ROW EXCLUSIVE MODE;

-- Feature. Granted only to legacy tenants (025 grandfathering); the free tier keeps its 7 features,
-- so the public signup contract (exactly 7 keys) is unaffected.
INSERT INTO public.features(feature_key, descricao)
VALUES ('acidentes', 'Registro e investigação de acidentes de trabalho');
INSERT INTO public.empresa_features(empresa_id, feature_key, enabled)
SELECT c.empresa_id, 'acidentes', true FROM public.empresa_comercial c WHERE c.origem = 'legado'
ON CONFLICT DO NOTHING;

-- eSocial S-1.3 tables used by S-2210: 13 parte atingida, 14 agente causador,
-- 15 situação geradora / agente de doença, 17 natureza da lesão. Global, read-only.
CREATE TABLE public.esocial_codigos (
  tabela smallint NOT NULL CHECK (tabela IN (13, 14, 15, 17)),
  codigo text NOT NULL CHECK (codigo ~ '^[0-9]{9}$'),
  descricao text NOT NULL CHECK (length(descricao) BETWEEN 1 AND 600),
  ativo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tabela, codigo)
);

-- BEGIN GENERATED ESOCIAL SEED
-- 382 codes from supabase/data/esocial/*.tsv, leiaute S-1.3 (cons. até NT 07/2026 rev. 24/09/2026).
INSERT INTO public.esocial_codigos (tabela, codigo, descricao) VALUES
(13,'753030000','Crânio (inclusive encéfalo)'),
(13,'753050000','Ouvido (externo, médio, interno, audição e equilíbrio)'),
(13,'753070100','Olho (inclusive nervo ótico e visão)'),
(13,'753070300','Nariz (inclusive fossas nasais, seios da face e olfato)'),
(13,'753070500','Boca (inclusive lábios, dentes, língua, garganta e paladar)'),
(13,'753070700','Mandíbula (inclusive queixo)'),
(13,'753070800','Face, partes múltiplas (qualquer combinação das partes acima)'),
(13,'753080000','Cabeça, partes múltiplas (qualquer combinação das partes acima)'),
(13,'753090000','Cabeça, NIC'),
(13,'753510000','Braço (entre o punho e o ombro)'),
(13,'753510200','Braço (acima do cotovelo)'),
(13,'754000000','Pescoço'),
(13,'755010400','Cotovelo'),
(13,'755010600','Antebraço (entre o punho e o cotovelo)'),
(13,'755030000','Punho'),
(13,'755050000','Mão (exceto punho ou dedos)'),
(13,'755070000','Dedo'),
(13,'755080000','Membros superiores, partes múltiplas (qualquer combinação das partes acima)'),
(13,'755090000','Membros superiores, NIC'),
(13,'756020000','Ombro'),
(13,'756030000','Tórax (inclusive órgãos internos)'),
(13,'756040000','Dorso (inclusive músculos dorsais, coluna e medula espinhal)'),
(13,'756050000','Abdome (inclusive órgãos internos)'),
(13,'756060000','Quadris (inclusive pélvis, órgãos pélvicos e nádegas)'),
(13,'756070000','Tronco, partes múltiplas (qualquer combinação das partes acima)'),
(13,'756090000','Tronco, NIC'),
(13,'757010000','Perna (entre o tornozelo e a pélvis)'),
(13,'757010200','Coxa'),
(13,'757010400','Joelho'),
(13,'757010600','Perna (do tornozelo, exclusive, ao joelho, exclusive)'),
(13,'757030000','Articulação do tornozelo'),
(13,'757050000','Pé (exceto artelhos)'),
(13,'757070000','Artelho'),
(13,'757080000','Membros inferiores, partes múltiplas (qualquer combinação das partes acima)'),
(13,'757090000','Membros inferiores, NIC'),
(13,'758000000','Partes múltiplas. (aplica-se quando mais de uma parte importante do corpo for afetada, como, por exemplo, um braço e uma perna)'),
(13,'758500000','Sistemas e aparelhos (aplica-se quando o funcionamento de todo um sistema ou aparelho do corpo humano for afetado, sem lesão específica de qualquer outra parte, como no caso do envenenamento, ação corrosiva que afete órgãos internos, lesão dos centros nervosos, etc.; não se aplica quando a lesão sistêmica for provocada por lesão externa, como lesão dorsal que afete nervos da medula espinhal)'),
(13,'758520000','Aparelho circulatório'),
(13,'758530000','Aparelho respiratório'),
(13,'758540000','Sistema nervoso'),
(13,'758550000','Aparelho digestivo'),
(13,'758560000','Aparelho gênito-urinário'),
(13,'758570000','Sistema musculoesquelético'),
(13,'758590000','Sistemas e aparelhos, NIC'),
(13,'759000000','Localização da lesão, NIC'),
(14,'302010200','Rua e estrada - superfície utilizada para sustentar pessoas'),
(14,'302010250','Calçada ou caminho para pedestre - superfície utilizada para sustentar pessoas'),
(14,'302010300','Piso de edifício - superfície utilizada para sustentar pessoas'),
(14,'302010350','Escada permanente cujos degraus permitem apoio integral do pé, degrau - superfície utilizada para sustentar pessoas'),
(14,'302010400','Rampa - superfície utilizada para sustentar pessoas'),
(14,'302010450','Passarela ou plataforma permanentes - superfície utilizada para sustentar pessoas'),
(14,'302010500','Piso de mina - superfície utilizada para sustentar pessoas'),
(14,'302010550','Chão - superfície utilizada para sustentar pessoas'),
(14,'302010600','Piso de andaime e plataforma desmontável - superfície utilizada para sustentar pessoas'),
(14,'302010650','Piso de veiculo - superfície utilizada para sustentar pessoas'),
(14,'302010700','Telhado'),
(14,'302010900','Superfície de sustentação, NIC - superfície utilizada para sustentar pessoas'),
(14,'302030900','Escada móvel ou fixada, NIC'),
(14,'302050100','Edifício - edifício ou estrutura'),
(14,'302050200','Depósito fixo (tanque, silo, paiol, etc.) - edifício ou estrutura'),
(14,'302050300','Cais, doca - edifício ou estrutura'),
(14,'302050400','Dique, barragem - edifício ou estrutura'),
(14,'302050500','Ponte, viaduto - edifício ou estrutura'),
(14,'302050600','Arquibancada, estádio - edifício ou estrutura'),
(14,'302050700','Andaime, plataforma - edifício ou estrutura'),
(14,'302050800','Torre, poste - edifício ou estrutura'),
(14,'302050900','Edifício ou estrutura (exceto piso, superfície de sustentação ou área de circulação), NIC'),
(14,'302070100','Escavação (para edifício, estrada, etc.)'),
(14,'302070300','Canal, fosso'),
(14,'302070500','Poço, entrada, galeria, etc. de mina'),
(14,'302070700','Túnel'),
(14,'302070900','Escavação, fosso, túnel, NIC'),
(14,'302090000','Superfície e estrutura, NIC'),
(14,'303010040','Martelo, malho, marreta - ferramenta manual sem força motriz'),
(14,'303010080','Machadinha, enxó - ferramenta manual sem força motriz'),
(14,'303010120','Faca, facão - ferramenta manual sem força motriz'),
(14,'303010160','Tesoura, tesourão - ferramenta manual sem força motriz'),
(14,'303010200','Formão, cinzel - ferramenta manual sem força motriz'),
(14,'303010240','Serra, serrote - ferramenta manual sem força motriz'),
(14,'303010280','Alicate, torques, tenaz - ferramenta manual sem força motriz'),
(14,'303010320','Plaina - ferramenta manual sem força motriz'),
(14,'303010360','Lima, grosa - ferramenta manual sem força motriz'),
(14,'303010400','Punção, ponteiro, vazador, talhadeira - ferramenta manual sem força motriz'),
(14,'303010440','Pua, trado, verruma, máquina de furar manual - ferramenta manual sem força motriz'),
(14,'303010480','Chave de parafuso - ferramenta manual sem força motriz'),
(14,'303010520','Chave de porca ou de abertura regulável, chave de boca - ferramenta manual sem força motriz'),
(14,'303010560','Alavanca, pé-de-cabra - ferramenta manual sem força motriz'),
(14,'303010600','Corda, cabo, corrente - ferramenta manual sem força motriz'),
(14,'303010640','Machado - ferramenta manual sem força motriz'),
(14,'303010680','Enxada, enxadão, sacho - ferramenta manual sem força motriz'),
(14,'303010720','Pá, cavadeira - ferramenta manual sem força motriz'),
(14,'303010760','Picareta - ferramenta manual sem força motriz'),
(14,'303010800','Garfo, ancinho, forcado - ferramenta manual sem força motriz'),
(14,'303010900','Ferramenta manual sem força motriz, NIC'),
(14,'303015050','Martelete, socador - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015100','Talhadeira - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015150','Cortadeira, guilhotina - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015200','Serra - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015250','Punção, ponteiro, vazador - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015300','Perfuratriz - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015350','Rebitadeira - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015400','Máquina de aparafusar - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015450','Esmeril - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015500','Politriz, enceradeira - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015550','Ferro de passar - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015600','Ferramenta de soldagem - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015650','Maçarico - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015700','Ferramenta acionada por explosivo - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015750','Jato de areia - ferramenta portátil com força motriz ou aquecimento'),
(14,'303015900','Ferramenta portátil com força motriz ou aquecimento, NIC'),
(14,'303020040','Serra - máquina'),
(14,'303020080','Tesoura, guilhotina, máquina de cortar - máquina'),
(14,'303020120','Laminadora, calandra - máquina'),
(14,'303020160','Furadeira, broqueadeira, torno, fresa - máquina'),
(14,'303020200','Prensa - máquina'),
(14,'303020240','Plaina, tupia - máquina'),
(14,'303020280','Máquina de fundir, de forjar, de soldar'),
(14,'303020320','Britador, moinho - máquina'),
(14,'303020360','Misturador, batedeira, agitador - máquina'),
(14,'303020400','Peneira mecânica, máquina separadora - máquina'),
(14,'303020440','Politriz, lixadora, esmeril - máquina'),
(14,'303020480','Máquina de terraplenagem e construção de estrada'),
(14,'303020520','Máquina de mineração e perfuração (de túnel, poço, etc.)'),
(14,'303020560','Máquina agrícola'),
(14,'303020600','Máquina têxtil'),
(14,'303020640','Máquina de costurar e de pespontar'),
(14,'303020680','Máquina de imprimir'),
(14,'303020720','Máquina de escritório'),
(14,'303020760','Máquina de embalar ou empacotar'),
(14,'303020900','Máquina, NIC'),
(14,'303025300','Transportador por gravidade'),
(14,'303025600','Transportador com força motriz'),
(14,'303025900','Transportador, NIC'),
(14,'303030050','Guindaste - equipamento de guindar'),
(14,'303030100','Ponte rolante - equipamento de guindar'),
(14,'303030150','Elevador - equipamento de guindar'),
(14,'303030200','Elevador de caçamba para mineração - equipamento de guindar'),
(14,'303030250','Pá mecânica, draga - equipamento de guindar'),
(14,'303030300','Talha - equipamento de guindar'),
(14,'303030350','Pau de carga - equipamento de guindar'),
(14,'303030400','Macaco (mecânico, hidráulico, pneumático) - equipamento de guindar'),
(14,'303030450','Guincho pneumático - equipamento de guindar'),
(14,'303030500','Guincho elétrico - equipamento de guindar'),
(14,'303030900','Equipamento de guindar, NIC'),
(14,'303035300','Correia - dispositivo de transmissão de energia mecânica'),
(14,'303035400','Corrente, corda, cabo - dispositivo de transmissão de energia mecânica'),
(14,'303035500','Tambor, polia, roldana - dispositivo de transmissão de energia mecânica'),
(14,'303035600','Embreagem de fricção - dispositivo de transmissão de energia mecânica'),
(14,'303035700','Engrenagem - dispositivo de transmissão de energia mecânica'),
(14,'303035900','Dispositivo de transmissão de energia mecânica, NIC'),
(14,'303040100','Gerador - equipamento elétrico'),
(14,'303040200','Condutor - equipamento elétrico'),
(14,'303040300','Transformador, conversor - equipamento elétrico'),
(14,'303040400','Painel de controle, barramento, chave, interruptor, disjuntor, fusível - equipamento elétrico'),
(14,'303040500','Reostato, dispositivo de partida e aparelho de controle, capacitor, retificador, bateria de acumuladores - equipamento elétrico'),
(14,'303040600','Motor elétrico - equipamento elétrico'),
(14,'303040700','Equipamento magnético - equipamento elétrico'),
(14,'303040750','Equipamento eletrolítico - equipamento elétrico'),
(14,'303040800','Equipamento de aquecimento elétrico - equipamento elétrico'),
(14,'303040900','Equipamento elétrico, NIC'),
(14,'303045200','Motor (combustão interna, vapor)'),
(14,'303045400','Bomba'),
(14,'303045600','Turbina'),
(14,'303045900','Motor, bomba, turbina, NIC'),
(14,'303050200','Caldeira'),
(14,'303050400','Vaso sob pressão (para líquido, gás ou vapor)'),
(14,'303050600','Tubo sob pressão (mangueira ou tubo para liquido, gás ou vapor)'),
(14,'303050900','Caldeira, vaso sob pressão, NIC'),
(14,'303055200','Caixão pneumático - equipamento para trabalho em ambiente de pressão anormal'),
(14,'303055400','Escafandro - equipamento para trabalho em ambiente de pressão anormal'),
(14,'303055600','Equipamento de mergulho - equipamento para trabalho em ambiente de pressão anormal'),
(14,'303055900','Equipamento para trabalho em ambiente de pressão anormal, NIC'),
(14,'303060000','Forno, estufa, retorta, aquecedor de ambiente, fogão, etc. (exceto quando a lesão principal for choque elétrico ou eletroplessão) - equipamento de aquecimento'),
(14,'303065000','Equipamento emissor de radiação não ionizante'),
(14,'303065300','Equipamento de iluminação - equipamento emissor de radiação não ionizante'),
(14,'303065600','Arco elétrico - equipamento emissor de radiação não ionizante'),
(14,'303065900','Equipamento emissor de radiação não ionizante, NIC'),
(14,'303066300','Equipamento de iluminação'),
(14,'303066600','Arco elétrico'),
(14,'303070200','Equipamento de raios X - equipamento ou substância emissor de radiação ionizante'),
(14,'303070400','Reator (inclui combustível e resíduo) - equipamento ou substância emissor de radiação ionizante'),
(14,'303070600','Fonte de radioisótopo - equipamento ou substância emissor de radiação ionizante'),
(14,'303070900','Equipamento ou substância emissor de radiação ionizante, NIC'),
(14,'303075100','Bicicleta'),
(14,'303075150','Triciclo'),
(14,'303075200','Motocicleta, motoneta'),
(14,'303075250','Veículo rodoviário motorizado'),
(14,'303075300','Veículo sobre trilho'),
(14,'303075350','Veículo aquático'),
(14,'303075400','Aeronave'),
(14,'303075450','Empilhadeira'),
(14,'303075500','Rebocador mecânico, mula mecânica'),
(14,'303075550','Carro de mão'),
(14,'303075600','Trator'),
(14,'303075650','Veículo de terraplenagem'),
(14,'303075700','Veículo de tração animal'),
(14,'303075750','Veículo deslizante'),
(14,'303075800','Veículo funicular (tração por cabo)'),
(14,'303075900','Veículo, NIC'),
(14,'303090000','Ferramenta, máquina, equipamento, veículo, NIC'),
(14,'305004100','Composto metálico (de chumbo, mercúrio, zinco, cadmio, cromo, etc.)'),
(14,'305004150','Composto de arsênio'),
(14,'305004200','Gás carbônico (dióxido de carbono, CO2)'),
(14,'305004250','Monóxido de carbono (CO)'),
(14,'305004300','Óxidos de nitrogênio (vapores nitrosos)'),
(14,'305004350','Ácido'),
(14,'305004400','Álcali'),
(14,'305004450','Composto de fósforo'),
(14,'305004500','Dissulfeto de carbono'),
(14,'305004550','Cianeto ou composto de cianogênio'),
(14,'305004600','Álcool'),
(14,'305004650','Tetracloreto de carbono'),
(14,'305004700','Composto orgânico halogenado (tricloretileno, percloretileno, cloreto de metilo, substâncias refrigerantes)'),
(14,'305004750','Composto aromático (benzol, toluol, xilol, anilina, etc.)'),
(14,'305004900','Substância química, NIC'),
(14,'305008500','Água (usar quando o estado líquido contribuir preponderantemente para a ocorrência)'),
(14,'305008900','Líquido, NIC'),
(14,'305020000','Partículas não identificadas'),
(14,'305024100','Pele, crina, pelo, lã (em bruto) - produto animal'),
(14,'305024300','Pena - produto animal'),
(14,'305024500','Couro cru ou curtido - produto animal'),
(14,'305024700','Osso - produto animal'),
(14,'305024900','Produto animal, NIC'),
(14,'305028000','Madeira (toro, madeira serrada, pranchão, poste, barrote, ripa e produto de madeira)'),
(14,'305032000','Produto mineral metálico - produto de mineração em bruto ou beneficiado, como minério e concentrado de minério'),
(14,'305032500','Metal (inclui liga ferrosa e não ferrosa, tubo, placa, perfil, trilho, vergalhão, arame, porca, rebite, prego, etc., metal fundido, lingote e sucata de fundição, exceto minério)'),
(14,'305036000','Produto mineral não metálico - produto de mineração, escavação, desbarrancamento, etc., como detrito, argila, areia, cascalho, pedra, etc.'),
(14,'305040100','Petróleo bruto, bruto reduzido'),
(14,'305040150','Asfalto, alcatrão, piche'),
(14,'305040200','Óleo combustível'),
(14,'305040250','Parafina, óleo lubrificante e de corte, graxas'),
(14,'305040300','Gasóleo, óleo diesel'),
(14,'305040350','Querosene'),
(14,'305040400','Nafta e solvente de nafta (éter de petróleo, álcool mineral, solvente aromático, etc.)'),
(14,'305040450','Gasolina (exceto quando a ocorrência for causada preponderantemente por composto de chumbo)'),
(14,'305040500','Hidrocarboneto gasoso (inclui gás liquefeito, gás encanado de nafta, gás natural)'),
(14,'305040600','Carvão'),
(14,'305040650','Coque'),
(14,'305040700','Gás encanado de carvão'),
(14,'305040900','Produto de petróleo e de carvão, NIC'),
(14,'305044000','Vidraria, fibra de vidro, lâmina, etc., exceto frasco, garrafa'),
(14,'305048000','Cerâmica'),
(14,'305048300','Tijolo e telha - cerâmica'),
(14,'305048400','Louça de mesa e outros utensílios (de porcelana, barro, etc.) - cerâmica'),
(14,'305048500','Tubo, manilha - cerâmica'),
(14,'305048600','Revestimento cerâmico (azulejo, mosaico, etc.) - cerâmica'),
(14,'305048700','Louca sanitária (pia, vaso sanitário, etc.) - cerâmica'),
(14,'305048900','Cerâmica, NIC'),
(14,'305052000','Têxteis (inclui fibras animais após o primeiro desengorduramento e limpeza, fibras vegetais e sintéticas (exceto vidro), fio, linha, tecido, passamanaria, feltro e produtos têxteis em geral)'),
(14,'305056000','Plástico (inclui pó, folha, trefilado, barra, perfil, etc.; não inclui produto a ser usado na fabricação de plástico)'),
(14,'305060000','Papel e pasta para papel'),
(14,'305064000','Produto alimentício (inclui carne, leite e derivados, legumes, frutas, cereais e derivados)'),
(14,'305064300','Carne e derivados'),
(14,'305064400','Leite e derivados'),
(14,'305064500','Legume, verdura e derivados'),
(14,'305064600','Fruta e derivados'),
(14,'305064700','Cereal e derivados'),
(14,'305064900','Produto alimentício (inclusive de origem animal), NIC'),
(14,'305068300','Medicamento em geral (exceto produto biológico)'),
(14,'305068600','Produto biológico (soro, toxina, antitoxina, vacina, plasma) - medicamento'),
(14,'305072000','Produto de limpeza, sabão, detergente'),
(14,'305076000','Sucata, entulho, resíduo'),
(14,'305090000','Substância química, material, produto, NIC'),
(14,'306020000','Animal vivo'),
(14,'306040000','Vegetal - planta, árvore, em estado natural, não beneficiada (não inclui grão debulhado, fruto colhido, toro mesmo com galho)'),
(14,'306060000','Agente infeccioso ou parasitário (inclui bactéria, fungo, organismo parasitário, vírus, etc.; não inclui produto químico, preparado farmacêutico ou alimento)'),
(14,'306090000','Ser vivo, NIC'),
(14,'307030100','Cadeira banco - mobiliário e acessórios'),
(14,'307030200','Mesa, carteira, exceto mesa elástica desmontável - mobiliário e acessórios'),
(14,'307030250','Mesa elástica desmontável - mobiliário e acessórios'),
(14,'307030300','Balcão, bancada - mobiliário e acessórios'),
(14,'307030400','Arquivo, fichário, estante - mobiliário e acessórios'),
(14,'307030500','Tapete, forração de piso, capacho - mobiliário e acessórios'),
(14,'307030600','Luminária, globo, lâmpada - mobiliário e acessórios'),
(14,'307030900','Mobiliário e acessórios, NIC'),
(14,'307040100','Caixa, engradado, caixote - embalagem, recipiente (vazio ou cheio)'),
(14,'307040300','Frasco, garrafa - embalagem, recipiente (vazio ou cheio)'),
(14,'307040500','Barril, barrica, barrilete, tambor - embalagem, recipiente (vazio ou cheio)'),
(14,'307040700','Tanque, cilindro (transportáveis e não sob pressão) - embalagem, recipiente (vazio ou cheio)'),
(14,'307040900','Embalagem, recipiente (vazio ou cheio), NIC'),
(14,'307050900','Vestuário, NIC'),
(14,'307070000','Área ou ambiente de trabalho (o agente do acidente ocorrido em consequência de fenômeno atmosférico, meteoro, etc., assim como da ação da radiação solar, deverá ser incluído neste item)'),
(14,'309000000','Agente do acidente, NIC'),
(14,'309500000','Agente do acidente inexistente'),
(14,'354000000','Energia'),
(14,'354010300','Pressão ambiente alta (trabalho em caixão pneumático, mergulho)'),
(14,'354010600','Pressão ambiente baixa (ar rarefeito)'),
(14,'354020000','Ruído'),
(14,'354040000','Fogo, chama, material incandescente ou quente, fumaça'),
(14,'354050300','Temperatura ambiente (não inclui a de objeto ou substância quente)'),
(14,'355016000','Aerodispersoides'),
(14,'355016600','Neblina'),
(14,'355016800','Gás e vapor'),
(15,'200004300','Impacto de pessoa contra objeto parado'),
(15,'200004600','Impacto de pessoa contra objeto em movimento'),
(15,'200008300','Impacto sofrido por pessoa, de objeto que cai'),
(15,'200008600','Impacto sofrido por pessoa, de objeto projetado'),
(15,'200008900','Impacto sofrido por pessoa, NIC'),
(15,'200012200','Queda de pessoa com diferença de nível de andaime, passagem, plataforma, etc'),
(15,'200012300','Queda de pessoa com diferença de nível de escada móvel ou fixada cujos degraus não permitem o apoio integral do pé'),
(15,'200012400','Queda de pessoa com diferença de nível de material empilhado'),
(15,'200012500','Queda de pessoa com diferença de nível de veículo'),
(15,'200012600','Queda de pessoa com diferença de nível em escada permanente cujos degraus permitem apoio integral do pé'),
(15,'200012700','Queda de pessoa com diferença de nível em poço, escavação, abertura no piso, etc. (da borda da abertura)'),
(15,'200012900','Queda de pessoa com diferença de nível, NIC'),
(15,'200016300','Queda de pessoa em mesmo nível em passagem ou superfície de sustentação'),
(15,'200016600','Queda de pessoa em mesmo nível sobre ou contra alguma coisa'),
(15,'200016900','Queda de pessoa em mesmo nível, NIC'),
(15,'200020100','Aprisionamento em, sob ou entre objetos em movimento convergente (calandra) ou de encaixe'),
(15,'200020300','Aprisionamento em, sob ou entre um objeto parado e outro em movimento'),
(15,'200020500','Aprisionamento em, sob ou entre dois ou mais objetos em movimento (sem encaixe)'),
(15,'200020700','Aprisionamento em, sob ou entre desabamento ou desmoronamento de edificação, barreira, etc'),
(15,'200020900','Aprisionamento em, sob ou entre, NIC'),
(15,'200024300','Atrito ou abrasão por encostar, pisar, ajoelhar ou sentar em objeto (não em vibração)'),
(15,'200024400','Atrito ou abrasão por manusear objeto (não em vibração)'),
(15,'200024500','Atrito ou abrasão por objeto em vibração'),
(15,'200024600','Atrito ou abrasão por corpo estranho no olho'),
(15,'200024700','Atrito ou abrasão por compressão repetitiva'),
(15,'200024900','Atrito ou abrasão, NIC'),
(15,'200028300','Reação do corpo a seus movimentos - movimento involuntário (escorregão sem queda, etc.)'),
(15,'200028600','Reação do corpo a seus movimentos - movimento voluntário'),
(15,'200032200','Esforço excessivo ao erguer objeto'),
(15,'200032400','Esforço excessivo ao empurrar ou puxar objeto'),
(15,'200032600','Esforço excessivo ao manejar, sacudir ou arremessar objeto'),
(15,'200032900','Esforço excessivo, NIC'),
(15,'200036000','Exposição à energia elétrica'),
(15,'200040300','Contato com objeto ou substância a temperatura muito alta'),
(15,'200040600','Contato com objeto ou substância a temperatura muito baixa'),
(15,'200044300','Exposição à temperatura ambiente elevada'),
(15,'200044600','Exposição à temperatura ambiente baixa'),
(15,'200048200','Inalação de substância cáustica, tóxica ou nociva'),
(15,'200048400','Ingestão de substancia cáustica, tóxica ou nociva'),
(15,'200048600','Absorção (por contato) de substância cáustica, tóxica ou nociva'),
(15,'200048900','Inalação, ingestão e absorção, NIC'),
(15,'200052000','Imersão'),
(15,'200056000','Exposição à radiação não ionizante'),
(15,'200060000','Exposição à radiação ionizante'),
(15,'200064000','Exposição ao ruído'),
(15,'200068000','Exposição à vibração'),
(15,'200072000','Exposição à pressão ambiente'),
(15,'200072300','Exposição à pressão ambiente elevada'),
(15,'200072600','Exposição à pressão ambiente baixa'),
(15,'200076200','Exposição à poluição da água'),
(15,'200076400','Exposição à poluição do ar'),
(15,'200076600','Exposição à poluição do solo'),
(15,'200076900','Exposição à poluição, NIC'),
(15,'200080200','Ataque de ser vivo por mordedura, picada, chifrada, coice, etc'),
(15,'200080400','Ataque de ser vivo com peçonha'),
(15,'200080600','Ataque de ser vivo com transmissão de doença'),
(15,'200080900','Ataque de ser vivo (inclusive do homem), NIC'),
(15,'200080901','Contato com pessoas doentes ou material infectocontagiante - agentes biológicos'),
(15,'209000000','Tipo, NIC'),
(15,'209500000','Tipo inexistente'),
(17,'702000000','Lesão imediata'),
(17,'702005000','Escoriação, abrasão (ferimento superficial)'),
(17,'702010000','Corte, laceração, ferida contusa, punctura (ferida aberta)'),
(17,'702015000','Contusão, esmagamento (superfície cutânea intacta)'),
(17,'702020000','Distensão, torção'),
(17,'702025000','Inflamação de articulação, tendão ou músculo (inclui sinovite, tenossionovite, etc.; não inclui distensão, torção ou suas consequências)'),
(17,'702030000','Luxação'),
(17,'702035000','Fratura'),
(17,'702040000','Queimadura ou escaldadura - efeito de temperatura elevada ou efeito do contato com substância quente (inclui queimadura por eletricidade, mas não inclui choque elétrico; não inclui queimadura por substância química, efeito de radiação, queimadura de sol, incapacidade sistêmica como intermação, queimadura por atrito, etc.)'),
(17,'702042000','Queimadura química (lesão de tecido provocada pela ação corrosiva de produto químico, suas emanações, etc.)'),
(17,'702045000','Efeito de radiação (imediato) - queimadura de sol e toda forma de lesão de tecido, osso ou fluido orgânico, por exposição à radiação'),
(17,'702048000','Congelamento, geladura e outros efeitos da exposição à baixa temperatura'),
(17,'702050000','Asfixia, estrangulamento, afogamento'),
(17,'702055000','Intermação, insolação, cãibra, exaustão e outros efeitos da temperatura ambiente elevada (não inclui queimadura de sol ou outros efeitos de radiação)'),
(17,'702060000','Choque elétrico e eletroplessão (eletrocussão)'),
(17,'702065000','Hérnia de qualquer natureza, ruptura'),
(17,'702070000','Amputação ou enucleação'),
(17,'702075000','Perda ou diminuição de sentido (audição, visão, olfato, paladar e tato, desde que não seja sequela de outra lesão)'),
(17,'702080000','Concussão cerebral'),
(17,'702090000','Lesão imediata, NIC'),
(17,'704020000','Doença contagiosa ou infecciosa (tuberculose, brucelose, etc.)'),
(17,'704030000','Pneumoconiose (silicose, asbestose, etc.)'),
(17,'704040000','Dermatose (erupção, inflamação da pele, inclusive furúnculo, etc.) - geralmente provocada pelo contato direto com substâncias ou agentes sensibilizantes ou irritantes, tais como medicamentos, óleos, agentes biológicos, plantas, madeiras ou metais (não inclui lesão provocada pela ação corrosiva de produtos químicos, queimadura por contato com substâncias quentes, efeito de exposição à radiação, efeito de exposição a baixas temperaturas ou inflamação ou irritação causada por fricção ou impacto)'),
(17,'704050000','Envenenamento sistêmico - condição mórbida sistêmica provocada por inalação, ingestão ou absorção cutânea de substância tóxica, que afete o metabolismo, o funcionamento do sistema nervoso, do aparelho circulatório, do aparelho digestivo, do aparelho respiratório, dos órgãos de excreção, do sistema musculoesquelético, etc. (inclui ação de produto químico, medicamento, metal ou peçonha; não inclui efeito de radiação, pneumoconiose, efeito corrosivo de produto químico, irritação cutânea, septicemia ou caso de ferida infectada)'),
(17,'704060000','Perda ou diminuição mediatas de sentido (audição, visão, olfato, paladar e tato, desde que não seja sequela de outra lesão)'),
(17,'704070000','Efeito de radiação (mediato) - queimadura do sol e toda forma de lesão de tecido, osso, ou fluido orgânico por exposição à radiação.'),
(17,'704090000','Doença, NIC'),
(17,'706050000','Lesões múltiplas'),
(17,'706090000','Outras lesões, NIC');
-- END GENERATED ESOCIAL SEED

ALTER TABLE public.esocial_codigos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esocial_codigos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.esocial_codigos TO authenticated;
CREATE POLICY esocial_codigos_read ON public.esocial_codigos FOR SELECT TO authenticated
  USING (engmarq_private.can_access_catalogos(public.get_user_empresa_id()));
CREATE POLICY feature_guard ON public.esocial_codigos AS RESTRICTIVE FOR SELECT TO authenticated
  USING (engmarq_private.can_use_feature(public.get_user_empresa_id(), 'acidentes'));

CREATE TABLE public.acidentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  colaborador_id uuid NOT NULL,
  -- eSocial tpAcid: 1 típico, 2 doença, 3 trajeto.
  tipo text NOT NULL CHECK (tipo IN ('tipico', 'doenca', 'trajeto')),
  data_acidente date NOT NULL CHECK (data_acidente >= DATE '1990-01-01'),
  hora_acidente time,
  minutos_trabalhados_antes integer CHECK (minutos_trabalhados_antes BETWEEN 0 AND 5999),
  local_tipo smallint CHECK (local_tipo IN (1, 2, 3, 4, 5, 6, 9)),
  local_descricao text CHECK (length(local_descricao) BETWEEN 1 AND 255),
  parte_tabela smallint GENERATED ALWAYS AS (13) STORED,
  codigo_parte_atingida text,
  lateralidade smallint CHECK (lateralidade IN (0, 1, 2, 3)),
  agente_tabela smallint,
  codigo_agente_causador text,
  situacao_tabela smallint GENERATED ALWAYS AS (15) STORED,
  codigo_situacao_geradora text,
  lesao_tabela smallint GENERATED ALWAYS AS (17) STORED,
  codigo_natureza_lesao text,
  descricao_lesao text CHECK (length(descricao_lesao) BETWEEN 1 AND 200),
  gravidade text NOT NULL CHECK (gravidade IN ('sem_lesao', 'leve', 'moderada', 'grave', 'fatal')),
  piramide_bird text CHECK (piramide_bird IN ('lesao_grave', 'lesao_leve', 'dano_material', 'quase_acidente')),
  houve_afastamento boolean NOT NULL DEFAULT false,
  ultimo_dia_trabalhado date,
  data_retorno date,
  dias_perdidos integer CHECK (dias_perdidos BETWEEN 0 AND 36500),
  houve_obito boolean NOT NULL DEFAULT false,
  data_obito date,
  comunicado_policia boolean NOT NULL DEFAULT false,
  emitir_cat boolean NOT NULL DEFAULT false,
  numero_recibo_cat text CHECK (numero_recibo_cat ~ '^[0-9.]{1,23}$'),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_investigacao', 'concluido')),
  detalhes text CHECK (length(detalhes) BETWEEN 1 AND 4000),
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  atualizado_em timestamptz,
  anulado_por uuid,
  anulado_em timestamptz,
  motivo_anulacao text CHECK (length(motivo_anulacao) BETWEEN 3 AND 500),
  CONSTRAINT acidentes_empresa_id_id_key UNIQUE (empresa_id, id),
  CONSTRAINT acidentes_colaborador_fkey FOREIGN KEY (empresa_id, colaborador_id)
    REFERENCES public.colaboradores(empresa_id, id),
  CONSTRAINT acidentes_parte_fkey FOREIGN KEY (parte_tabela, codigo_parte_atingida)
    REFERENCES public.esocial_codigos(tabela, codigo),
  CONSTRAINT acidentes_agente_fkey FOREIGN KEY (agente_tabela, codigo_agente_causador)
    REFERENCES public.esocial_codigos(tabela, codigo),
  CONSTRAINT acidentes_situacao_fkey FOREIGN KEY (situacao_tabela, codigo_situacao_geradora)
    REFERENCES public.esocial_codigos(tabela, codigo),
  CONSTRAINT acidentes_lesao_fkey FOREIGN KEY (lesao_tabela, codigo_natureza_lesao)
    REFERENCES public.esocial_codigos(tabela, codigo),
  -- S-2210: típico/trajeto use Tabela 14; doença may use 14 or 15.
  CONSTRAINT acidentes_agente_tabela_check CHECK (
    (agente_tabela IS NULL AND codigo_agente_causador IS NULL)
    OR (codigo_agente_causador IS NOT NULL AND (agente_tabela = 14 OR (agente_tabela = 15 AND tipo = 'doenca')))),
  CONSTRAINT acidentes_lateralidade_parte_check CHECK (lateralidade IS NULL OR codigo_parte_atingida IS NOT NULL),
  CONSTRAINT acidentes_doenca_horario_check CHECK (
    tipo <> 'doenca' OR (hora_acidente IS NULL AND minutos_trabalhados_antes IS NULL)),
  CONSTRAINT acidentes_afastamento_check CHECK (
    houve_afastamento OR (data_retorno IS NULL AND dias_perdidos IS NULL)),
  CONSTRAINT acidentes_retorno_check CHECK (data_retorno IS NULL OR data_retorno >= data_acidente),
  CONSTRAINT acidentes_obito_check CHECK (
    (NOT houve_obito AND data_obito IS NULL)
    OR (houve_obito AND data_obito IS NOT NULL AND data_obito >= data_acidente AND gravidade = 'fatal')),
  CONSTRAINT acidentes_anulacao_check CHECK (
    (anulado_em IS NULL AND anulado_por IS NULL AND motivo_anulacao IS NULL)
    OR (anulado_em IS NOT NULL AND anulado_por IS NOT NULL AND motivo_anulacao IS NOT NULL))
);
CREATE INDEX acidentes_empresa_data_idx ON public.acidentes (empresa_id, data_acidente DESC);
CREATE INDEX acidentes_colaborador_idx ON public.acidentes (empresa_id, colaborador_id);

-- Authorship and timestamps come from the server, never from the client.
CREATE FUNCTION engmarq_private.guard_acidente_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor record;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT p.empresa_id, p.role, p.active, e.status INTO actor
    FROM public.user_profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() FOR SHARE OF p, e;
  IF NOT FOUND OR NOT actor.active OR actor.status <> 'ativa' OR actor.role NOT IN ('empresa', 'gestor') THEN
    RAISE EXCEPTION 'Accident write denied' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Accident history cannot be deleted; annul it instead' USING ERRCODE = '42501';
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM actor.empresa_id THEN
    RAISE EXCEPTION 'Tenant mismatch' USING ERRCODE = '42501';
  END IF;
  IF NEW.data_acidente > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Accident date cannot be in the future' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := auth.uid();
    NEW.created_at := clock_timestamp();
    NEW.atualizado_por := NULL; NEW.atualizado_em := NULL;
    NEW.anulado_por := NULL; NEW.anulado_em := NULL; NEW.motivo_anulacao := NULL;
    RETURN NEW;
  END IF;
  IF OLD.anulado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Annulled accident is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.motivo_anulacao IS NOT NULL THEN
    -- Annulment is its own statement: only the reason may change.
    IF (to_jsonb(NEW) - ARRAY['motivo_anulacao','parte_tabela','situacao_tabela','lesao_tabela'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['motivo_anulacao','parte_tabela','situacao_tabela','lesao_tabela']) THEN
      RAISE EXCEPTION 'Annulment cannot change other fields' USING ERRCODE = '42501';
    END IF;
    NEW.anulado_por := auth.uid();
    NEW.anulado_em := clock_timestamp();
  END IF;
  NEW.atualizado_por := auth.uid();
  NEW.atualizado_em := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.guard_acidente_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_acidente_write BEFORE INSERT OR UPDATE OR DELETE ON public.acidentes
  FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_acidente_write();

ALTER TABLE public.acidentes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.acidentes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.acidentes TO authenticated;
GRANT INSERT (empresa_id, colaborador_id, tipo, data_acidente, hora_acidente, minutos_trabalhados_antes,
  local_tipo, local_descricao, codigo_parte_atingida, lateralidade, agente_tabela, codigo_agente_causador,
  codigo_situacao_geradora, codigo_natureza_lesao, descricao_lesao, gravidade, piramide_bird,
  houve_afastamento, ultimo_dia_trabalhado, data_retorno, dias_perdidos, houve_obito, data_obito,
  comunicado_policia, emitir_cat, numero_recibo_cat, status, detalhes) ON public.acidentes TO authenticated;
GRANT UPDATE (colaborador_id, tipo, data_acidente, hora_acidente, minutos_trabalhados_antes,
  local_tipo, local_descricao, codigo_parte_atingida, lateralidade, agente_tabela, codigo_agente_causador,
  codigo_situacao_geradora, codigo_natureza_lesao, descricao_lesao, gravidade, piramide_bird,
  houve_afastamento, ultimo_dia_trabalhado, data_retorno, dias_perdidos, houve_obito, data_obito,
  comunicado_policia, emitir_cat, numero_recibo_cat, status, detalhes, motivo_anulacao)
  ON public.acidentes TO authenticated;
CREATE POLICY acidentes_select ON public.acidentes FOR SELECT TO authenticated
  USING (engmarq_private.can_access_catalogos(empresa_id));
CREATE POLICY acidentes_insert ON public.acidentes FOR INSERT TO authenticated
  WITH CHECK (engmarq_private.can_access_catalogos(empresa_id, true));
CREATE POLICY acidentes_update ON public.acidentes FOR UPDATE TO authenticated
  USING (engmarq_private.can_access_catalogos(empresa_id, true) AND anulado_em IS NULL)
  WITH CHECK (engmarq_private.can_access_catalogos(empresa_id, true));
CREATE POLICY feature_select_guard ON public.acidentes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (engmarq_private.can_use_feature(empresa_id, 'acidentes'));
CREATE POLICY feature_insert_guard ON public.acidentes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (engmarq_private.can_use_feature(empresa_id, 'acidentes', true));
CREATE POLICY feature_update_guard ON public.acidentes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (engmarq_private.can_use_feature(empresa_id, 'acidentes', true))
  WITH CHECK (engmarq_private.can_use_feature(empresa_id, 'acidentes', true));
CREATE POLICY feature_delete_guard ON public.acidentes AS RESTRICTIVE FOR DELETE TO authenticated
  USING (engmarq_private.can_use_feature(empresa_id, 'acidentes', true));

-- Monthly aggregate for KPIs and the Bird pyramid: the client never downloads every accident.
CREATE VIEW public.vw_acidentes_resumo WITH (security_invoker = true) AS
SELECT empresa_id, date_trunc('month', data_acidente)::date AS mes, tipo, gravidade, piramide_bird,
       houve_afastamento, emitir_cat, count(*)::integer AS total,
       coalesce(sum(dias_perdidos), 0)::integer AS dias_perdidos
  FROM public.acidentes
 WHERE anulado_em IS NULL
 GROUP BY empresa_id, date_trunc('month', data_acidente), tipo, gravidade, piramide_bird, houve_afastamento, emitir_cat;
REVOKE ALL ON public.vw_acidentes_resumo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_acidentes_resumo TO authenticated;
COMMIT;
