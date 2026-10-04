-- PRE-024 inventory only. ONE operational result; no remediation or deletion decision.
-- Dynamic SQL is SELECT-only. FK paths overlap and must not be summed.
-- TOTAL_REFERENCIAS_EMPRESA deduplicates physical rows across tenant/FK paths;
-- excludes the empresa root, global catalogs and Storage (reported separately).
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH RECURSIVE
 target AS (SELECT '5c114b79-bbd1-4829-b6ac-42da9f7362c0'::uuid AS id),
 auditor AS MATERIALIZED (
  SELECT current_user AS usuario,rolsuper,rolbypassrls,rolsuper OR rolbypassrls AS integral
  FROM pg_roles WHERE rolname=current_user
 ),
 empresa AS MATERIALIZED (
  SELECT e.id,e.razao_social,e.cnpj,e.status,e.created_at,
   e.razao_social='Norveo Tecnologia e Gestão Ltda' AS nome_coincide_seed,
   e.cnpj='12.345.678/0001-99' AS cnpj_coincide_seed
  FROM public.empresas e JOIN target t ON t.id=e.id
 ),
 perfis AS MATERIALIZED (
  SELECT p.id,p.role,p.active,p.created_at,u.id IS NOT NULL AS auth_existe,
   coalesce(p.email='admin@norveo.com.br',false) AS perfil_email_coincide_seed,
   coalesce(u.email='admin@norveo.com.br',false) AS auth_email_coincide_seed
  FROM public.user_profiles p JOIN target t ON p.empresa_id=t.id LEFT JOIN auth.users u ON u.id=p.id
 ),
 colaboradores AS MATERIALIZED (
  SELECT count(*) AS total,count(*) FILTER(WHERE c.active) AS ativos,
   count(*) FILTER(WHERE NOT c.active) AS inativos,
   count(*) FILTER(WHERE c.active IS NULL) AS active_indeterminado
  FROM public.colaboradores c JOIN target t ON c.empresa_id=t.id
 ),
 tenant_tables AS MATERIALIZED (
  SELECT c.oid AS relation,n.nspname,c.relname,
   format('SELECT r.tableoid::text||'':''||r.ctid::text AS row_key FROM %I.%I r WHERE r.empresa_id::text=%L',
    n.nspname,c.relname,(SELECT id::text FROM target)) AS row_query
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='empresa_id' AND NOT a.attisdropped
  WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
 ),
 tenant_counts AS MATERIALIZED (
  SELECT *,((xpath('/table/row/n/text()',query_to_xml(
   'SELECT count(*) AS n FROM ('||row_query||') q',true,false,'')))[1]::text)::bigint AS n
  FROM tenant_tables
 ),
 edges AS MATERIALIZED (
  SELECT k.oid,k.conname,k.confrelid AS parent,k.conrelid AS child,
   cn.nspname AS child_schema,c.relname AS child_table,
   string_agg(format('rCHILD.%I=rPARENT.%I',ca.attname,pa.attname),' AND ' ORDER BY keys.ord) AS predicate,
   pg_get_constraintdef(k.oid) AS definition
  FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
  JOIN pg_namespace cn ON cn.oid=c.relnamespace
  CROSS JOIN LATERAL unnest(k.conkey,k.confkey) WITH ORDINALITY keys(ca,pa,ord)
  JOIN pg_attribute ca ON ca.attrelid=k.conrelid AND ca.attnum=keys.ca
  JOIN pg_attribute pa ON pa.attrelid=k.confrelid AND pa.attnum=keys.pa
  WHERE k.contype='f' GROUP BY k.oid,k.conname,k.confrelid,k.conrelid,cn.nspname,c.relname
 ),
 paths AS (
  SELECT 'public.empresas'::regclass::oid AS relation,ARRAY['public.empresas'::regclass::oid] AS visited,
   0 AS depth,'public.empresas r0'::text COLLATE "C" AS joins,
   'empresas'::text COLLATE "C" AS path,NULL::text COLLATE "C" AS fk_definition
  UNION ALL
  SELECT e.child,p.visited||e.child,p.depth+1,
   p.joins||format(' JOIN %I.%I r%s ON ',e.child_schema,e.child_table,p.depth+1)||
   replace(replace(e.predicate,'CHILD',(p.depth+1)::text),'PARENT',p.depth::text),
   p.path||' -> '||e.child_schema||'.'||e.child_table||' ['||e.conname||']',e.definition
  FROM paths p JOIN edges e ON e.parent=p.relation WHERE NOT e.child=ANY(p.visited)
 ),
 path_queries AS MATERIALIZED (
  SELECT *,format('SELECT r%s.tableoid::text||'':''||r%s.ctid::text AS row_key FROM ',depth,depth)||joins||
   format(' WHERE r0.id=%L',(SELECT id::text FROM target)) AS row_query
  FROM paths WHERE depth>0
 ),
 path_counts AS MATERIALIZED (
  SELECT *,((xpath('/table/row/n/text()',query_to_xml(
   'SELECT count(DISTINCT row_key) AS n FROM ('||row_query||') q',true,false,'')))[1]::text)::bigint AS n
  FROM path_queries
 ),
 sources AS MATERIALIZED (
  SELECT relation,row_query FROM tenant_tables UNION ALL SELECT relation,row_query FROM path_queries
 ),
 relation_counts AS MATERIALIZED (
  SELECT s.relation,n.nspname,c.relname,
   ((xpath('/table/row/n/text()',query_to_xml(
    'SELECT count(DISTINCT row_key) AS n FROM ('||string_agg(s.row_query,' UNION ALL ')||') q',
    true,false,'')))[1]::text)::bigint AS n
  FROM sources s JOIN pg_class c ON c.oid=s.relation JOIN pg_namespace n ON n.oid=c.relnamespace
  GROUP BY s.relation,n.nspname,c.relname
 ),
 reference_total AS MATERIALIZED (
  SELECT CASE WHEN count(*)=0 THEN 0::bigint ELSE
   ((xpath('/table/row/n/text()',query_to_xml(
    'SELECT count(DISTINCT row_key) AS n FROM ('||string_agg(row_query,' UNION ALL ')||') q',
    true,false,'')))[1]::text)::bigint END AS n FROM sources
 ),
 storage_counts AS MATERIALIZED (
  SELECT bucket_id,count(*) AS n FROM storage.objects
  WHERE split_part(name,'/',1)=(SELECT id::text FROM target) GROUP BY bucket_id
 ),
 asos AS MATERIALIZED (
  SELECT count(*) AS n FROM public.documentos d JOIN target t ON d.empresa_id=t.id
  JOIN public.documento_tipos dt ON dt.id=d.tipo_id WHERE dt.nome='ASO'
 ),
 globals AS MATERIALIZED (
  SELECT 'documento_tipos' AS catalogo,count(*) AS n FROM public.documento_tipos
  UNION ALL SELECT 'treinamento_tipos',count(*) FROM public.treinamento_tipos
  UNION ALL SELECT 'exames_catalogo',count(*) FROM public.exames_catalogo
 ),
 facts AS MATERIALIZED (
  SELECT (SELECT integral FROM auditor) AS integral,EXISTS(SELECT 1 FROM empresa) AS existe,
   coalesce((SELECT nome_coincide_seed AND cnpj_coincide_seed FROM empresa),false) AS seed,
   EXISTS(SELECT 1 FROM perfis) AS perfil,(SELECT total>0 FROM colaboradores) AS colaborador,
   EXISTS(SELECT 1 FROM relation_counts WHERE nspname='public' AND relname='documentos' AND n>0) AS documento,
   EXISTS(SELECT 1 FROM relation_counts WHERE nspname='public' AND relname='treinamentos' AND n>0) AS treinamento,
   EXISTS(SELECT 1 FROM storage_counts WHERE n>0) AS storage,
   EXISTS(SELECT 1 FROM relation_counts WHERE n>0 AND NOT(nspname='public' AND relname='user_profiles'))
    OR EXISTS(SELECT 1 FROM storage_counts WHERE n>0) AS operacional
 ),
 report(section,category,check_name,result,status,details) AS (
  SELECT 1,'AUDITOR','Auditor integral',usuario,
   CASE WHEN integral THEN 'OK' ELSE 'BLOQUEIO' END,
   jsonb_build_object('current_user',usuario,'superuser',rolsuper,'bypassrls',rolbypassrls) FROM auditor
  UNION ALL SELECT 2,'EMPRESA','Empresa alvo',razao_social,'OK',to_jsonb(e) FROM empresa e
  UNION ALL SELECT 2,'EMPRESA','Empresa alvo','não encontrada','BLOQUEIO',jsonb_build_object('id',id)
   FROM target WHERE NOT EXISTS(SELECT 1 FROM empresa)
  UNION ALL SELECT 3,'PERFIS','Quantidade de perfis',count(*)::text,'OK',
   jsonb_build_object('auth_ausente',count(*) FILTER(WHERE NOT auth_existe),
    'bootstrap_admin_coincide',coalesce(bool_or(role='admin' AND perfil_email_coincide_seed AND auth_email_coincide_seed),false)) FROM perfis
  UNION ALL SELECT 3,'PERFIS','Perfil: '||id,role::text,
   CASE WHEN auth_existe THEN 'OK' ELSE 'ATENÇÃO' END,to_jsonb(p) FROM perfis p
  UNION ALL SELECT 4,'COLABORADORES','Colaboradores',total::text,'OK',
   jsonb_build_object('total',total,'ativos',ativos,'inativos',inativos,'historicos_total',total,
    'active_indeterminado',active_indeterminado) FROM colaboradores
  UNION ALL SELECT 5,'TABELAS_EMPRESA_ID',nspname||'.'||relname,n::text,'OK',
   jsonb_build_object('schema',nspname,'tabela',relname,'registros',n) FROM tenant_counts
  UNION ALL SELECT 6,'REFERENCIAS_FK',path,n::text,'OK',
   jsonb_build_object('path',path,'fk_definition',fk_definition,'registros',n,'caminhos_sobrepostos_nao_somar',true) FROM path_counts
  UNION ALL SELECT 6,'FK_INVENTARIO',e.conname||': '||e.child::regclass::text,e.definition,'OK',
   jsonb_build_object('origem',e.child::regclass::text,'destino',e.parent::regclass::text,
    'inclui_arestas_de_ciclo',true) FROM edges e WHERE EXISTS(SELECT 1 FROM paths p WHERE p.relation=e.parent)
  UNION ALL SELECT 7,'RESUMO_DOMINIO',nspname||'.'||relname,n::text,'OK',
   jsonb_build_object('schema',nspname,'tabela',relname,'registros_distintos',n,
    'dominio',CASE WHEN relname='user_profiles' THEN 'perfis'
     WHEN relname IN ('empresa_comercial','empresa_features','empresa_limites','empresa_uso','auditoria_comercial','onboarding_solicitacoes') THEN 'comercial'
     WHEN relname='empresa_diagnostico_sst' THEN 'diagnostico SST'
     WHEN relname ~ '(epi|assinatur)' THEN 'EPI/assinaturas' ELSE relname END) FROM relation_counts
  UNION ALL SELECT 7,'RESUMO_DOMINIO','ASOs',n::text,'OK',
   jsonb_build_object('subconjunto_de','public.documentos','criterio','documento_tipos.nome = ASO') FROM asos
  UNION ALL SELECT 8,'STORAGE','Bucket: '||bucket_id,n::text,'OK',jsonb_build_object('bucket',bucket_id,'quantidade',n) FROM storage_counts
  UNION ALL SELECT 8,'STORAGE','Objetos com prefixo da empresa','0','OK',jsonb_build_object('quantidade',0)
   WHERE NOT EXISTS(SELECT 1 FROM storage_counts)
  UNION ALL SELECT 9,'CATÁLOGO_GLOBAL',catalogo,n::text,'OK',jsonb_build_object('pertence_a_empresa',false) FROM globals
  UNION ALL SELECT 10,'CONCLUSAO','TOTAL_REFERENCIAS_EMPRESA',n::text,'OK',
   jsonb_build_object('deduplicado',true,'exclui','empresa raiz, catálogos globais e Storage') FROM reference_total
  UNION ALL SELECT 11,'CONCLUSAO','TEM_PERFIL',perfil::text,'OK','{}'::jsonb FROM facts
  UNION ALL SELECT 12,'CONCLUSAO','TEM_COLABORADORES',colaborador::text,'OK','{}'::jsonb FROM facts
  UNION ALL SELECT 13,'CONCLUSAO','TEM_DOCUMENTOS',documento::text,'OK','{}'::jsonb FROM facts
  UNION ALL SELECT 14,'CONCLUSAO','TEM_TREINAMENTOS',treinamento::text,'OK','{}'::jsonb FROM facts
  UNION ALL SELECT 15,'CONCLUSAO','TEM_STORAGE',storage::text,'OK','{}'::jsonb FROM facts
  UNION ALL SELECT 16,'CONCLUSAO','COINCIDE_COM_SEED',seed::text,'OK',
   jsonb_build_object('criterio','razão social e CNPJ coincidem; não prova natureza de teste') FROM facts
  UNION ALL SELECT 17,'CONCLUSAO','CLASSIFICACAO',
   CASE WHEN NOT integral OR NOT existe THEN 'INDETERMINADO'
    WHEN seed AND operacional THEN 'POSSIVEL_BOOTSTRAP_COM_DADOS'
    WHEN seed THEN 'POSSIVEL_BOOTSTRAP_SEM_DADOS_OPERACIONAIS'
    WHEN operacional THEN 'EMPRESA_COM_USO_OPERACIONAL' ELSE 'INDETERMINADO' END,
   CASE WHEN integral AND existe THEN 'OK' ELSE 'BLOQUEIO' END,
   jsonb_build_object('nao_autoriza_exclusao',true,'dados_operacionais',operacional,
    'criterio_operacional','qualquer referência fora de user_profiles ou objeto Storage',
    'limites','sem FK/empresa_id ou fora do prefixo Storage podem não ser detectados') FROM facts
 )
SELECT row_number() OVER(ORDER BY section,category,check_name) AS "ORDEM",
 category AS "CATEGORIA",check_name AS "CHECK",result AS "RESULTADO",
 CASE WHEN NOT (SELECT integral FROM auditor) THEN 'BLOQUEIO' ELSE status END AS "STATUS",
 details AS "DETALHES"
FROM report ORDER BY "ORDEM";
COMMIT;
