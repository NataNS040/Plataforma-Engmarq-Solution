-- PRE-024 preflight CNPJ correction ONLY. Save the complete result.
-- One operational result, no personal rows, paths, contacts or file contents.
-- Counts are the owner-reported baseline; abort/review any discrepancy.
-- Compare PRESERVACAO fingerprints across pre/post; hashes alone are not counts.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH normalized AS (
 SELECT id,cnpj,CASE WHEN btrim(cnpj) COLLATE "C" ~ '^([0-9A-Za-z]{12}[0-9]{2}|[0-9A-Za-z]{2}\.[0-9A-Za-z]{3}\.[0-9A-Za-z]{3}/[0-9A-Za-z]{4}-[0-9]{2})$'
 THEN translate(btrim(cnpj),'abcdefghijklmnopqrstuvwxyz./-','ABCDEFGHIJKLMNOPQRSTUVWXYZ') END canonical FROM public.empresas
),digits AS (
 SELECT n.*, (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,12) j) remainder1,
 (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,13) j) remainder2
 FROM normalized n
),validated AS (
 SELECT *,coalesce(canonical IS NOT NULL AND canonical<>repeat(substr(canonical,1,1),14)
 AND substr(canonical,13,1)=(CASE WHEN remainder1<2 THEN 0 ELSE 11-remainder1 END)::text
 AND substr(canonical,14,1)=(CASE WHEN remainder2<2 THEN 0 ELSE 11-remainder2 END)::text,false) valid FROM digits
),new_normalized AS (
 SELECT id,cnpj,CASE WHEN btrim(cnpj) COLLATE "C" ~ '^([0-9A-Za-z]{12}[0-9]{2}|[0-9A-Za-z]{2}\.[0-9A-Za-z]{3}\.[0-9A-Za-z]{3}/[0-9A-Za-z]{4}-[0-9]{2})$'
 THEN translate(btrim(cnpj),'abcdefghijklmnopqrstuvwxyz./-','ABCDEFGHIJKLMNOPQRSTUVWXYZ') END canonical FROM (VALUES ('5c114b79-bbd1-4829-b6ac-42da9f7362c0'::uuid,'60.545.359/0001-76'::text)) input(id,cnpj)
),new_digits AS (
 SELECT n.*, (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,12) j) remainder1,
 (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,13) j) remainder2
 FROM new_normalized n
),new_validated AS (
 SELECT *,coalesce(canonical IS NOT NULL AND canonical<>repeat(substr(canonical,1,1),14)
 AND substr(canonical,13,1)=(CASE WHEN remainder1<2 THEN 0 ELSE 11-remainder1 END)::text
 AND substr(canonical,14,1)=(CASE WHEN remainder2<2 THEN 0 ELSE 11-remainder2 END)::text,false) valid FROM new_digits
),
counts(label,n,expected) AS (
 SELECT 'PERFIS',count(*),1 FROM public.user_profiles WHERE empresa_id='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
 UNION ALL SELECT 'COLABORADORES',count(*),1 FROM public.colaboradores WHERE empresa_id='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
 UNION ALL SELECT 'COLABORADORES_ATIVOS',count(*),1 FROM public.colaboradores WHERE empresa_id='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND active
 UNION ALL SELECT 'FUNCOES',count(*),1 FROM public.funcoes WHERE empresa_id='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
 UNION ALL SELECT 'SETORES',count(*),1 FROM public.setores WHERE empresa_id='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
 UNION ALL SELECT 'DOCUMENTOS',count(*),1 FROM public.documentos WHERE empresa_id='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
 UNION ALL SELECT 'ASOS',count(*),1 FROM public.documentos d JOIN public.documento_tipos t ON t.id=d.tipo_id
 WHERE d.empresa_id='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND t.nome='ASO'
 UNION ALL SELECT 'STORAGE',count(*),1 FROM storage.objects WHERE split_part(name,'/',1)='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
 UNION ALL SELECT 'STORAGE_DOCUMENTOS',count(*),1 FROM storage.objects
 WHERE split_part(name,'/',1)='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND bucket_id='documentos'
),protected AS (
 SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','engmarq_private','auth','storage') AND c.relkind IN ('r','p')
),fingerprints AS MATERIALIZED (
 SELECT nspname,relname,(xpath('/table/row/hash/text()',query_to_xml(format(
 'SELECT md5(coalesce(jsonb_agg(payload ORDER BY payload::text)::text,''[]'')) AS hash FROM (SELECT %s AS payload FROM %I.%I r) q',
 CASE WHEN nspname='public' AND relname='empresas' THEN
 'CASE WHEN r.id=''5c114b79-bbd1-4829-b6ac-42da9f7362c0''::uuid THEN to_jsonb(r)-''cnpj'' ELSE to_jsonb(r) END' ELSE 'to_jsonb(r)' END,
 nspname,relname),true,false,'')))[1]::text AS hash FROM protected
),fk_queries AS (
 SELECT k.oid,k.conname,k.conrelid::regclass::text AS child,k.confrelid::regclass::text AS parent,k.convalidated,
 format('SELECT count(*) AS n FROM %I.%I c WHERE ',cn.nspname,c.relname)||
 CASE WHEN k.confmatchtype='f' THEN '('||string_agg(format('c.%I IS NOT NULL',ca.attname),' OR ' ORDER BY keys.ord)||')'
 ELSE '('||string_agg(format('c.%I IS NOT NULL',ca.attname),' AND ' ORDER BY keys.ord)||')' END||
 format(' AND NOT EXISTS(SELECT 1 FROM %I.%I p WHERE ',pn.nspname,p.relname)||
 string_agg(format('c.%I=p.%I',ca.attname,pa.attname),' AND ' ORDER BY keys.ord)||')' AS query
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
 JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace
 CROSS JOIN LATERAL unnest(k.conkey,k.confkey) WITH ORDINALITY keys(ca,pa,ord)
 JOIN pg_attribute ca ON ca.attrelid=k.conrelid AND ca.attnum=keys.ca
 JOIN pg_attribute pa ON pa.attrelid=k.confrelid AND pa.attnum=keys.pa
 WHERE k.contype='f' AND cn.nspname IN ('public','engmarq_private','auth','storage')
 GROUP BY k.oid,k.conname,k.conrelid,k.confrelid,k.convalidated,k.confmatchtype,cn.nspname,c.relname,pn.nspname,p.relname
),fk_checks AS MATERIALIZED (
 SELECT *,((xpath('/table/row/n/text()',query_to_xml(query,true,false,'')))[1]::text)::bigint AS invalid FROM fk_queries
),
baseline_current AS MATERIALIZED (SELECT jsonb_object_agg(nspname||'.'||relname,hash) AS hashes FROM fingerprints),

checks(category,label,passed,result,details) AS (
 SELECT 'AUDITOR','Auditor privilegiado',EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)),
 current_user,jsonb_build_object('current_user',current_user)
 UNION ALL SELECT 'ESCOPO','PRE_024',to_regprocedure('engmarq_private.cnpj_canonico(text)') IS NULL
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empresas'::regclass AND attname='cnpj_canonico' AND NOT attisdropped),
 'helpers/coluna da 024 devem estar ausentes','{}'::jsonb
 UNION ALL SELECT 'EMPRESA','EMPRESA_CORRETA',count(*)=1,count(*)::text,
 jsonb_build_object('empresa_id','5c114b79-bbd1-4829-b6ac-42da9f7362c0','razao_social_esperada','EngMarq Solucoes em Engenharia')
 FROM public.empresas WHERE id='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND razao_social='EngMarq Solucoes em Engenharia'
 UNION ALL SELECT 'CNPJ','CNPJ_ATUAL_ESPERADO',count(*)=1,count(*)::text,
 jsonb_build_object('esperado','12.345.678/0001-99') FROM public.empresas WHERE id='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND cnpj='12.345.678/0001-99'
 UNION ALL SELECT 'CNPJ','NOVO_CNPJ_VALIDO',valid,cnpj,jsonb_build_object('canonical',canonical) FROM new_validated
 UNION ALL SELECT 'CNPJ','CANONICAL_ESPERADO',canonical='60545359000176',canonical,'{}'::jsonb FROM new_validated
 
 UNION ALL SELECT 'COLISAO','AUSENCIA_COLISAO_NOVO_CNPJ',count(*)=0,count(*)::text,
 jsonb_build_object('canonical','60545359000176') FROM validated WHERE id<>'5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND canonical='60545359000176'
 UNION ALL SELECT 'COLISAO','NENHUM_CANONICO_DUPLICADO',count(*)=0,count(*)::text,'{}'::jsonb
 FROM (SELECT canonical FROM validated WHERE canonical IS NOT NULL GROUP BY canonical HAVING count(*)>1) duplicates
 UNION ALL SELECT 'CONTAGENS',label,n=expected,n::text,jsonb_build_object('esperado',expected) FROM counts
 UNION ALL SELECT 'INTEGRIDADE_FK',child||'.'||conname,invalid=0 AND convalidated,invalid::text,
 jsonb_build_object('origem',child,'destino',parent,'constraint_validada',convalidated) FROM fk_checks
 
),report AS (
 SELECT 1 AS section,category,label,result,CASE WHEN passed THEN 'OK' ELSE 'BLOQUEIO' END AS status,details FROM checks
 UNION ALL SELECT 2,'PRESERVACAO',nspname||'.'||relname,hash,'ATENÇÃO',
 jsonb_build_object('comparar_pre_pos',true,'exclusao_do_hash','somente cnpj da empresa alvo') FROM fingerprints
 UNION ALL SELECT 2,'PRESERVACAO','BASELINE_POSTFLIGHT','Copiar DETALHES integralmente para o postflight','ATENÇÃO',hashes FROM baseline_current
 UNION ALL SELECT 3,'CONCLUSAO','RESULTADO_FINAL',
 CASE WHEN bool_and(passed) THEN 'APROVADO_PARA_REMEDIACAO' ELSE 'REPROVADO' END,
 CASE WHEN bool_and(passed) THEN 'OK' ELSE 'BLOQUEIO' END,
 jsonb_build_object('nao_autoriza_024',true,'comparacao_fingerprints_obrigatoria',true) FROM checks
)
SELECT row_number() OVER(ORDER BY section,category,label) AS "ORDEM",category AS "CATEGORIA",
 label AS "CHECK",result AS "RESULTADO",status AS "STATUS",details AS "DETALHES" FROM report ORDER BY "ORDEM";
COMMIT;
