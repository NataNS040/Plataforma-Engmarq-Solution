// Audit-only evidence. In-memory PostgreSQL fixtures; no HTTP, env or remote client.
// Does not modify production code, existing tests, migrations or a persistent DB.
import { PGlite } from '@electric-sql/pglite'
import { seedTenantBase } from './tenant-fixture.mjs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const db = new PGlite()
const root = new URL('../../',import.meta.url)
const evidenceDir = new URL('docs/audits/2026-10-01/',root)
const origin = 'https://kkjckayiqvlqpdjyoxyv.supabase.co'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const migrate = async name => db.exec((await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')).replace(/^\uFEFF/,''))
const rows = async sql => (await db.query(sql)).rows
const evidence = { fixtureOnly:true,remoteExecution:false,order:['015','016','017','019','020','018'],probes:[] }
async function actor(n,callback) {
 await db.exec('BEGIN; SET LOCAL ROLE authenticated')
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(n)])
 try { return await callback() } finally { await db.exec('ROLLBACK') }
}
try {
 await seedTenantBase(db,name=>migrate(name),id)
 await migrate('017_catalogos_tenant_security.sql')
 await db.exec(`ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO authenticated,anon;
  GRANT ALL ON storage.objects TO authenticated,anon;
  GRANT SELECT ON public.vw_dashboard_documentos TO authenticated,anon;
  UPDATE storage.buckets SET public=true WHERE id='documentos';`)
 for(let n=1;n<=12;n++) {
  const company=id(n===4?102:101),path=`${company}/synthetic${n}.pdf`
  if(n<=4) await db.query(`INSERT INTO storage.objects(id,bucket_id,name,metadata)
    VALUES ($1,'documentos',$2,'{"mimetype":"application/pdf","size":9}')`,[id(800+n),path])
  await db.query(`INSERT INTO documentos(id,empresa_id,tipo_id,titulo,arquivo_url)
    VALUES($1,$2,(SELECT id FROM documento_tipos WHERE nome='PGR'),'Synthetic',$3)`,
    [id(900+n),company,n<=4?`${origin}/storage/v1/object/public/documentos/${path}`:null])
 }
 await migrate('019_documentos_path_compat.sql')
 await db.query("SELECT set_config('engmarq.storage_origin',$1,false)",[origin])
 await migrate('020_documentos_private_storage.sql')
 await migrate('018_treinamentos_tenant_security.sql')
 evidence.storage=await rows(`SELECT count(*)::int documentos,
  count(*) FILTER(WHERE arquivo_url IS NOT NULL)::int legacy_references,
  count(*) FILTER(WHERE arquivo_path IS NOT NULL)::int canonical_references,
  count(*) FILTER(WHERE arquivo_url IS NOT NULL AND arquivo_path IS NULL)::int pending_backfill
  FROM documentos`)
 assert.deepEqual(evidence.storage,[{documentos:12,legacy_references:4,canonical_references:4,pending_backfill:0}])
 evidence.probes.push({name:'real migration order compatible in fixtures',result:'confirmed'})
 for(const n of [1,3,5,8,7,9]) {
  evidence.probes.push(await actor(n,async()=>({name:`read actor ${n}`,
   profiles:(await rows('SELECT id FROM user_profiles')).length,
   colaboradores:(await rows('SELECT id FROM colaboradores')).length,
   funcoes:(await rows('SELECT id FROM funcoes')).length,
   documentos:(await rows('SELECT id FROM documentos')).length,
   objects:(await rows("SELECT id FROM storage.objects WHERE bucket_id='documentos'")).length,
   document_view:(await rows('SELECT empresa_id FROM vw_dashboard_documentos')).length,
   document_view_foreign:(await rows(`SELECT empresa_id FROM vw_dashboard_documentos WHERE empresa_id<>public.get_user_empresa_id()`)).length})))
 }
 evidence.probes.push(await actor(1,async()=>({name:'admin updates general document metadata without file change',
  changed:(await rows("UPDATE documentos SET titulo='Audit probe' WHERE id='"+id(901)+"' RETURNING id")).length})))
 evidence.probes.push(await actor(9,async()=>({name:'suspended-tenant gestor reactivates company through direct database API policy',
  changed:(await rows(`UPDATE empresas SET status='ativa' WHERE id='${id(103)}' RETURNING id`)).length,
  colaboradores_after_reactivation:(await rows('SELECT id FROM colaboradores')).length})))
 evidence.probes.push(await actor(3,async()=>({name:'direct training insert accepts same-tenant missing certificate object',
  changed:(await rows(`INSERT INTO treinamentos(empresa_id,colaborador_id,treinamento_tipo_id,data_realizacao,certificado_url)
   VALUES('${id(101)}','${id(201)}',(SELECT id FROM treinamento_tipos LIMIT 1),CURRENT_DATE,
    '${id(101)}/certificados/missing.pdf') RETURNING id`)).length})))
 evidence.probes.push(await actor(3,async()=>({name:'general referenced document object can be deleted by own tenant',
  deleted:(await rows(`DELETE FROM storage.objects WHERE name='${id(101)}/synthetic1.pdf' RETURNING id`)).length})))
 await db.exec('BEGIN; SET LOCAL ROLE anon')
 evidence.probes.push({name:'anonymous view query with SELECT grant',
  documentos:(await rows('SELECT id FROM documentos')).length,
  document_view:(await rows('SELECT * FROM vw_dashboard_documentos')).length,
  objects:(await rows("SELECT * FROM storage.objects WHERE bucket_id='documentos'")).length})
 await db.exec('ROLLBACK')
 const publicTables=['user_profiles','colaboradores','funcoes','setores','ambientes','treinamento_tipos','matriz_treinamentos','treinamentos','documentos']
 const quoted=publicTables.map(t=>`'${t}'`).join(',')
 const manifest={
  policies:await rows(`SELECT schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check
   FROM pg_policies WHERE (schemaname='public' AND tablename IN (${quoted})) OR
    (schemaname='storage' AND tablename='objects' AND (policyname LIKE 'documentos_%' OR policyname LIKE 'certificados_%'))
   ORDER BY schemaname,tablename,policyname`),
  functions:await rows(`SELECT p.oid::regprocedure::text signature,p.prorettype::regtype::text result_type,p.prosecdef,p.provolatile::text,
   p.proconfig::text,md5(regexp_replace(p.prosrc,'[[:space:]]','','g')) source_hash,
   pg_get_functiondef(p.oid) definition
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
    (n.nspname='engmarq_private' AND p.proname IN ('can_manage_profile','guard_profile_update','can_access_colaboradores',
    'guard_colaborador_write','can_access_catalogos','guard_catalogo_write','guard_treinamento_write','can_access_certificado',
    'documento_legacy_path','can_access_documento','guard_documento_reference'))
    ORDER BY signature`),
  constraints:await rows(`SELECT n.nspname||'.'||c.relname relation,k.conname,k.contype::text,
    pg_get_constraintdef(k.oid) definition,k.convalidated FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${quoted})
    AND k.contype IN ('f','u','c') ORDER BY relation,conname`),
  triggers:await rows(`SELECT n.nspname||'.'||c.relname relation,t.tgname,t.tgtype::int,t.tgenabled::text,
    t.tgfoid::regprocedure::text function_name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${quoted})
    AND NOT t.tgisinternal ORDER BY relation,tgname`)
 }
 await mkdir(evidenceDir,{recursive:true})
 await writeFile(new URL('local-probes.json',evidenceDir),JSON.stringify(evidence,null,2)+'\n')
 await writeFile(new URL('expected-catalog.json',evidenceDir),JSON.stringify(manifest,null,2)+'\n')
 console.log(JSON.stringify(evidence,null,2))
 const auditUrl=new URL('post_migrations_015_020_audit_readonly.sql',import.meta.url)
 try {
  const sql=await readFile(auditUrl,'utf8')
  const snapshot=async()=>Promise.all([
   rows('SELECT * FROM documentos ORDER BY id'),rows('SELECT * FROM storage.objects ORDER BY id'),
   rows('SELECT * FROM storage.buckets ORDER BY id'),rows('SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname'),
   rows('SELECT oid,tgname,tgtype,tgenabled,tgfoid FROM pg_trigger ORDER BY oid'),
   rows("SELECT p.oid,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private' ORDER BY p.oid"),
  ])
  const before=await snapshot()
  const result=await db.exec(sql)
  const final=result.filter(r=>r.rows?.length).at(-1).rows
  assert.deepEqual(Object.keys(final[0]),['CHECK','RESULTADO','STATUS'])
  assert.ok(final.every(r=>['OK','ATENÇÃO','BLOQUEIO'].includes(r.STATUS)))
  assert.deepEqual(final.slice(-2).map(r=>r.CHECK),['TOTAL_BLOQUEIOS','TOTAL_ATENCOES'])
  assert.equal(Number(final.at(-2).RESULTADO),final.slice(0,-2).filter(r=>r.STATUS==='BLOQUEIO').length)
  assert.equal(Number(final.at(-1).RESULTADO),final.slice(0,-2).filter(r=>r.STATUS==='ATENÇÃO').length)
  assert.deepEqual(await snapshot(),before)
  for(const label of ['Storage: documentos preservados','Storage: legacy_references preservadas',
   'Storage: canonical_references após backfill','Storage: pending_backfill','Storage: objetos preservados',
   'Storage: MIME inválido','Storage: tamanho inválido ou acima de 10 MB','Bucket documentos: configuração final'])
    assert.equal(final.find(r=>r.CHECK===label)?.STATUS,'OK',label)
  await writeFile(new URL('local-readonly-audit-result.json',evidenceDir),JSON.stringify(final,null,2)+'\n')
  console.log('Audit SQL read-only verified locally; totals:',final.slice(-2))
  const negative=[]
  for(const [name,mutate,restore,label] of [
   ['bad MIME',`UPDATE storage.objects SET metadata=jsonb_set(metadata,'{mimetype}','"invalid/type"')`,
    `UPDATE storage.objects SET metadata=jsonb_set(metadata,'{mimetype}','"application/pdf"')`,'Storage: MIME inválido'],
   ['bad size',`UPDATE storage.objects SET metadata=jsonb_set(metadata,'{size}','"malformed"')`,
    `UPDATE storage.objects SET metadata=jsonb_set(metadata,'{size}','9')`,'Storage: tamanho inválido ou acima de 10 MB'],
   ['public bucket',"UPDATE storage.buckets SET public=true WHERE id='documentos'",
    "UPDATE storage.buckets SET public=false WHERE id='documentos'",'Bucket documentos: configuração final'],
   ['RLS off','ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY','ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY','RLS: storage.objects'],
   ['wrong helper path',"ALTER FUNCTION engmarq_private.can_access_documento(text,boolean) SET search_path=public",
    "ALTER FUNCTION engmarq_private.can_access_documento(text,boolean) SET search_path=''",'Função: engmarq_private.can_access_documento(text,boolean)'],
   ['missing tenant guard','DROP POLICY documentos_tenant_insert_guard ON storage.objects',
    'CREATE POLICY documentos_tenant_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK (bucket_id<>\'documentos\' OR engmarq_private.can_access_documento(name,true))',
    'Policy: storage.objects.documentos_tenant_insert_guard'],
   ['count drift',`DELETE FROM documentos WHERE id='${id(912)}'`,null,'Storage: documentos preservados'],
  ]) {
   await db.exec(mutate)
   const changed=await snapshot()
   const rerun=await db.exec(sql)
   const checks=rerun.filter(r=>r.rows?.length).at(-1).rows
   assert.equal(checks.find(r=>r.CHECK===label)?.STATUS,'BLOQUEIO',name)
   assert.deepEqual(await snapshot(),changed,name+' read-only snapshot')
   assert.equal(Number(checks.at(-2).RESULTADO),checks.slice(0,-2).filter(r=>r.STATUS==='BLOQUEIO').length)
   if(restore)await db.exec(restore)
   negative.push({name,status:'passed'})
  }
  await writeFile(new URL('local-audit-validation.json',evidenceDir),JSON.stringify({
   baselineReport:'passed',dataCatalogSnapshot:'unchanged by audit SQL',negativeScenarios:negative,
   productionTestFailuresRemainUnchanged:true,
  },null,2)+'\n')
  console.log('Supplementary audit validation passed:',negative.length,'negative scenarios')
 } catch(e) {if(e.code!=='ENOENT')throw e}
} finally {await db.close()}
