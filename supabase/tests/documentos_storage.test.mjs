import { seedTenantBase } from './tenant-fixture.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
// Production SQL is executed unchanged in memory. Synthetic rows use the exact
// trusted prefix; a URL literal never performs a network request.
const origin = 'https://kkjckayiqvlqpdjyoxyv.supabase.co'
const load = async name => (await readFile(new URL(name,import.meta.url),'utf8')).replace(/^\uFEFF/,'')
const migrate = async (db,name) => db.exec(await load(`../migrations/${name}`))
const preflight = async db => db.exec(await load('018_storage_preflight_readonly.sql'))
const cutoverPreflight = async db => {
  // Retain our explicit session configuration for the read-only preflight.
  const sql=(await load('019_documentos_cutover_preflight_readonly.sql'))
    .replace(/^SET engmarq\.storage_origin = '[^']+';$/m,'')
  return (await db.query(sql)).rows
}
async function setup(db) {
  await seedTenantBase(db,name => migrate(db,name),id)
  await migrate(db,'017_catalogos_tenant_security.sql')
  await db.exec(`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
    UPDATE storage.buckets SET public=true,file_size_limit=NULL,allowed_mime_types=NULL WHERE id='documentos';`)
  for (const n of [1,2,3,4]) {
    const company = id(n<4?101:102); const path=`${company}/synthetic${n}.pdf`
    await db.query(`INSERT INTO storage.objects (id,bucket_id,name,metadata) VALUES ($1,'documentos',$2,$3)`,
      [id(800+n),path,JSON.stringify({ mimetype:'application/pdf',size:9 })])
    await db.query(`INSERT INTO documentos (id,empresa_id,tipo_id,titulo,arquivo_url)
      VALUES ($1,$2,(SELECT id FROM documento_tipos WHERE nome=$3),'Synthetic',$4)`,
      [id(900+n),company,n===3?'ASO':'PGR',`${origin}/storage/v1/object/public/documentos/${path}`])
  }
  // Synthetic stale calculated status must not be changed by a path-only backfill.
  await db.exec('ALTER TABLE documentos DISABLE TRIGGER trg_documento_status')
  await db.query("UPDATE documentos SET vencimento='2020-01-01',status='vigente' WHERE id=$1",[id(901)])
  await db.exec('ALTER TABLE documentos ENABLE TRIGGER trg_documento_status')
  await preflight(db)
  await migrate(db,'019_documentos_path_compat.sql')
  await db.query("SELECT set_config('engmarq.storage_origin',$1,false)",[origin])
  const checks=await cutoverPreflight(db)
  assert.equal(checks.filter(row=>row.STATUS==='BLOQUEIO').length,0)
  assert.ok(checks.some(row=>row.CHECK==='019: helper de conversão' && row.STATUS==='OK'))
  assert.ok(checks.some(row=>row.CHECK==='Histórico de migrations: 018/020' && row.STATUS==='ATENÇÃO'))
  assert.ok(checks.some(row=>row.CHECK==='Referências pendentes de backfill' && row.RESULTADO==='4 registro(s)'))
}
const db = new PGlite()
let original
before(async () => {
  await setup(db)
  original=(await db.query('SELECT * FROM documentos ORDER BY id')).rows
  await migrate(db,'020_documentos_private_storage.sql')
  await db.exec('GRANT USAGE ON SCHEMA storage TO authenticated,anon,service_role; GRANT ALL ON storage.objects TO authenticated,anon,service_role')
  // An overly broad policy must not weaken tenant/role guards.
  await db.exec('CREATE POLICY unexpected_broad_policy ON storage.objects FOR ALL TO PUBLIC USING (true) WITH CHECK (true)')
})
after(() => db.close())
test('production 020 explicitly restores the trusted origin, never arbitrary session input',async () => {
  const isolated=new PGlite()
  try {
    await setup(isolated)
    await isolated.query("SELECT set_config('engmarq.storage_origin',$1,false)",['https://untrusted.test'])
    await migrate(isolated,'020_documentos_private_storage.sql')
    assert.equal((await isolated.query("SELECT current_setting('engmarq.storage_origin') origin")).rows[0].origin,origin)
    assert.equal((await isolated.query('SELECT count(*)::int n FROM documentos WHERE arquivo_path IS NOT NULL')).rows[0].n,4)
    await assert.rejects(isolated.query('SELECT engmarq_private.documento_legacy_path($1,$2,$3)',
      [`https://untrusted.test/storage/v1/object/public/documentos/${id(101)}/synthetic1.pdf`,id(101),origin]),/Unrecognized legacy/)
  } finally {await isolated.close()}
})
test('B03 a Supabase-shaped foreign origin still fails atomically under unchanged production SQL',async()=>{
 const isolated=new PGlite()
 try {
  await setup(isolated)
  await isolated.query('UPDATE documentos SET arquivo_url=$1 WHERE id=$2',[
    `https://foreign-project.supabase.co/storage/v1/object/public/documentos/${id(101)}/synthetic1.pdf`,id(901)])
  const before=(await isolated.query('SELECT * FROM documentos ORDER BY id')).rows
  await assert.rejects(migrate(isolated,'020_documentos_private_storage.sql'),/Unrecognized legacy document reference/)
  await isolated.exec('ROLLBACK')
  assert.deepEqual((await isolated.query('SELECT * FROM documentos ORDER BY id')).rows,before)
  assert.equal((await isolated.query("SELECT public FROM storage.buckets WHERE id='documentos'")).rows[0].public,true)
 }finally{await isolated.close()}
})
async function actor(n,run,role='authenticated') {
  await db.exec('BEGIN')
  try {
    assert.ok(['authenticated','anon'].includes(role))
    await db.exec(`SET LOCAL ROLE ${role}`)
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(n)])
    return await run()
  } finally { await db.exec('ROLLBACK') }
}
test('cutover is private with 10 MB and preserves all supported types including certificate images',async () => {
  const bucket=(await db.query("SELECT * FROM storage.buckets WHERE id='documentos'")).rows[0]
  assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),10485760)
  assert.equal(bucket.allowed_mime_types.length,7)
  assert.ok(bucket.allowed_mime_types.includes('image/png'));assert.ok(bucket.allowed_mime_types.includes('image/jpeg'))
  assert.equal((await db.query("SELECT has_schema_privilege('anon','engmarq_private','USAGE') allowed")).rows[0].allowed,false)
})
test('all four legacy records, URLs and objects are preserved; canonical paths are backfilled',async () => {
  const preserved=(await db.query('SELECT * FROM documentos ORDER BY id')).rows
  for (const row of preserved) row.arquivo_path=null
  assert.deepEqual(preserved,original)
  assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='documentos'::regclass AND tgname='trg_documento_status'")).rows[0].tgenabled,'O')
  const rows=(await db.query('SELECT arquivo_path,arquivo_url FROM documentos')).rows
  assert.equal(rows.length,4)
  assert.ok(rows.every(r => r.arquivo_url.endsWith(r.arquivo_path)))
  assert.equal(Number((await db.query("SELECT count(*) AS n FROM storage.objects WHERE bucket_id='documentos'")).rows[0].n),4)
})
for (const [n,count] of [[1,0],[2,0],[3,3],[4,3],[5,3],[7,0],[8,1],[9,0],[10,0]]) {
  test(`tenant Storage read actor ${n}`,() => actor(n,async () => {
    assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='documentos'")).rows.length,count)
  }))
}
test('anonymous access remains denied despite a permissive PUBLIC policy',() => actor(3,async () => {
  assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='documentos'")).rows.length,0)
},'anon'))
for (const [n,allowed] of [[1,false],[3,true],[4,true],[5,false],[7,false],[8,false],[9,false]]) {
  test(`upload own A path actor ${n}`,() => actor(n,async () => {
    const upload=db.query("INSERT INTO storage.objects (id,bucket_id,name) VALUES ($1,'documentos',$2)",
      [id(999),`${id(101)}/new.pdf`])
    if(allowed) await upload
    else await assert.rejects(upload,e => e.code==='42501')
  }))
}
test('forged path, traversal, malformed and foreign tenant uploads fail',() => actor(3,async () => {
  for(const path of [`${id(102)}/new.pdf`,`${id(101)}/../new.pdf`,`${id(101)}/x/y.pdf`]) {
    await db.exec('SAVEPOINT forged')
    await assert.rejects(db.query("INSERT INTO storage.objects VALUES ($1,'documentos',$2,NULL)",[id(999),path]),e=>e.code==='42501')
    await db.exec('ROLLBACK TO SAVEPOINT forged')
  }
}))
test('operacional cannot update or delete files',() => actor(5,async () => {
  assert.equal((await db.query("UPDATE storage.objects SET name=name WHERE bucket_id='documentos' RETURNING id")).rows.length,0)
  assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='documentos' RETURNING id")).rows.length,0)
}))
test('certificate history is immutable even before 018',() => actor(3,async () => {
  await db.query("INSERT INTO storage.objects VALUES ($1,'documentos',$2,NULL)",[id(999),`${id(101)}/certificados/cert.pdf`])
  assert.equal((await db.query("UPDATE storage.objects SET name=name WHERE name LIKE '%/certificados/%' RETURNING id")).rows.length,0)
  assert.equal((await db.query("DELETE FROM storage.objects WHERE name LIKE '%/certificados/%' RETURNING id")).rows.length,0)
}))
test('document writes persist a canonical reference but reject new public/signed URLs',() => actor(3,async () => {
  for (const url of [`${origin}/storage/v1/object/sign/documentos/${id(101)}/synthetic1.pdf?token=x`,original[1].arquivo_url]) {
    await db.exec('SAVEPOINT invalid_url')
    await assert.rejects(db.query('UPDATE documentos SET arquivo_url=$1 WHERE id=$2',[url,id(901)]),e=>e.code==='42501')
    await db.exec('ROLLBACK TO SAVEPOINT invalid_url')
  }
}))
test('replacement preserves old URL and objects; missing/foreign paths abort',() => actor(3,async () => {
  await db.query("INSERT INTO storage.objects VALUES ($1,'documentos',$2,NULL)",[id(999),`${id(101)}/replacement.pdf`])
  await db.query('UPDATE documentos SET arquivo_path=$1 WHERE id=$2',[`${id(101)}/replacement.pdf`,id(901)])
  assert.equal((await db.query('SELECT arquivo_url FROM documentos WHERE id=$1',[id(901)])).rows[0].arquivo_url,original[0].arquivo_url)
  for(const path of [`${id(101)}/missing.pdf`,`${id(102)}/synthetic4.pdf`]) {
    await db.exec('SAVEPOINT invalid_path')
    await assert.rejects(db.query('UPDATE documentos SET arquivo_path=$1 WHERE id=$2',[path,id(901)]))
    await db.exec('ROLLBACK TO SAVEPOINT invalid_path')
  }
}))
test('operacional and admin cannot clear a canonical reference',async () => {
  for(const n of [1,5]) await actor(n,async () => {
    try {
      const changed=await db.query('UPDATE documentos SET arquivo_path=NULL WHERE id=$1 RETURNING id',[id(901)])
      assert.equal(changed.rows.length,0)
    } catch(error) { assert.equal(error.code,'42501') }
  })
})
test('020 guards coexist with unchanged 018; read-only preflight detects its footprints',async () => {
  const cutover=await cutoverPreflight(db)
  assert.ok(cutover.some(row=>row.CHECK==='020: funções já existentes' && row.STATUS==='BLOQUEIO'))
  assert.ok(cutover.some(row=>row.CHECK==='020: guards de Storage já existentes' && row.STATUS==='BLOQUEIO'))
  await migrate(db,'018_treinamentos_tenant_security.sql')
  const applied=await cutoverPreflight(db)
  assert.ok(applied.some(row=>row.CHECK==='018: funções criadas' && row.STATUS==='BLOQUEIO'))
  await assert.rejects(preflight(db),/018 footprint/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND policyname LIKE 'certificados_%'")).rows[0].n,4)
})
for(const scenario of ['external_url','foreign_tenant','missing_object','unsupported_mime','oversize']) {
  test(`020 aborts atomically on ${scenario}`,async () => {
    const isolated=new PGlite()
    try {
      await setup(isolated)
      if(scenario==='external_url')await isolated.exec("UPDATE documentos SET arquivo_url='https://external.test/file.pdf'")
      if(scenario==='foreign_tenant')await isolated.query('UPDATE documentos SET arquivo_url=$1 WHERE id=$2',
        [`${origin}/storage/v1/object/public/documentos/${id(102)}/synthetic4.pdf`,id(901)])
      if(scenario==='missing_object')await isolated.query("DELETE FROM storage.objects WHERE id=$1",[id(801)])
      if(scenario==='unsupported_mime')await isolated.exec(`UPDATE storage.objects SET metadata='{"mimetype":"application/x-unknown","size":9}'`)
      if(scenario==='oversize')await isolated.exec(`UPDATE storage.objects SET metadata='{"mimetype":"application/pdf","size":10485761}'`)
      const snapshot=(await isolated.query('SELECT * FROM documentos ORDER BY id')).rows
      const count=(await isolated.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n
      const checks=await cutoverPreflight(isolated)
      assert.ok(checks.some(row=>row.STATUS==='BLOQUEIO'),`preflight must block ${scenario}`)
      assert.deepEqual((await isolated.query('SELECT * FROM documentos ORDER BY id')).rows,snapshot)
      await assert.rejects(migrate(isolated,'020_documentos_private_storage.sql'))
      await isolated.exec('ROLLBACK')
      assert.equal((await isolated.query("SELECT public FROM storage.buckets WHERE id='documentos'")).rows[0].public,true)
      assert.deepEqual((await isolated.query('SELECT * FROM documentos ORDER BY id')).rows,snapshot)
      assert.equal((await isolated.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n,count)
      assert.equal((await isolated.query("SELECT to_regprocedure('engmarq_private.can_access_documento(text,boolean)') present")).rows[0].present,null)
    } finally { await isolated.close() }
  })
}


test('020 can be reapplied without collisions or changes to records/objects', async () => {
  const isolated=new PGlite()
  try {
    await setup(isolated)
    await migrate(isolated,'020_documentos_private_storage.sql')
    const rows=(await isolated.query('SELECT * FROM documentos ORDER BY id')).rows
    const objects=(await isolated.query('SELECT * FROM storage.objects ORDER BY id')).rows
    await migrate(isolated,'020_documentos_private_storage.sql')
    assert.deepEqual((await isolated.query('SELECT * FROM documentos ORDER BY id')).rows,rows)
    assert.deepEqual((await isolated.query('SELECT * FROM storage.objects ORDER BY id')).rows,objects)
    assert.equal((await isolated.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'documentos_%'")).rows[0].n,8)
    assert.equal((await isolated.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname='guard_documento_reference'")).rows[0].n,1)
  } finally { await isolated.close() }
})

test('failure at the former ownership error point rolls back backfill, trigger state and function; retry succeeds',async () => {
 const isolated=new PGlite()
 try {
  await setup(isolated)
  for (let n=0;n<8;n++) await isolated.query(`INSERT INTO documentos (id,empresa_id,tipo_id,titulo)
    VALUES ($1,$2,(SELECT id FROM documento_tipos WHERE nome='PGR'),'No attachment')`,[id(950+n),id(101)])
  const rows=(await isolated.query('SELECT * FROM documentos ORDER BY id')).rows
  const policies=(await isolated.query('SELECT * FROM pg_policies ORDER BY policyname')).rows
  const sql=await load('../migrations/020_documentos_private_storage.sql')
  const point=/DROP\s+POLICY\s+IF\s+EXISTS\s+documentos_storage_select\s+ON\s+storage\.objects\s*;/i
  assert.match(sql,point,'fault injection must match the real production statement')
  const failing=sql.replace(point,statement =>
   "DO $$ BEGIN RAISE EXCEPTION 'must be owner of table objects' USING ERRCODE='42501'; END $$;\n"+statement)
  assert.notEqual(failing,sql)
  await assert.rejects(isolated.exec(failing),e=>e.code==='42501')
  await isolated.exec('ROLLBACK')
  assert.deepEqual((await isolated.query('SELECT * FROM documentos ORDER BY id')).rows,rows)
  assert.deepEqual((await isolated.query('SELECT * FROM pg_policies ORDER BY policyname')).rows,policies)
  assert.equal((await isolated.query("SELECT to_regprocedure('engmarq_private.can_access_documento(text,boolean)') f")).rows[0].f,null)
  assert.equal((await isolated.query("SELECT tgenabled FROM pg_trigger WHERE tgname='trg_documento_status'")).rows[0].tgenabled,'O')
  const before=(await isolated.query('SELECT * FROM storage.objects ORDER BY id')).rows
  const preflightSql=(await load('020_failed_attempt_preflight_readonly.sql')).replaceAll('https://kkjckayiqvlqpdjyoxyv.supabase.co',origin)
  const result=await isolated.exec(preflightSql)
  assert.ok(result.some(r=>r.rows?.some(row=>row.check_name==='pending_backfill' && row.status==='OK')))
  assert.ok(result.some(r=>r.rows?.some(row=>row.check_name==='documentos' && row.status==='OK')))
  assert.ok(result.some(r=>r.rows?.some(row=>row.operation?.includes('CREATE POLICY') && row.supported===true)))
  const finalRows=result.filter(r=>r.rows?.length).at(-1).rows
  assert.deepEqual(Object.keys(finalRows[0]),['CHECK','RESULTADO','STATUS'])
  assert.ok(finalRows.every(r=>['OK','ATENÇÃO','BLOQUEIO'].includes(r.STATUS)))
  for (const label of ['documentos','legacy_references','canonical_references','pending_backfill','objetos'])
    assert.equal(finalRows.find(r=>r.CHECK===`Baseline: ${label}`).STATUS,'OK')
  assert.equal(finalRows.find(r=>r.CHECK==='Storage: RLS ativo em storage.objects').STATUS,'OK')
  assert.equal(finalRows.find(r=>r.CHECK==='Bucket documentos: estado pré-cutover').STATUS,'OK')
  assert.equal(finalRows.find(r=>r.CHECK==='Storage: quatro policies legadas de documentos').STATUS,'OK')
  const checks=finalRows.slice(0,-2)
  assert.deepEqual(finalRows.slice(-2).map(r=>r.CHECK),['TOTAL_BLOQUEIOS','TOTAL_ATENCOES'])
  assert.equal(Number(finalRows.at(-2).RESULTADO),checks.filter(r=>r.STATUS==='BLOQUEIO').length)
  assert.equal(Number(finalRows.at(-1).RESULTADO),checks.filter(r=>r.STATUS==='ATENÇÃO').length)
  assert.equal(Number(finalRows.at(-2).RESULTADO),0)
  assert.ok(Number(finalRows.at(-1).RESULTADO)>0)

  assert.deepEqual((await isolated.query('SELECT * FROM documentos ORDER BY id')).rows,rows)
  assert.deepEqual((await isolated.query('SELECT * FROM storage.objects ORDER BY id')).rows,before)
  await migrate(isolated,'020_documentos_private_storage.sql')
  assert.equal((await isolated.query('SELECT count(*)::int n FROM documentos')).rows[0].n,12)
  assert.equal((await isolated.query('SELECT count(*)::int n FROM documentos WHERE arquivo_path IS NOT NULL')).rows[0].n,4)
 } finally { await isolated.close() }
})

test('020 fails closed when platform RLS is disabled; it never enables RLS itself',async () => {
 const isolated=new PGlite()
 try {
  await setup(isolated)
  await isolated.exec('ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY')
  await assert.rejects(migrate(isolated,'020_documentos_private_storage.sql'),/Storage RLS must already be enabled/)
  await isolated.exec('ROLLBACK')
  assert.equal((await isolated.query('SELECT count(*)::int n FROM documentos WHERE arquivo_path IS NOT NULL')).rows[0].n,0)
  assert.equal((await isolated.query("SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass")).rows[0].relrowsecurity,false)
  assert.doesNotMatch(await load('../migrations/020_documentos_private_storage.sql'),/ALTER TABLE storage\.objects/i)
 } finally { await isolated.close() }
})


test('non-owner SQL privileges support Storage locks/bucket config but do not grant policy ownership in vanilla PostgreSQL',async () => {
 const isolated=new PGlite()
 try {
  await setup(isolated)
  await isolated.exec(`CREATE ROLE hosted_storage_owner NOLOGIN;
    CREATE ROLE migration_operator NOLOGIN;
    GRANT USAGE ON SCHEMA storage TO migration_operator;
    GRANT SELECT,UPDATE ON storage.objects,storage.buckets TO migration_operator;
    ALTER TABLE storage.objects OWNER TO hosted_storage_owner;
    ALTER TABLE storage.buckets OWNER TO hosted_storage_owner;
    BEGIN; SET LOCAL ROLE migration_operator;
    LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
    UPDATE storage.buckets SET public=false WHERE id='documentos';`)
  for (const sql of ['ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY',
    'CREATE POLICY synthetic_policy ON storage.objects USING (true)',
    'DROP POLICY documentos_storage_select ON storage.objects']) {
   await isolated.exec('SAVEPOINT ownership')
   await assert.rejects(isolated.exec(sql),e=>e.code==='42501')
   await isolated.exec('ROLLBACK TO SAVEPOINT ownership')
  }
  await isolated.exec('ROLLBACK')
 } finally { await isolated.close() }
})


for (const [scenario,change,label] of [
 ['count drift',"DELETE FROM documentos WHERE arquivo_url IS NULL",'Baseline: documentos'],
 ['invalid MIME',`UPDATE storage.objects SET metadata=jsonb_set(metadata,'{mimetype}','"application/x-unknown"')`,'Objetos: MIME ausente ou incompatível com a 020'],
 ['invalid size',`UPDATE storage.objects SET metadata=jsonb_set(metadata,'{size}','"malformed"')`,'Objetos: tamanho ausente, inválido ou acima de 10 MB'],
 ['RLS disabled','ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY','Storage: RLS ativo em storage.objects'],
 ['private bucket',"UPDATE storage.buckets SET public=false WHERE id='documentos'",'Bucket documentos: estado pré-cutover'],
 ['missing baseline policy','DROP POLICY documentos_storage_insert ON storage.objects','Storage: quatro policies legadas de documentos'],
 ['020 footprints',null,'020: funções já existentes'],
]) {
 test(`failed-020 final consolidated report blocks ${scenario} without changing state`,async () => {
  const isolated=new PGlite()
  try {
   await setup(isolated)
   for(let n=0;n<8;n++) await isolated.query(`INSERT INTO documentos (id,empresa_id,tipo_id,titulo)
    VALUES ($1,$2,(SELECT id FROM documento_tipos WHERE nome='PGR'),'No attachment')`,[id(950+n),id(101)])
   if(scenario==='020 footprints') await migrate(isolated,'020_documentos_private_storage.sql')
   else if(scenario==='count drift') await isolated.query('DELETE FROM documentos WHERE id=$1',[id(950)])
   else await isolated.exec(change)
   const snapshot=async()=>Promise.all([
    isolated.query('SELECT * FROM documentos ORDER BY id'),
    isolated.query('SELECT * FROM storage.objects ORDER BY id'),
    isolated.query('SELECT * FROM storage.buckets ORDER BY id'),
    isolated.query('SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname'),
    isolated.query("SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='documentos'::regclass ORDER BY tgname"),
    isolated.query("SELECT proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private' ORDER BY proname")
   ]).then(results=>results.map(r=>r.rows))
   const before=await snapshot()
   const sql=(await load('020_failed_attempt_preflight_readonly.sql')).replaceAll('https://kkjckayiqvlqpdjyoxyv.supabase.co',origin)
   assert.match(sql,/BEGIN TRANSACTION READ ONLY;/)
   const result=await isolated.exec(sql)
   const finalRows=result.filter(r=>r.rows?.length).at(-1).rows
   assert.equal(finalRows.find(r=>r.CHECK===label)?.STATUS,'BLOQUEIO')
   const checks=finalRows.slice(0,-2)
   assert.equal(Number(finalRows.at(-2).RESULTADO),checks.filter(r=>r.STATUS==='BLOQUEIO').length)
   assert.equal(Number(finalRows.at(-1).RESULTADO),checks.filter(r=>r.STATUS==='ATENÇÃO').length)
   assert.ok(finalRows.every(r=>['OK','ATENÇÃO','BLOQUEIO'].includes(r.STATUS)))
   assert.deepEqual(await snapshot(),before)
  } finally {await isolated.close()}
 })
}

test('final consolidated report separates read access from missing migration privileges',async () => {
 const isolated=new PGlite()
 try {
  await setup(isolated)
  // Synthetic read-only auditor: no hosted policy hook, ownership or write grants.
  await isolated.exec(`CREATE ROLE preflight_auditor NOLOGIN BYPASSRLS;
   GRANT pg_read_all_settings TO preflight_auditor;
   GRANT USAGE ON SCHEMA public,storage,auth,engmarq_private TO preflight_auditor;
   GRANT SELECT ON ALL TABLES IN SCHEMA public,storage TO preflight_auditor;
   GRANT EXECUTE ON FUNCTION engmarq_private.documento_legacy_path(text,uuid,text) TO preflight_auditor;
   SET ROLE preflight_auditor;`)
  const sql=(await load('020_failed_attempt_preflight_readonly.sql')).replaceAll('https://kkjckayiqvlqpdjyoxyv.supabase.co',origin)
  const result=await isolated.exec(sql)
  const rows=result.filter(r=>r.rows?.length).at(-1).rows
  assert.equal(rows.find(r=>r.CHECK==='Permissões: SELECT integral em storage.objects').STATUS,'OK')
  for (const label of [
   'Permissões: LOCK SHARE ROW EXCLUSIVE em storage.objects',
   'Permissões: UPDATE em storage.buckets',
   'Permissões: CREATE POLICY / DROP POLICY storage.objects',
   'Permissões: ALTER/DROP/CREATE TRIGGER public.documentos',
   'Permissões: schema engmarq_private',
  ]) assert.equal(rows.find(r=>r.CHECK===label)?.STATUS,'BLOQUEIO',label)
  assert.equal(Number(rows.at(-2).RESULTADO),rows.slice(0,-2).filter(r=>r.STATUS==='BLOQUEIO').length)
  await isolated.exec('RESET ROLE')
 } finally {await isolated.close()}
})
