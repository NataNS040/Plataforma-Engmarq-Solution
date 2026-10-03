// Local-only generation from synthetic PostgreSQL; never loads credentials.
import {writeFile} from 'node:fs/promises'
import {examesFixture,migrate} from './exames-fixture.mjs'
const catalog=`WITH entries AS (
 SELECT 'relation:'||c.oid::regclass::text identity,jsonb_build_object('rls',c.relrowsecurity,'options',c.reloptions) detail
 FROM pg_class c WHERE c.oid IN (to_regclass('public.documentos'),to_regclass('public.exames_catalogo'),to_regclass('public.vw_dashboard_documentos'),to_regclass('storage.objects'))
 UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||'.'||policyname,
 jsonb_build_object('permissive',permissive,'roles',roles::text,'command',cmd,'using',qual,'check',with_check)
 FROM pg_policies WHERE (schemaname='public' AND tablename IN ('documentos','exames_catalogo'))
 OR (schemaname='storage' AND tablename='objects' AND policyname LIKE 'documentos_%')
 UNION ALL SELECT 'function:'||p.oid::regprocedure::text,
 jsonb_build_object('hash',md5(replace(p.prosrc,E'\\r\\n',E'\\n')),'definer',p.prosecdef,'config',p.proconfig,
 'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'owner',pg_get_userbyid(p.proowner),'owner_privileged',(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE oid=p.proowner),
 'authenticated_owner_member',pg_has_role('authenticated',p.proowner,'MEMBER'),'anon_owner_member',pg_has_role('anon',p.proowner,'MEMBER'),
 'volatility',p.provolatile,'return_type',p.prorettype::regtype::text)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private'
 AND p.proname IN ('can_access_catalogos','can_access_documento_row','can_access_documento','guard_documento_metadata',
 'guard_documento_reference','guard_aso_write','can_read_exames_catalogo')
 UNION ALL SELECT 'trigger:'||tgname,jsonb_build_object('definition',pg_get_triggerdef(oid),'enabled',tgenabled)
 FROM pg_trigger WHERE tgrelid=to_regclass('public.documentos') AND NOT tgisinternal
 UNION ALL SELECT 'constraint:'||conname,jsonb_build_object('definition',pg_get_constraintdef(oid),'validated',convalidated)
 FROM pg_constraint WHERE conrelid=to_regclass('public.documentos')
 UNION ALL SELECT 'view:vw_dashboard_documentos',jsonb_build_object('definition',pg_get_viewdef(oid))
 FROM pg_class WHERE oid=to_regclass('public.vw_dashboard_documentos')
 UNION ALL SELECT 'column:documentos.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull)
 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.documentos') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'grant:'||c.oid::regclass::text||'.'||r.role,
 jsonb_build_object('select',has_table_privilege(r.role,c.oid,'SELECT'),
 'delete',has_table_privilege(r.role,c.oid,'DELETE'),
 'insert',ARRAY(SELECT attname FROM pg_attribute a WHERE a.attrelid=c.oid AND attnum>0 AND NOT attisdropped AND has_column_privilege(r.role,c.oid,a.attname,'INSERT') ORDER BY attname),
 'update',ARRAY(SELECT attname FROM pg_attribute a WHERE a.attrelid=c.oid AND attnum>0 AND NOT attisdropped AND has_column_privilege(r.role,c.oid,a.attname,'UPDATE') ORDER BY attname))
 FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'))r(role)
 WHERE c.oid IN (to_regclass('public.documentos'),to_regclass('public.exames_catalogo'))
 UNION ALL SELECT 'index:'||indexname,jsonb_build_object('definition',indexdef) FROM pg_indexes WHERE schemaname='public' AND tablename='documentos'
) SELECT identity,detail FROM entries`
const db=await examesFixture()
try{
 for(const stage of ['preflight','postflight']) {
  if(stage==='postflight')await migrate(db,'023_exames_aso.sql')
  const expected=(await db.query(catalog)).rows
  const manifest=JSON.stringify(expected).replaceAll("'","''")
  const post=stage==='postflight'
  const sql=`-- 023 Exames/ASO ${stage}. Execute COMPLETE file as trusted SQL Editor auditor.
-- Read-only; no corrections, impersonation, signed URLs or file-content access.
-- Save ALL result sets. Pre/post preservation fingerprints MUST match before application deployment.
-- Fixed counts reflect approved inventory: changes since inventory require review, never automatic cleanup.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH actual AS (${catalog}),expected AS
(SELECT * FROM jsonb_to_recordset('${manifest}'::jsonb)e(identity text,detail jsonb))
SELECT coalesce(a.identity,e.identity) AS "CHECK",
CASE WHEN a.identity IS NULL THEN 'ausente' WHEN e.identity IS NULL THEN 'objeto adicional' WHEN a.detail IS DISTINCT FROM e.detail THEN 'contrato divergente' ELSE 'contrato conferido' END AS "RESULTADO",
CASE WHEN a.detail IS DISTINCT FROM e.detail THEN 'BLOQUEIO' ELSE 'OK' END AS "STATUS"
FROM actual a FULL JOIN expected e USING(identity) ORDER BY 1;

-- Authorization of the auditor: filtered tenant snapshots never prove global preservation.
SELECT 'Auditor integral' AS "CHECK",current_user AS "RESULTADO",
CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS";

WITH asos AS (SELECT d.* FROM public.documentos d JOIN public.documento_tipos t ON t.id=d.tipo_id WHERE lower(btrim(t.nome))='aso'),
checks(label,n,expected) AS (
 SELECT 'Documentos preservados',count(*),12 FROM public.documentos
 UNION ALL SELECT 'ASOs preservados',count(*),4 FROM asos
 UNION ALL SELECT 'Admissionais preservados',count(*),3 FROM asos WHERE subtipo_exame='admissional'
 UNION ALL SELECT 'Periódicos preservados',count(*),1 FROM asos WHERE subtipo_exame='periodico'
 UNION ALL SELECT 'ASOs com colaborador válido',count(*),4 FROM asos d JOIN public.colaboradores c ON c.id=d.colaborador_id AND c.empresa_id=d.empresa_id
 UNION ALL SELECT 'ASOs com observações legadas intactas',count(*),4 FROM asos WHERE observacoes='Apto'
 UNION ALL SELECT 'ASOs com procedimentos preenchidos',count(*),3 FROM asos WHERE cardinality(exames_realizados)>0
 UNION ALL SELECT 'ASOs com procedimentos vazios',count(*),1 FROM asos WHERE cardinality(exames_realizados)=0
 UNION ALL SELECT 'Catálogo preservado',count(*),27 FROM public.exames_catalogo
 UNION ALL SELECT 'ASOs com arquivo',count(*),1 FROM asos WHERE arquivo_path IS NOT NULL OR arquivo_url IS NOT NULL
 UNION ALL SELECT 'ASOs sem arquivo',count(*),3 FROM asos WHERE arquivo_path IS NULL AND arquivo_url IS NULL
 UNION ALL SELECT 'Não-ASOs associados a colaborador',count(*),2 FROM public.documentos d JOIN public.documento_tipos t ON t.id=d.tipo_id
 WHERE lower(btrim(t.nome))<>'aso' AND d.colaborador_id IS NOT NULL
 UNION ALL SELECT 'Cross-tenant/colaborador inválido',count(*),0 FROM public.documentos d LEFT JOIN public.colaboradores c ON c.id=d.colaborador_id
 WHERE d.colaborador_id IS NOT NULL AND (c.id IS NULL OR c.empresa_id<>d.empresa_id)
 UNION ALL SELECT 'Bucket privado/limite/MIME',count(*),1 FROM storage.buckets WHERE id='documentos' AND NOT public AND file_size_limit=10485760
 AND cardinality(allowed_mime_types)=7 AND allowed_mime_types @> ARRAY['application/pdf','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']
 UNION ALL SELECT 'Referências canônicas sem objeto',count(*),0 FROM public.documentos d WHERE arquivo_path IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=d.arquivo_path)
 ${post ? "UNION ALL SELECT 'Resultado novo continua NULL no legado',count(*),4 FROM asos WHERE resultado_aso IS NULL" : ''}
)
SELECT label AS "CHECK",n::text||' / esperado '||expected::text AS "RESULTADO",CASE WHEN n=expected THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS" FROM checks ORDER BY label;

-- Fingerprints contain no row contents. Compare exactly between preflight and postflight.
SELECT 'Preservação: documentos (sem coluna nova)' AS "CHECK",
md5(coalesce(jsonb_agg(to_jsonb(d)-'resultado_aso' ORDER BY d.id)::text,'[]')) AS "RESULTADO",'ATENÇÃO' AS "STATUS" FROM public.documentos d
UNION ALL SELECT 'Preservação: catálogo',md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id)::text,'[]')),'ATENÇÃO' FROM public.exames_catalogo c
UNION ALL SELECT 'Preservação: objetos documentos',md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id)::text,'[]')),'ATENÇÃO' FROM storage.objects o WHERE bucket_id='documentos'
UNION ALL SELECT 'Preservação: tipos documentais',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')),'ATENÇÃO' FROM public.documento_tipos t;
COMMIT;
`
  await writeFile(new URL(`023_exames_aso_${stage}_readonly.sql`,import.meta.url),sql)
 }
 console.log('Generated 023 preflight/postflight from synthetic local migrations; no remote execution')
}finally{await db.close()}
