// Offline generation only. Never applies migrations or contacts a database.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
export const freeze='6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5'
if(createHash('sha256').update(await readFile(new URL('../migrations/025_entitlements_quota_hardening.sql',import.meta.url))).digest('hex')!==freeze)throw Error('Frozen migration mismatch; STOP')
const pre=await readFile(new URL('025_preflight_remoto_manual.sql',import.meta.url),'utf8')
const originalPost=await readFile(new URL('025_fundacao_postflight_readonly.sql',import.meta.url),'utf8')
// Keep the reviewed structural POST contract/state checks. Generated extensions
// are replaceable without touching either the frozen migration or preflight.
let post=originalPost.replace(/-- BEGIN BASELINE V2 EXTENSIONS[\s\S]*?-- END BASELINE V2 EXTENSIONS\n?/g,'')
const cnpj=pre.match(/FROM public\.empresas WHERE (NOT \([^\n]+\))/)?.[1]
if(!cnpj)throw Error('Reviewed independent CNPJ expression missing')
post=post.replace('NOT engmarq_private.cnpj_valido(cnpj)',()=>cnpj)
const columnsSql=`ARRAY(SELECT attname FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped ORDER BY attnum)`
const keysSql=`ARRAY(SELECT a.attname FROM pg_constraint k CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY key(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum WHERE k.conrelid=c.oid AND k.contype='p' ORDER BY key.ord)`
// Data values never leave the database: only hashes, counts and column names.
// Encode JSON before XML extraction to avoid XML entity corruption.
function snapshots(from){return `SELECT n.nspname||'.'||c.relname relation,
 convert_from(decode((xpath('/table/row/payload/text()',query_to_xml(format(
 'SELECT encode(convert_to(jsonb_build_object(''columns'',%L::jsonb,''keys'',%L::jsonb,''count'',count(*),''fingerprint'',md5(coalesce(jsonb_agg(j ORDER BY j::text)::text,''[]'')),''rows'',coalesce(jsonb_object_agg(identity,md5(j::text)),''{}''::jsonb))::text,''UTF8''),''base64'') payload FROM (SELECT j,md5(coalesce((SELECT jsonb_object_agg(key,j->>key) FROM jsonb_array_elements_text(%L::jsonb) key),j)::text) identity FROM (SELECT (SELECT jsonb_object_agg(col,to_jsonb(r)->col) FROM jsonb_array_elements_text(%L::jsonb) col) j FROM %I.%I r) projected) keyed',
 to_jsonb(cols.names)::text,to_jsonb(cols.keys)::text,to_jsonb(cols.keys)::text,to_jsonb(cols.names)::text,n.nspname,c.relname),true,false,'')))[1]::text,'base64'),'UTF8')::jsonb snapshot
 ${from}`}
const exportSnapshots=snapshots(`FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL (SELECT ${columnsSql} names,${keysSql} keys) cols
 WHERE n.nspname IN ('public','engmarq_private','storage') AND c.relkind IN ('r','p','m')`)
const cut=pre.indexOf('final AS (SELECT * FROM numbered')
if(cut<0)throw Error('Preflight shape changed')
const exportSql=pre.slice(0,cut)+`snapshots AS (${exportSnapshots}),
 export_payload AS (SELECT jsonb_build_object('version',2,'migration_sha256','${freeze}',
 'captured_at',current_timestamp,'auditor',current_user,'database',current_database(),
 'approved',blocks=0 AND to_regclass('engmarq_private.fundacao_025_legado') IS NULL,
 'blocks',blocks,'pre025',to_regclass('engmarq_private.fundacao_025_legado') IS NULL,
 'legacy',(SELECT jsonb_agg(jsonb_build_object('CHECK',check_name,'RESULTADO',result) ORDER BY check_name) FROM numbered WHERE category='PRESERVACAO'),
 'checks',(SELECT jsonb_agg(jsonb_build_object('CATEGORIA',category,'CHECK',check_name,'RESULTADO',result,'STATUS',status,'DETALHES',details-'definition'-'origem_funcao'-'origem_sequence') ORDER BY category,check_name) FROM numbered),
 'snapshots',(SELECT jsonb_object_agg(relation,snapshot) FROM snapshots)) payload FROM totals)
SELECT payload "BASELINE_PRE025" FROM export_payload;
COMMIT;
`
await writeFile(new URL('025_baseline_pre025_export_readonly.sql',import.meta.url),exportSql)
// Baseline absent => deterministic blocking, never local fixture substitution.
post=post.replace(/jsonb_array_elements\(payload\)x/,'jsonb_array_elements(CASE WHEN jsonb_typeof(payload)=\'object\' THEN payload->\'legacy\' ELSE payload END)x')
const currentSnapshots=snapshots(`FROM baseline_input b CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(b.payload)='object' THEN b.payload->'snapshots' ELSE '{}'::jsonb END) prior
 JOIN pg_namespace n ON n.nspname=split_part(prior.key,'.',1)
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=split_part(prior.key,'.',2)
 CROSS JOIN LATERAL (SELECT ARRAY(SELECT jsonb_array_elements_text(prior.value->'columns')) names,ARRAY(SELECT jsonb_array_elements_text(prior.value->'keys')) keys) cols`)
const preAdditionStart=pre.indexOf("\nUNION ALL SELECT 'BASELINE','Colaboradores")
const preAdditionEnd=pre.indexOf('\n),numbered AS')
if(preAdditionStart<0||preAdditionEnd<0)throw Error('Manual checks missing')
const safety=pre.slice(preAdditionStart,preAdditionEnd).split(/\n(?=UNION ALL SELECT)/)
 .filter(s=>/^\n?UNION ALL SELECT '(INTEGRIDADE|STORAGE|SEGURANCA|CNPJ)'/.test(s)).join('\n')
const envelope=`CASE WHEN jsonb_typeof(payload)='object' AND payload->>'version'='2' AND payload->>'migration_sha256'='${freeze}' AND payload->>'approved'='true' AND payload->>'pre025'='true' AND payload->>'blocks'='0' THEN 'OK' ELSE 'BLOQUEIO' END`
const extras=`-- BEGIN BASELINE V2 EXTENSIONS
 UNION ALL SELECT 'BASELINE','Pacote PRE-025 integral','version 2',${envelope},'{}'::jsonb FROM baseline_input
 UNION ALL SELECT 'PRESERVACAO_AMPLIADA','Snapshot: '||prior.key,coalesce(current.snapshot->>'fingerprint','ausente'),
 CASE WHEN current.snapshot IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(prior.value->'columns') col WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(prior.key) AND a.attname=col AND a.attnum>0 AND NOT a.attisdropped))
 AND CASE WHEN prior.key IN ('public.empresa_comercial','public.empresa_features','public.empresa_limites','public.empresa_uso','public.auditoria_comercial')
 THEN NOT EXISTS(SELECT 1 FROM jsonb_each_text(prior.value->'rows') old WHERE current.snapshot->'rows'->>old.key IS DISTINCT FROM old.value)
 ELSE current.snapshot->>'count'=prior.value->>'count' AND current.snapshot->>'fingerprint'=prior.value->>'fingerprint' END
 THEN 'OK' ELSE 'BLOQUEIO' END,jsonb_build_object('pre',prior.value->>'fingerprint','post',current.snapshot->>'fingerprint')
 FROM baseline_input b CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(b.payload)='object' THEN b.payload->'snapshots' ELSE '{}'::jsonb END) prior
 LEFT JOIN (${currentSnapshots}) current ON current.relation=prior.key
 UNION ALL SELECT 'BACKFILL','Manifesto versus elegibilidade PRE','comparacao',CASE WHEN NOT EXISTS(
 SELECT 1 FROM baseline_input b CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.payload)='object' THEN b.payload->'checks' ELSE '[]'::jsonb END) checkrow
 LEFT JOIN engmarq_private.fundacao_025_legado l ON l.empresa_id::text=checkrow->'DETALHES'->>'empresa_id'
 WHERE checkrow->>'CHECK' LIKE 'Previsão exata: %' AND (l.empresa_id IS NULL OR
 (l.comercial_antes IS NULL AND l.features_antes='[]'::jsonb) IS DISTINCT FROM (checkrow->>'RESULTADO'='ELEGÍVEL')
 OR (l.comercial_antes IS NOT NULL) IS DISTINCT FROM (checkrow->'DETALHES'->>'possui_comercial')::boolean
 OR (l.features_antes<>'[]'::jsonb) IS DISTINCT FROM (checkrow->'DETALHES'->>'possui_features')::boolean
 OR (l.limite_antes IS NOT NULL) IS DISTINCT FROM (checkrow->'DETALHES'->>'possui_limite')::boolean
 OR (l.uso_antes IS NOT NULL) IS DISTINCT FROM (checkrow->'DETALHES'->>'possui_uso')::boolean))
 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb
 UNION ALL SELECT 'BACKFILL','Somente adicoes comerciais previstas',count(*)::text,CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM (
 SELECT c.empresa_id FROM public.empresa_comercial c LEFT JOIN engmarq_private.fundacao_025_legado l USING(empresa_id) WHERE l.empresa_id IS NULL OR (l.comercial_antes IS NULL AND (c.origem<>'legado' OR c.plano_comercial_id IS NOT NULL))
 UNION ALL SELECT z.empresa_id FROM public.empresa_limites z LEFT JOIN engmarq_private.fundacao_025_legado l USING(empresa_id) WHERE l.empresa_id IS NULL
 UNION ALL SELECT u.empresa_id FROM public.empresa_uso u LEFT JOIN engmarq_private.fundacao_025_legado l USING(empresa_id) WHERE l.empresa_id IS NULL
 UNION ALL SELECT f.empresa_id FROM public.empresa_features f LEFT JOIN engmarq_private.fundacao_025_legado l USING(empresa_id) WHERE l.empresa_id IS NULL) unexpected
 UNION ALL SELECT 'BACKFILL','Auditoria somente de adicoes previstas',count(*)::text,
 CASE WHEN count(*)=(SELECT (payload->'snapshots'->'public.auditoria_comercial'->>'count')::bigint FROM baseline_input)
 +(SELECT coalesce(sum((comercial_antes IS NULL)::integer+(limite_antes IS NULL)::integer+CASE WHEN comercial_antes IS NULL AND features_antes='[]'::jsonb THEN 7 ELSE 0 END),0) FROM engmarq_private.fundacao_025_legado)
 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.auditoria_comercial
 ${safety}
-- END BASELINE V2 EXTENSIONS
`
post=post.replace('),numbered AS',extras+'),numbered AS')
// Regeneration must preserve any already imported REAL payload verbatim.
await writeFile(new URL('025_fundacao_postflight_readonly.sql',import.meta.url),post)
console.log('Export/POST templates generated offline; frozen migration and approved preflight untouched')
