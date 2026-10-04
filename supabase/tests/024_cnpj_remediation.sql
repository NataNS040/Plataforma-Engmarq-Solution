-- PRE-024: privileged, non-idempotent correction of ONE company CNPJ.
-- Run only after the separate preflight is approved. No 024 application.
-- Entire file is atomic. On error ROLLBACK before any subsequent command.
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
DO $remediation$
DECLARE affected bigint; before_company jsonb; after_company jsonb; before_data jsonb; after_data jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Privileged auditor required' USING ERRCODE='42501';
 END IF;
 -- Exclusive against competing writers to empresas: canonical collision check
 -- remains protected through COMMIT even before 024 creates its unique key.
 LOCK TABLE public.empresas IN SHARE ROW EXCLUSIVE MODE;
 IF to_regprocedure('engmarq_private.cnpj_canonico(text)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empresas'::regclass AND attname='cnpj_canonico' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'This correction is PRE-024 only';
 END IF;
 IF (SELECT count(*) FROM public.empresas WHERE id='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND cnpj='12.345.678/0001-99'
  AND razao_social='EngMarq Solucoes em Engenharia')<>1 THEN
  RAISE EXCEPTION 'Target ID, old CNPJ or company name does not match exactly one row';
 END IF;
 IF NOT (WITH normalized AS (
 SELECT id,cnpj,CASE WHEN btrim(cnpj) COLLATE "C" ~ '^([0-9A-Za-z]{12}[0-9]{2}|[0-9A-Za-z]{2}\.[0-9A-Za-z]{3}\.[0-9A-Za-z]{3}/[0-9A-Za-z]{4}-[0-9]{2})$'
 THEN translate(btrim(cnpj),'abcdefghijklmnopqrstuvwxyz./-','ABCDEFGHIJKLMNOPQRSTUVWXYZ') END canonical FROM (VALUES ('5c114b79-bbd1-4829-b6ac-42da9f7362c0'::uuid,'60.545.359/0001-76'::text)) input(id,cnpj)
),digits AS (
 SELECT n.*, (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,12) j) remainder1,
 (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,13) j) remainder2
 FROM normalized n
),validated AS (
 SELECT *,coalesce(canonical IS NOT NULL AND canonical<>repeat(substr(canonical,1,1),14)
 AND substr(canonical,13,1)=(CASE WHEN remainder1<2 THEN 0 ELSE 11-remainder1 END)::text
 AND substr(canonical,14,1)=(CASE WHEN remainder2<2 THEN 0 ELSE 11-remainder2 END)::text,false) valid FROM digits
) SELECT valid AND canonical='60545359000176' FROM validated) THEN
  RAISE EXCEPTION 'New CNPJ invalid or unexpected canonical';
 END IF;
 IF EXISTS(WITH normalized AS (
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
) SELECT 1 FROM validated WHERE id<>'5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND canonical='60545359000176') THEN
  RAISE EXCEPTION 'Canonical CNPJ collision';
 END IF;
 IF EXISTS(WITH counts(label,n,expected) AS (
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
) SELECT 1 FROM counts WHERE n<>expected) THEN
  RAISE EXCEPTION 'Operational baseline counts changed; rerun inventory';
 END IF;
 IF EXISTS(WITH fk_queries AS (
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
) SELECT 1 FROM fk_checks WHERE invalid<>0 OR NOT convalidated) THEN
  RAISE EXCEPTION 'FK integrity requires review';
 END IF;
 SELECT to_jsonb(e)-'cnpj' INTO before_company FROM public.empresas e WHERE id='5c114b79-bbd1-4829-b6ac-42da9f7362c0';
 WITH protected AS (
 SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','engmarq_private','auth','storage') AND c.relkind IN ('r','p')
),fingerprints AS MATERIALIZED (
 SELECT nspname,relname,(xpath('/table/row/hash/text()',query_to_xml(format(
 'SELECT md5(coalesce(jsonb_agg(payload ORDER BY payload::text)::text,''[]'')) AS hash FROM (SELECT %s AS payload FROM %I.%I r) q',
 CASE WHEN nspname='public' AND relname='empresas' THEN
 'CASE WHEN r.id=''5c114b79-bbd1-4829-b6ac-42da9f7362c0''::uuid THEN to_jsonb(r)-''cnpj'' ELSE to_jsonb(r) END' ELSE 'to_jsonb(r)' END,
 nspname,relname),true,false,'')))[1]::text AS hash FROM protected
)
 SELECT jsonb_agg(jsonb_build_object('schema',nspname,'table',relname,'hash',hash) ORDER BY nspname,relname) INTO before_data FROM fingerprints;

 UPDATE public.empresas SET cnpj='60.545.359/0001-76'
 WHERE id='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND cnpj='12.345.678/0001-99' AND razao_social='EngMarq Solucoes em Engenharia';
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Expected exactly one affected row, got %',affected; END IF;

 SELECT to_jsonb(e)-'cnpj' INTO after_company FROM public.empresas e WHERE id='5c114b79-bbd1-4829-b6ac-42da9f7362c0';
 IF after_company IS DISTINCT FROM before_company
 OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id='5c114b79-bbd1-4829-b6ac-42da9f7362c0' AND cnpj='60.545.359/0001-76') THEN
  RAISE EXCEPTION 'Company preservation or final CNPJ failed';
 END IF;
 WITH protected AS (
 SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','engmarq_private','auth','storage') AND c.relkind IN ('r','p')
),fingerprints AS MATERIALIZED (
 SELECT nspname,relname,(xpath('/table/row/hash/text()',query_to_xml(format(
 'SELECT md5(coalesce(jsonb_agg(payload ORDER BY payload::text)::text,''[]'')) AS hash FROM (SELECT %s AS payload FROM %I.%I r) q',
 CASE WHEN nspname='public' AND relname='empresas' THEN
 'CASE WHEN r.id=''5c114b79-bbd1-4829-b6ac-42da9f7362c0''::uuid THEN to_jsonb(r)-''cnpj'' ELSE to_jsonb(r) END' ELSE 'to_jsonb(r)' END,
 nspname,relname),true,false,'')))[1]::text AS hash FROM protected
)
 SELECT jsonb_agg(jsonb_build_object('schema',nspname,'table',relname,'hash',hash) ORDER BY nspname,relname) INTO after_data FROM fingerprints;
 IF after_data IS DISTINCT FROM before_data THEN
  RAISE EXCEPTION 'Non-CNPJ data changed: rollback correction';
 END IF;
 IF EXISTS(WITH counts(label,n,expected) AS (
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
) SELECT 1 FROM counts WHERE n<>expected)
 OR EXISTS(WITH fk_queries AS (
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
) SELECT 1 FROM fk_checks WHERE invalid<>0 OR NOT convalidated) THEN
  RAISE EXCEPTION 'Post-update counts/FK check failed';
 END IF;
END;
$remediation$;
COMMIT;
