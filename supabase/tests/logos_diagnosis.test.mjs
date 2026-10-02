import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,migrate,load,id,actor} from './remediation-fixture.mjs'

const names=['logos_storage_insert','logos_storage_select','logos_storage_update']
const policies=async db=>(await db.query("SELECT policyname,cmd,roles::text,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname")).rows
const checks=async db=>(await db.exec(await load('021_security_postflight_readonly.sql'))).filter(r=>r.rows?.length).at(-1).rows

test('021 preserves logos policies created by 013; it does not create or drop them',async()=>{
 const db=await fixture()
 try {
  const before=(await policies(db)).filter(r=>names.includes(r.policyname))
  assert.equal(before.length,3)
  await migrate(db,'021_documentos_empresas_security.sql')
  assert.deepEqual((await policies(db)).filter(r=>names.includes(r.policyname)),before)
  assert.doesNotMatch(await load('../migrations/021_documentos_empresas_security.sql'),/CREATE POLICY.*logos|DROP POLICY.*logos|ON storage\.objects/i)
 }finally{await db.close()}
})

test('absent logos is separate from 021 postflight and survives successful 021',async()=>{
 const db=await fixture()
 try {
  for(const name of names)await db.exec(`DROP POLICY ${name} ON storage.objects`)
  await migrate(db,'021_documentos_empresas_security.sql')
  const report=await checks(db)
  assert.equal(Number(report.at(-2).RESULTADO),0)
  assert.equal(Number(report.at(-1).RESULTADO),5)
  const blocks=report.slice(0,-2).filter(r=>r.STATUS==='BLOQUEIO')
  assert.deepEqual(blocks,[])
  assert.ok(report.every(r=>!names.some(n=>r.CHECK==='Policy: storage.objects.'+n)))
  await actor(db,3,async()=>assert.rejects(db.query('INSERT INTO storage.objects VALUES($1,$2,$3,NULL)',[id(9800),'logos',`${id(101)}/logo.png`]),e=>e.code==='42501'))
 }finally{await db.close()}
})

test('renamed legacy logos are reported as additional Storage policies, not 021 prerequisites',async()=>{
 const db=await fixture()
 try {
  for(const name of names)await db.exec(`ALTER POLICY ${name} ON storage.objects RENAME TO equivalent_${name}`)
  await migrate(db,'021_documentos_empresas_security.sql')
  assert.equal(Number((await checks(db)).at(-2).RESULTADO),0)
  await actor(db,3,async()=>{
   await db.query('INSERT INTO storage.objects VALUES($1,$2,$3,NULL)',[id(9800),'logos',`${id(101)}/logo.png`])
   assert.equal((await db.query("UPDATE storage.objects SET metadata='{}' WHERE bucket_id='logos' RETURNING id")).rows.length,1)
  })
 }finally{await db.close()}
})

test('013 update policy permits an operational actor in its tenant: blind replay is unsafe',async()=>{
 const db=await fixture()
 try {
  await migrate(db,'021_documentos_empresas_security.sql')
  await db.query('INSERT INTO storage.objects VALUES($1,$2,$3,NULL)',[id(9800),'logos',`${id(101)}/logo.png`])
  await actor(db,5,async()=>{
   assert.equal((await db.query("UPDATE storage.objects SET metadata='{}' WHERE bucket_id='logos' RETURNING id")).rows.length,1)
  })
 }finally{await db.close()}
})

test('separate logos diagnostic performs only read-only catalog/data inventory',async()=>{
 const db=await fixture()
 try {
  const before=await policies(db)
  const bucketBefore=(await db.query("SELECT * FROM storage.buckets WHERE id='logos'")).rows
  const sql=await load('logos_audit_readonly.sql')
  assert.match(sql,/REPEATABLE READ READ ONLY/)
  await db.exec(sql)
  assert.deepEqual(await policies(db),before)
  assert.deepEqual((await db.query("SELECT * FROM storage.buckets WHERE id='logos'")).rows,bucketBefore)
 }finally{await db.close()}
})
