import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {seedTenantBase} from './tenant-fixture.mjs'
import {migrate,load,id as syntheticId} from './fundacao-fixture.mjs'
import {target,oldCnpj,newCnpj,canonical,validateNewCnpj} from './024_cnpj_remediation_validate.mjs'
const id=n=>n===101?target:syntheticId(n)
const file='024_cnpj_remediation.sql'
// Full 001-023 history, exact target UUID, with owner-reported synthetic baseline.
// Setup writes are local fixtures only. No 024 applied.
async function fixture() {
 const db=new PGlite()
 await seedTenantBase(db,name=>migrate(db,name),id)
 for(const name of ['017_catalogos_tenant_security.sql','019_documentos_path_compat.sql','020_documentos_private_storage.sql','018_treinamentos_tenant_security.sql']) {
  if(name.startsWith('020'))await db.exec(`ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
   ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   GRANT USAGE ON SCHEMA storage TO authenticated,anon;
   GRANT ALL ON storage.objects TO authenticated,anon,service_role;`)
  await migrate(db,name)
 }
 await migrate(db,'021_documentos_empresas_security.sql')
 await db.exec(`DROP POLICY logos_storage_select ON storage.objects;
  DROP POLICY logos_storage_insert ON storage.objects;
  DROP POLICY logos_storage_update ON storage.objects;
  DELETE FROM storage.buckets WHERE id='logos';
  ALTER TABLE storage.objects ADD CONSTRAINT fixture_storage_unique UNIQUE(bucket_id,name);`)
 await migrate(db,'022_logos_tenant_storage.sql')
 await migrate(db,'023_exames_aso.sql')
 // Trim only synthetic fixture profiles, retaining one target profile and peers.
 await db.query('DELETE FROM user_profiles WHERE empresa_id=$1 AND id<>$2',[target,id(3)])
 await db.query('UPDATE empresas SET razao_social=$1,cnpj=$2 WHERE id=$3',['EngMarq Solucoes em Engenharia',oldCnpj,target])
 await db.query(`INSERT INTO documentos(id,empresa_id,tipo_id,titulo,colaborador_id,subtipo_exame)
  VALUES($1,$2,(SELECT id FROM documento_tipos WHERE nome='ASO'),'Synthetic ASO',$3,'admissional')`,[id(9001),target,id(201)])
 await db.query(`INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES($1,'documentos',$2,'{"mimetype":"application/pdf","size":9}')`,
  [id(9002),`${target}/private.pdf`])
 return db
}
async function snapshot(db){
 const tables=(await db.query(`SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','engmarq_private','auth','storage') AND c.relkind IN ('r','p') ORDER BY 1,2`)).rows
 return Object.fromEntries(await Promise.all(tables.map(async t=>[
  `${t.nspname}.${t.relname}`,(await db.query(`SELECT to_jsonb(r) AS row FROM "${t.nspname}"."${t.relname}" r ORDER BY to_jsonb(r)::text`)).rows.map(r=>r.row)
 ])))
}
const baselines=new WeakMap()
async function audit(db,post=false){
 let sql=await load(`024_cnpj_remediation_${post?'postflight':'preflight'}_readonly.sql`)
 if(post&&baselines.has(db))sql=sql.replace('SELECT NULL::jsonb /* BASELINE_PREFLIGHT */ AS hashes',
  `SELECT '${JSON.stringify(baselines.get(db)).replaceAll("'","''")}'::jsonb AS hashes`)
 const results=(await db.exec(sql)).filter(r=>r.fields?.length)
 assert.equal(results.length,1)
 assert.deepEqual(results[0].fields.map(f=>f.name),['ORDEM','CATEGORIA','CHECK','RESULTADO','STATUS','DETALHES'])
 assert.equal(results[0].rows.at(-1).CHECK,'RESULTADO_FINAL')
 if(!post)baselines.set(db,results[0].rows.find(r=>r.CHECK==='BASELINE_POSTFLIGHT').DETALHES)
 return results[0].rows
}
const failed=async(db,sql,pattern)=>{
 const before=await snapshot(db)
 await assert.rejects(db.exec(sql),pattern)
 await db.exec('ROLLBACK')
 assert.deepEqual(await snapshot(db),before)
}

test('local validation matches the actual 024 helpers without applying 024',async()=>{
 assert.deepEqual(await validateNewCnpj(),{cnpj:newCnpj,canonical,valid:true})
 const db=new PGlite()
 try {
  // Extract ONLY the two pure helpers into a disposable test schema.
  const sql=await readFile(new URL('../migrations/024_fundacao_comercial.sql',import.meta.url),'utf8')
  const pure=sql.slice(sql.indexOf('CREATE FUNCTION engmarq_private.cnpj_canonico'),sql.indexOf('REVOKE ALL ON FUNCTION engmarq_private.cnpj_canonico'))
  await db.exec('CREATE SCHEMA engmarq_private;'+pure)
  const row=(await db.query('SELECT engmarq_private.cnpj_canonico($1) canonical,engmarq_private.cnpj_valido($1) valid',[newCnpj])).rows[0]
  assert.deepEqual(row,{canonical,valid:true})
  assert.equal((await db.query('SELECT engmarq_private.cnpj_valido($1) valid',[oldCnpj])).rows[0].valid,false)
 }finally{await db.close()}
})

test('static scope: exactly one UPDATE of cnpj, anchored ID/old/new; no inserts/deletes/DDL/Auth/Storage mutation',async()=>{
 const sql=await load(file)
 const code=sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''")
 assert.equal((code.match(/\bUPDATE\b/gi)||[]).length,1)
 assert.match(sql,new RegExp(`UPDATE public\\.empresas SET cnpj='${newCnpj.replaceAll('.','\\.')}'\\s+WHERE id='${target}' AND cnpj='${oldCnpj.replaceAll('.','\\.')}'`))
 assert.doesNotMatch(code,/\b(INSERT|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL)\b/i)
 assert.match(sql,/GET DIAGNOSTICS affected = ROW_COUNT/)
 assert.match(sql,/IF affected<>1 THEN/)
 assert.ok(sql.includes(canonical));assert.ok(sql.includes(oldCnpj));assert.ok(sql.includes(newCnpj))
 for(const stage of ['preflight','postflight']) {
  const readonly=await load(`024_cnpj_remediation_${stage}_readonly.sql`)
  assert.match(readonly,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/)
  assert.doesNotMatch(readonly.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''"),/\b(UPDATE|INSERT|DELETE|DO|CREATE|ALTER|DROP|SET|LOCK|CALL)\b/i)
 }
})

test('success: one exact target correction, pre/post single result, all other rows byte-equivalent',async()=>{
 const db=await fixture()
 try {
  const before=await snapshot(db),pre=await audit(db)
  assert.equal(pre.at(-1).RESULTADO,'APROVADO_PARA_REMEDIACAO')
  assert.deepEqual(pre.filter(r=>r.STATUS==='BLOQUEIO'),[])
  await db.exec(await load(file))
  const after=await snapshot(db)
  const expected=structuredClone(before)
  expected['public.empresas'].find(e=>e.id===target).cnpj=newCnpj
  // Row ordering might shift when a field changes; compare in stable id order.
  for(const rows of [expected['public.empresas'],after['public.empresas']])rows.sort((a,b)=>a.id.localeCompare(b.id))
  assert.deepEqual(after,expected)
  const post=await audit(db,true)
  assert.equal(post.at(-1).RESULTADO,'REMEDIACAO_OK')
  assert.deepEqual(post.filter(r=>r.STATUS==='BLOQUEIO'),[])
  const fingerprints=rows=>rows.filter(r=>r.CATEGORIA==='PRESERVACAO'&&!['BASELINE_POSTFLIGHT','FINGERPRINTS_PRESERVADOS'].includes(r.CHECK)).map(({ORDEM,...r})=>r)
  assert.deepEqual(fingerprints(post),fingerprints(pre))
  await failed(db,await load(file),/Target ID, old CNPJ/)
 }finally{await db.close()}
})

for(const scenario of ['old mismatch','new invalid','canonical mismatch','collision masked','collision compact','counts mismatch','missing target','privilege'])
 test(`rollback and rejection: ${scenario}`,async()=>{
  const db=await fixture()
  try {
   let sql=await load(file)
   if(scenario==='old mismatch')await db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',['unexpected',target])
   if(scenario==='new invalid')sql=sql.replaceAll(newCnpj,'60.545.359/0001-77')
   if(scenario==='canonical mismatch')sql=sql.replaceAll(canonical,'60545359000177')
   if(scenario.startsWith('collision'))await db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',
    [scenario.endsWith('compact')?canonical:newCnpj,id(102)])
   if(scenario==='counts mismatch')await db.query('UPDATE colaboradores SET active=false WHERE empresa_id=$1',[target])
   if(scenario==='missing target')sql=sql.replaceAll(target,id(99999))
   if(scenario==='privilege') {
    const before=await snapshot(db)
    await db.exec('SET ROLE authenticated')
    await assert.rejects(db.exec(sql),/Privileged auditor/)
    await db.exec('ROLLBACK; RESET ROLE')
    assert.deepEqual(await snapshot(db),before)
    return
   }
   await failed(db,sql,/Target ID|New CNPJ invalid|Canonical CNPJ collision|Operational baseline|Privileged auditor/)
   if(scenario.startsWith('collision'))assert.equal((await audit(db)).at(-1).RESULTADO,'REPROVADO')
  }finally{await db.close()}
 })

test('rollback when a trigger suppresses the sole UPDATE (zero affected rows)',async()=>{
 const db=await fixture()
 try {
  await db.exec(`CREATE FUNCTION public.suppress_cnpj() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
   CREATE TRIGGER suppress_cnpj BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE FUNCTION suppress_cnpj();`)
  await failed(db,await load(file),/Expected exactly one affected row, got 0/)
 }finally{await db.close()}
})

test('rollback any trigger side effect on company or Storage',async()=>{
 for(const storage of [false,true]) {
  const db=await fixture()
  try {
   await db.exec(`CREATE FUNCTION public.side_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    ${storage?"UPDATE storage.objects SET metadata='{}';":"NEW.razao_social:='unexpected';"}
    RETURN NEW; END $$;
    CREATE TRIGGER side_effect BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE FUNCTION side_effect();`)
   await failed(db,await load(file),/Company preservation|Non-CNPJ data changed/)
  }finally{await db.close()}
 }
})

test('postflight rejects operational removal and FK corruption despite correct new CNPJ',async()=>{
 const db=await fixture()
 try {
  await db.exec(await load(file))
  // Capture the known before baseline, including Auth and Storage, before removal.
  // CNPJ is intentionally excluded, so the successful correction has the same baseline.
  await audit(db)
  await db.exec(`DELETE FROM storage.objects`)
  assert.equal((await audit(db,true)).at(-1).RESULTADO,'REMEDIACAO_REPROVADA')
  await db.exec(`SET session_replication_role=replica; UPDATE user_profiles SET id='00000000-0000-4000-8000-999999999999' WHERE empresa_id='${target}'; SET session_replication_role=origin;`)
  const rows=await audit(db,true)
  assert.ok(rows.some(r=>r.CATEGORIA==='INTEGRIDADE_FK'&&r.STATUS==='BLOQUEIO'))
 }finally{await db.close()}
})

test('postflight requires preflight fingerprint baseline and detects same-count operational mutation',async()=>{
 const db=await fixture()
 try {
  await audit(db)
  await db.exec(await load(file))
  const withoutBaseline=(await db.exec(await load('024_cnpj_remediation_postflight_readonly.sql'))).filter(r=>r.fields?.length)[0].rows
  assert.equal(withoutBaseline.at(-1).RESULTADO,'REMEDIACAO_REPROVADA')
  assert.equal((await audit(db,true)).at(-1).RESULTADO,'REMEDIACAO_OK')
  await db.query('UPDATE documentos SET titulo=$1 WHERE empresa_id=$2',['changed synthetic title',target])
  const rows=await audit(db,true)
  assert.equal(rows.at(-1).RESULTADO,'REMEDIACAO_REPROVADA')
  assert.ok(rows.some(r=>r.CHECK==='FINGERPRINTS_PRESERVADOS'&&r.STATUS==='BLOQUEIO'))
 }finally{await db.close()}
})
