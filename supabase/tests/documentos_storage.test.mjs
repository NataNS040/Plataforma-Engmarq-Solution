import { seedTenantBase } from './tenant-fixture.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const origin = 'https://synthetic.supabase.co'
const load = async name => (await readFile(new URL(name,import.meta.url),'utf8')).replace(/^\uFEFF/,'')
const migrate = async (db,name) => db.exec(await load(`../migrations/${name}`))
const preflight = async db => db.exec(await load('018_storage_preflight_readonly.sql'))
async function setup(db) {
  await seedTenantBase(db,name => migrate(db,name),id)
  await migrate(db,'017_catalogos_tenant_security.sql')
  await db.exec(`ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
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
  await db.exec(await load('019_documentos_cutover_preflight_readonly.sql'))
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
  await migrate(db,'018_treinamentos_tenant_security.sql')
  await assert.rejects(preflight(db),/018 footprint/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='storage' AND policyname LIKE 'certificados_%'")).rows[0].n,4)
})
for(const scenario of ['external_url','foreign_tenant','missing_object','unsupported_mime','missing_origin','oversize']) {
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
      if(scenario==='missing_origin')await isolated.exec("SELECT set_config('engmarq.storage_origin','',false)")
      const snapshot=(await isolated.query('SELECT * FROM documentos ORDER BY id')).rows
      const count=(await isolated.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n
      await assert.rejects(migrate(isolated,'020_documentos_private_storage.sql'))
      await isolated.exec('ROLLBACK')
      assert.equal((await isolated.query("SELECT public FROM storage.buckets WHERE id='documentos'")).rows[0].public,true)
      assert.deepEqual((await isolated.query('SELECT * FROM documentos ORDER BY id')).rows,snapshot)
      assert.equal((await isolated.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n,count)
      assert.equal((await isolated.query("SELECT to_regprocedure('engmarq_private.can_access_documento(text,boolean)') present")).rows[0].present,null)
    } finally { await isolated.close() }
  })
}
