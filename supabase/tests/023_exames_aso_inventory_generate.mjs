// Local SQL artifact generator. Synthetic database only; no remote configuration.
import {writeFile} from 'node:fs/promises'
import {fixture,migrate} from './remediation-fixture.mjs'
const db=await fixture()
try {
 await migrate(db,'021_documentos_empresas_security.sql')
 const catalog=`
 WITH targets AS (SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN ('documentos','documento_tipos','exames_catalogo','colaboradores','vw_dashboard_documentos'))
 OR (n.nspname='storage' AND c.relname='objects')),
 entries AS (
 SELECT 'column' kind,c.oid::regclass::text||'.'||a.attname identity,
 jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,
 'default',pg_get_expr(d.adbin,d.adrelid)) detail FROM targets c JOIN pg_attribute a ON a.attrelid=c.oid
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attnum>0 AND NOT a.attisdropped AND c.relnamespace='public'::regnamespace
 UNION ALL SELECT 'constraint',k.conrelid::regclass::text||'.'||k.conname,
 jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)
 FROM pg_constraint k WHERE k.conrelid IN (SELECT oid FROM targets WHERE relnamespace='public'::regnamespace)
 UNION ALL SELECT 'trigger',t.tgrelid::regclass::text||'.'||t.tgname,
 jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
 FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM targets WHERE relnamespace='public'::regnamespace) AND NOT t.tgisinternal
 UNION ALL SELECT 'policy',schemaname||'.'||tablename||'.'||policyname,
 jsonb_build_object('permissive',permissive,'roles',roles::text,'command',cmd,'using',qual,'check',with_check)
 FROM pg_policies WHERE (schemaname='public' AND tablename IN ('documentos','documento_tipos','exames_catalogo','colaboradores'))
 OR (schemaname='storage' AND tablename='objects' AND policyname LIKE 'documentos_%')
 UNION ALL SELECT 'function',p.oid::regprocedure::text,
 jsonb_build_object('hash',md5(replace(p.prosrc,E'\\r\\n',E'\\n')),'security_definer',p.prosecdef,
 'volatility',p.provolatile,'config',p.proconfig,'return_type',p.prorettype::regtype::text,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
 (n.nspname='engmarq_private' AND p.proname IN ('can_access_catalogos','can_access_documento_row','can_access_documento',
 'guard_documento_metadata','guard_documento_reference','documento_legacy_path','can_access_colaboradores','guard_colaborador_write'))
 OR (n.nspname='public' AND p.proname IN ('get_user_empresa_id','get_user_role','update_documento_status'))
 UNION ALL SELECT 'relation',c.oid::regclass::text,
 jsonb_build_object('rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions)
 FROM targets c WHERE c.relnamespace='public'::regnamespace OR c.relname='objects'
 UNION ALL SELECT 'view',c.oid::regclass::text,jsonb_build_object('definition',pg_get_viewdef(c.oid))
 FROM targets c WHERE c.relkind='v'
 UNION ALL SELECT 'index',schemaname||'.'||indexname,jsonb_build_object('definition',indexdef)
 FROM pg_indexes WHERE schemaname='public' AND tablename IN ('documentos','documento_tipos','exames_catalogo','colaboradores')
 UNION ALL SELECT 'privileges',c.oid::regclass::text||'.'||r.role,
 jsonb_build_object('table',ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
 WHERE has_table_privilege(r.role,c.oid,privilege) ORDER BY privilege),
 'insert',ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 AND has_column_privilege(r.role,c.oid,a.attname,'INSERT') ORDER BY a.attname),
 'update',ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 AND has_column_privilege(r.role,c.oid,a.attname,'UPDATE') ORDER BY a.attname))
 FROM targets c CROSS JOIN (VALUES('anon'),('authenticated')) r(role) WHERE c.relnamespace='public'::regnamespace
 ) SELECT kind,identity,detail FROM entries`
 const expected=(await db.query(catalog)).rows
 const literal=JSON.stringify(expected).replaceAll("'","''")
 const sql=`-- Exames/ASO inventory only. Execute the COMPLETE file in a fresh Supabase SQL Editor session.
-- Requires a trusted superuser/BYPASSRLS auditor with SELECT on every required relation.
-- No impersonation, object downloads, signed links, writes or automatic corrections.
-- Snapshot: repeatable read. All result sets are aggregate data or schema metadata.
-- Missing structure/permissions disables data metrics; NULL means unavailable, never zero.
-- Expected catalog generated locally from migrations through 021; 022 affects logos outside scope.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 1. Installed catalog, ACLs, definitions and drift against the local migration contract.
WITH actual AS (${catalog}),
expected AS (SELECT * FROM jsonb_to_recordset('${literal}'::jsonb) AS e(kind text,identity text,detail jsonb))
SELECT coalesce(e.kind,a.kind) AS "BLOCO",coalesce(e.identity,a.identity) AS "OBJETO",
 e.detail AS "ESPERADO",a.detail AS "INSTALADO",
 CASE WHEN a.identity IS NULL OR (e.identity IS NOT NULL AND a.detail IS DISTINCT FROM e.detail) THEN 'BLOQUEIO'
 WHEN e.identity IS NULL AND a.kind IN ('policy','trigger','function','privileges') THEN 'BLOQUEIO'
 WHEN e.identity IS NULL THEN 'ATENÇÃO' ELSE 'OK' END AS "STATUS"
FROM expected e FULL JOIN actual a USING(kind,identity) ORDER BY 1,2;

-- Related views and indexes: definitions only, never row contents.
SELECT n.nspname,c.relname,c.reloptions,pg_get_viewdef(c.oid) definition
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname='public'
AND (c.relname LIKE '%document%' OR c.relname LIKE '%exame%' OR c.relname LIKE '%aso%') ORDER BY 1,2;
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('documentos','documento_tipos','exames_catalogo','colaboradores') ORDER BY 2,3;
SELECT n.nspname,p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.proacl,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
(n.nspname='engmarq_private' AND p.proname IN ('can_access_catalogos','can_access_documento_row','can_access_documento',
'guard_documento_metadata','guard_documento_reference','documento_legacy_path','can_access_colaboradores','guard_colaborador_write'))
OR (n.nspname='public' AND p.proname IN ('get_user_empresa_id','get_user_role','update_documento_status')) ORDER BY 2;
-- All Storage policy metadata is necessary to detect permissive-policy interactions.
SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;
SELECT c.oid::regclass relation,pg_get_userbyid(c.relowner) owner,c.relacl FROM pg_class c
WHERE c.oid IN (to_regclass('public.documentos'),to_regclass('public.documento_tipos'),to_regclass('public.exames_catalogo'),
to_regclass('public.colaboradores'),to_regclass('storage.objects'),to_regclass('storage.buckets'));
SELECT table_schema,table_name,column_name,grantee,privilege_type,is_grantable FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name IN ('documentos','documento_tipos','exames_catalogo','colaboradores') ORDER BY 2,3,4,5;

-- 2-10. Gated aggregate inventory and final readiness checks.
WITH required(relation,columns) AS (VALUES
 ('public.documentos',ARRAY['id','empresa_id','tipo_id','colaborador_id','subtipo_exame','emissao','vencimento','observacoes','exames_realizados','arquivo_path','arquivo_url','status']),
 ('public.documento_tipos',ARRAY['id','nome']),('public.exames_catalogo',ARRAY['id','nome','ordem']),
 ('public.colaboradores',ARRAY['id','empresa_id']),('public.empresas',ARRAY['id']),
 ('storage.objects',ARRAY['bucket_id','name','metadata']),('storage.buckets',ARRAY['id','public','file_size_limit','allowed_mime_types'])),
gate AS (SELECT coalesce((SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),false)
AND NOT EXISTS (SELECT 1 FROM required r LEFT JOIN pg_class c ON c.oid=to_regclass(r.relation)
LEFT JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid IS NULL
OR NOT has_schema_privilege(current_user,n.oid,'USAGE') OR NOT has_table_privilege(current_user,c.oid,'SELECT')
OR EXISTS (SELECT 1 FROM unnest(r.columns) col WHERE NOT EXISTS
(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname=col AND NOT a.attisdropped)))
AND NOT EXISTS (SELECT 1 FROM (VALUES
 ('id','uuid'),('empresa_id','uuid'),('tipo_id','uuid'),('colaborador_id','uuid'),
 ('subtipo_exame','text'),('emissao','date'),('vencimento','date'),('observacoes','text'),
 ('exames_realizados','text[]'),('arquivo_path','text'),('arquivo_url','text')) v(col,typ)
 JOIN pg_attribute a ON a.attrelid=to_regclass('public.documentos') AND a.attname=v.col
 WHERE a.atttypid<>to_regtype(v.typ)) AS ready),
payload AS (SELECT CASE WHEN ready THEN query_to_xml($inventory$
WITH aso_types AS (SELECT id FROM public.documento_tipos WHERE lower(btrim(nome))='aso'),
docs AS (SELECT d.*,t.id IS NOT NULL is_aso,c.id IS NOT NULL col_exists,
c.empresa_id=d.empresa_id same_tenant,e.id IS NOT NULL company_exists,
CASE WHEN arquivo_path ~ ('^'||d.empresa_id::text||'/(certificados/)?[A-Za-z0-9_-]+\\.[A-Za-z0-9]+$') THEN arquivo_path END canonical,
CASE WHEN arquivo_url ~ ('^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/documentos/'||d.empresa_id::text||'/(certificados/)?[A-Za-z0-9_-]+\\.[A-Za-z0-9]+$')
THEN substring(arquivo_url FROM '^https://[^/]+/storage/v1/object/public/documentos/(.*)$') END legacy,
CASE WHEN vencimento<CURRENT_DATE THEN 'vencido' WHEN vencimento<=CURRENT_DATE+60 THEN 'vencendo' ELSE 'vigente' END status60,
CASE WHEN vencimento<CURRENT_DATE THEN 'vencido' WHEN vencimento<=CURRENT_DATE+30 THEN 'vencendo' ELSE 'vigente' END status30
FROM public.documentos d LEFT JOIN aso_types t ON t.id=d.tipo_id LEFT JOIN public.colaboradores c ON c.id=d.colaborador_id
LEFT JOIN public.empresas e ON e.id=d.empresa_id),
metrics(block,label,n) AS (
 SELECT 'IDENTIFICAÇÃO','total_documentos',count(*) FROM docs
 UNION ALL SELECT 'IDENTIFICAÇÃO','tipos_aso',count(*) FROM aso_types
 UNION ALL SELECT 'IDENTIFICAÇÃO','total_asos',count(*) FROM docs WHERE is_aso
 UNION ALL SELECT 'IDENTIFICAÇÃO','aso_colaborador_nulo',count(*) FROM docs WHERE is_aso AND colaborador_id IS NULL
 UNION ALL SELECT 'IDENTIFICAÇÃO','aso_colaborador_valido',count(*) FROM docs WHERE is_aso AND col_exists AND same_tenant
 UNION ALL SELECT 'IDENTIFICAÇÃO','nao_aso_com_subtipo',count(*) FROM docs WHERE NOT is_aso AND subtipo_exame IS NOT NULL
 UNION ALL SELECT 'IDENTIFICAÇÃO','nao_aso_com_colaborador',count(*) FROM docs WHERE NOT is_aso AND colaborador_id IS NOT NULL
 UNION ALL SELECT 'IDENTIFICAÇÃO','tipo_inexistente',count(*) FROM docs d WHERE NOT EXISTS(SELECT 1 FROM public.documento_tipos t WHERE t.id=d.tipo_id)
 UNION ALL SELECT 'TENANT','empresa_inexistente',count(*) FROM docs WHERE NOT company_exists
 UNION ALL SELECT 'TENANT','colaborador_inexistente',count(*) FROM docs WHERE colaborador_id IS NOT NULL AND NOT col_exists
 UNION ALL SELECT 'TENANT','colaborador_cross_tenant',count(*) FROM docs WHERE col_exists AND NOT same_tenant
 UNION ALL SELECT 'SUBTIPO',CASE WHEN subtipo_exame IS NULL THEN '<nulo>'
 WHEN subtipo_exame IN ('admissional','periodico','retorno_trabalho','mudanca_risco','demissional') THEN subtipo_exame
 ELSE '<invalido_nao_exposto>' END,count(*) FROM docs WHERE is_aso GROUP BY 2
 UNION ALL SELECT 'IDENTIFICAÇÃO','subtipo_invalido',count(*) FROM docs WHERE subtipo_exame IS NOT NULL AND subtipo_exame NOT IN
 ('admissional','periodico','retorno_trabalho','mudanca_risco','demissional')
 UNION ALL SELECT 'EMPRESA_ASO',empresa_id::text,count(*) FROM docs WHERE is_aso GROUP BY empresa_id
 UNION ALL SELECT 'DATAS','emissao_nula',count(*) FROM docs WHERE is_aso AND emissao IS NULL
 UNION ALL SELECT 'DATAS','emissao_preenchida',count(*) FROM docs WHERE is_aso AND emissao IS NOT NULL
 UNION ALL SELECT 'DATAS','emissao_futura',count(*) FROM docs WHERE is_aso AND emissao>CURRENT_DATE
 UNION ALL SELECT 'DATAS','vencimento_nulo',count(*) FROM docs WHERE is_aso AND vencimento IS NULL
 UNION ALL SELECT 'DATAS','vencimento_preenchido',count(*) FROM docs WHERE is_aso AND vencimento IS NOT NULL
 UNION ALL SELECT 'DATAS','vencimento_antes_emissao',count(*) FROM docs WHERE is_aso AND vencimento<emissao
 UNION ALL SELECT 'DATAS','vencimento_igual_emissao',count(*) FROM docs WHERE is_aso AND vencimento=emissao
 UNION ALL SELECT 'DATAS','vencidos',count(*) FROM docs WHERE is_aso AND vencimento<CURRENT_DATE
 UNION ALL SELECT 'DATAS','vence_hoje',count(*) FROM docs WHERE is_aso AND vencimento=CURRENT_DATE
 UNION ALL SELECT 'DATAS','vencimento_futuro',count(*) FROM docs WHERE is_aso AND vencimento>CURRENT_DATE
 UNION ALL SELECT 'OBSERVAÇÕES',CASE WHEN observacoes IS NULL THEN 'nula' WHEN btrim(observacoes)='' THEN 'vazia'
 WHEN lower(btrim(observacoes))='apto' THEN 'igual_apto' WHEN lower(btrim(observacoes))='inapto' THEN 'igual_inapto'
 WHEN lower(btrim(observacoes))='apto com restrição' THEN 'igual_apto_com_restricao' ELSE 'outro_texto_nao_exposto' END,count(*)
 FROM docs WHERE is_aso GROUP BY 2
 UNION ALL SELECT 'PROCEDIMENTOS',CASE WHEN exames_realizados IS NULL THEN 'nulo' WHEN cardinality(exames_realizados)=0 THEN 'vazio'
 ELSE 'preenchido' END,count(*) FROM docs WHERE is_aso GROUP BY 2
 UNION ALL SELECT 'PROCEDIMENTOS','quantidade_'||cardinality(exames_realizados)::text,count(*) FROM docs WHERE is_aso AND exames_realizados IS NOT NULL GROUP BY 2
 UNION ALL SELECT 'PROCEDIMENTOS','dimensao_inesperada',count(*) FROM docs WHERE is_aso AND cardinality(exames_realizados)>0
 AND (array_ndims(exames_realizados)<>1 OR array_lower(exames_realizados,1)<>1)
 UNION ALL SELECT 'PROCEDIMENTOS','elementos_nulos_ou_vazios',count(*) FROM docs d CROSS JOIN LATERAL unnest(d.exames_realizados) x
 WHERE is_aso AND (x IS NULL OR btrim(x)='')
 UNION ALL SELECT 'PROCEDIMENTOS','elementos_fora_catalogo',count(*) FROM docs d CROSS JOIN LATERAL unnest(d.exames_realizados) x
 WHERE is_aso AND x IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.exames_catalogo c WHERE c.nome=x)
 UNION ALL SELECT 'PROCEDIMENTOS','asos_com_elementos_duplicados',count(*) FROM docs d WHERE is_aso AND EXISTS
 (SELECT 1 FROM unnest(d.exames_realizados) x GROUP BY x HAVING count(*)>1)
 UNION ALL SELECT 'CATÁLOGO','quantidade',count(*) FROM public.exames_catalogo
 UNION ALL SELECT 'CATÁLOGO','duplicidades_normalizadas',count(*) FROM
 (SELECT lower(btrim(nome)) FROM public.exames_catalogo GROUP BY 1 HAVING count(*)>1) x
 UNION ALL SELECT 'CATÁLOGO','nomes_nulos_vazios',count(*) FROM public.exames_catalogo WHERE nome IS NULL OR btrim(nome)=''
 UNION ALL SELECT 'STORAGE','referencias_canonicas',count(*) FROM docs WHERE arquivo_path IS NOT NULL
 UNION ALL SELECT 'STORAGE','referencias_legacy',count(*) FROM docs WHERE arquivo_url IS NOT NULL
 UNION ALL SELECT 'STORAGE','legacy_sem_canonica',count(*) FROM docs WHERE arquivo_url IS NOT NULL AND arquivo_path IS NULL
 UNION ALL SELECT 'STORAGE','path_incompativel_tenant',count(*) FROM docs WHERE arquivo_path IS NOT NULL AND canonical IS NULL
 UNION ALL SELECT 'STORAGE','url_legacy_formato_incompativel',count(*) FROM docs WHERE arquivo_url IS NOT NULL AND legacy IS NULL
 UNION ALL SELECT 'STORAGE','canonico_sem_objeto',count(*) FROM docs d WHERE canonical IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=d.canonical)
 UNION ALL SELECT 'STORAGE','legacy_sem_objeto',count(*) FROM docs d WHERE legacy IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=d.legacy)
 UNION ALL SELECT 'STORAGE','path_url_divergentes',count(*) FROM docs WHERE canonical IS NOT NULL AND legacy IS NOT NULL AND canonical<>legacy
 UNION ALL SELECT 'STORAGE','origens_legacy_distintas',count(DISTINCT substring(arquivo_url FROM '^https://[^/]+')) FROM docs WHERE arquivo_url IS NOT NULL
 UNION ALL SELECT 'STORAGE','legacy_origem_diferente_contrato020',count(*) FROM docs WHERE arquivo_url IS NOT NULL
 AND substring(arquivo_url FROM '^https://[^/]+') IS DISTINCT FROM 'https://kkjckayiqvlqpdjyoxyv.supabase.co'
 UNION ALL SELECT 'STORAGE','objetos_total',count(*) FROM storage.objects WHERE bucket_id='documentos'
 UNION ALL SELECT 'STORAGE','bucket_public',CASE WHEN public THEN 1 ELSE 0 END FROM storage.buckets WHERE id='documentos'
 UNION ALL SELECT 'STORAGE','bucket_limite_bytes',file_size_limit FROM storage.buckets WHERE id='documentos'
 UNION ALL SELECT 'STORAGE','bucket_mime_quantidade',cardinality(allowed_mime_types) FROM storage.buckets WHERE id='documentos'
 UNION ALL SELECT 'STORAGE','mime_permitido_'||m,1 FROM storage.buckets CROSS JOIN LATERAL unnest(allowed_mime_types) m WHERE id='documentos'
 UNION ALL SELECT 'STORAGE','bucket_config_invalida_ou_ausente',CASE WHEN EXISTS
 (SELECT 1 FROM storage.buckets WHERE id='documentos' AND NOT public AND file_size_limit=10485760
 AND cardinality(allowed_mime_types)=7 AND allowed_mime_types @> ARRAY['application/pdf','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']) THEN 0 ELSE 1 END
 UNION ALL SELECT 'STORAGE','objetos_aparentemente_orfaos',count(*) FROM storage.objects o WHERE bucket_id='documentos'
 AND NOT EXISTS(SELECT 1 FROM docs d WHERE d.canonical=o.name OR d.legacy=o.name)
 UNION ALL SELECT 'STORAGE','referencias_efetivas_compartilhadas',count(*) FROM
 (SELECT path FROM (SELECT id,canonical path FROM docs WHERE canonical IS NOT NULL
 UNION SELECT id,legacy FROM docs WHERE legacy IS NOT NULL) refs GROUP BY path HAVING count(*)>1) x
 UNION ALL SELECT 'STORAGE','objetos_path_ou_tenant_incompativel',count(*) FROM storage.objects o WHERE bucket_id='documentos'
 AND (name !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/(certificados/)?[A-Za-z0-9_-]+\\.[A-Za-z0-9]+$'
 OR NOT EXISTS(SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(o.name,'/',1)))
 UNION ALL SELECT 'STORAGE','objetos_asos',count(DISTINCT o.name) FROM storage.objects o JOIN docs d
 ON o.bucket_id='documentos' AND o.name IN (d.canonical,d.legacy) WHERE d.is_aso
 UNION ALL SELECT 'STORAGE','asos_sem_referencia',count(*) FROM docs WHERE is_aso AND arquivo_path IS NULL AND arquivo_url IS NULL
 UNION ALL SELECT 'STORAGE','objetos_metadata_tamanho_invalido',count(*) FROM storage.objects WHERE bucket_id='documentos'
 AND CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::numeric>10485760 ELSE true END
 UNION ALL SELECT 'STORAGE','objetos_metadata_mime_invalido',count(*) FROM storage.objects WHERE bucket_id='documentos'
 AND coalesce(metadata->>'mimetype','') NOT IN ('application/pdf','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png')
 UNION ALL SELECT 'STATUS_ASO','persistido_'||status::text,count(*) FROM docs WHERE is_aso GROUP BY status
 UNION ALL SELECT 'STATUS_ASO','calculado60_'||status60,count(*) FROM docs WHERE is_aso GROUP BY status60
 UNION ALL SELECT 'STATUS_ASO','calculado30_'||status30,count(*) FROM docs WHERE is_aso GROUP BY status30
 UNION ALL SELECT 'STATUS_ASO','divergencia_persistido60',count(*) FROM docs WHERE is_aso AND status::text IS DISTINCT FROM status60
 UNION ALL SELECT 'STATUS_ASO','impacto30_60',count(*) FROM docs WHERE is_aso AND status30<>status60
 UNION ALL SELECT 'STATUS_DOCUMENTOS','divergencia_persistido60',count(*) FROM docs WHERE status::text IS DISTINCT FROM status60
)
SELECT block,label,n FROM metrics ORDER BY block,label
$inventory$,false,false,'') ELSE '<table/>'::xml END x,ready FROM gate),
metrics AS (SELECT (xpath('/row/block/text()',r))[1]::text block,(xpath('/row/label/text()',r))[1]::text label,
((xpath('/row/n/text()',r))[1]::text)::bigint n FROM payload CROSS JOIN LATERAL unnest(xpath('/table/row',x)) r),
checks AS (
SELECT 'Inventário completo disponível' label,CASE WHEN ready THEN 'snapshot integral autorizado' ELSE 'estrutura, tipo de array ou permissão insuficiente; métricas indisponíveis' END result,
CASE WHEN ready THEN 'OK' ELSE 'BLOQUEIO' END status FROM gate
UNION ALL SELECT block||': '||label,n::text,CASE
WHEN label IN ('empresa_inexistente','colaborador_inexistente','colaborador_cross_tenant','tipo_inexistente','subtipo_invalido',
'path_incompativel_tenant','url_legacy_formato_incompativel','canonico_sem_objeto','legacy_sem_objeto',
'bucket_config_invalida_ou_ausente','objetos_path_ou_tenant_incompativel','legacy_origem_diferente_contrato020') AND n>0 THEN 'BLOQUEIO'
WHEN label IN ('tipos_aso') AND n<>1 THEN 'BLOQUEIO'
WHEN label IN ('aso_colaborador_nulo','nao_aso_com_subtipo','nao_aso_com_colaborador','<nulo>','vencimento_antes_emissao',
'vencimento_igual_emissao','emissao_futura','dimensao_inesperada','elementos_nulos_ou_vazios','elementos_fora_catalogo',
'asos_com_elementos_duplicados','duplicidades_normalizadas','nomes_nulos_vazios','legacy_sem_canonica','path_url_divergentes',
'objetos_aparentemente_orfaos','referencias_efetivas_compartilhadas','objetos_metadata_tamanho_invalido','objetos_metadata_mime_invalido',
'divergencia_persistido60','impacto30_60') AND n>0 THEN 'ATENÇÃO' ELSE 'OK' END FROM metrics
UNION ALL SELECT 'FK composta validada',count(*)::text,CASE WHEN count(*)=1 THEN 'OK' ELSE 'BLOQUEIO' END
FROM pg_constraint k WHERE k.conrelid=to_regclass('public.documentos') AND k.confrelid=to_regclass('public.colaboradores')
AND k.contype='f' AND k.convalidated AND
ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.num ORDER BY ord)=ARRAY['empresa_id','colaborador_id']
AND ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=u.num ORDER BY ord)=ARRAY['empresa_id','id']
UNION ALL SELECT 'Catálogo authenticated USING true',count(*)::text,CASE WHEN count(*)>0 THEN 'ATENÇÃO' ELSE 'OK' END
FROM pg_policies WHERE schemaname='public' AND tablename='exames_catalogo' AND cmd='SELECT' AND 'authenticated'=ANY(roles) AND qual='true'
UNION ALL SELECT 'Futura 023: resultado nullable','expansão possível; não converter observações; verificar conflitos de colunas e catálogo',CASE WHEN ready THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END FROM gate
UNION ALL SELECT 'Futura 023: grants exames_realizados','comparar ACL instalada acima; ampliar somente INSERT/UPDATE necessários, preservando RLS',CASE WHEN ready THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END FROM gate
UNION ALL SELECT 'Futura 023: obrigatórios somente novos ASOs','usar validação de novos registros; preservar legado; nunca NOT NULL global',CASE WHEN ready THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END FROM gate
UNION ALL SELECT 'Futura 023: índices','verificar equivalência, nomes e custo no catálogo; sem unicidade automática',CASE WHEN ready THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END FROM gate
UNION ALL SELECT 'Futura 023: FastAPI','inventário não homologa API; exigir JWT do ator, tenant derivado do perfil e testes de autorização',CASE WHEN ready THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END FROM gate
UNION ALL SELECT 'Storage: origem legada confiável','origem comparada ao contrato da 020; confirmar que este é o projeto esperado antes de interpretar o relatório','ATENÇÃO'
UNION ALL SELECT 'Preservação do legado','nenhuma conversão, correção ou remoção executada; revisar todos os blocos antes de planejar 023','OK'
)
SELECT label AS "CHECK",result AS "RESULTADO",status AS "STATUS" FROM checks ORDER BY
CASE status WHEN 'BLOQUEIO' THEN 0 WHEN 'ATENÇÃO' THEN 1 ELSE 2 END,label;

COMMIT;
`
 await writeFile(new URL('023_exames_aso_inventory_readonly.sql',import.meta.url),sql)
 console.log('Generated local read-only inventory; expected entries:',expected.length)
} finally {await db.close()}
