import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import {logosFixture} from './logos-fixture.mjs'
import {id,actor,migrate,load,dataSnapshot} from './remediation-fixture.mjs'
let db
const a=`${id(101)}/logo.png`,b=`${id(102)}/logo.png`
const meta={mimetype:'image/png',size:99}
before(async()=>{
 db=await logosFixture()
 await db.query("INSERT INTO storage.objects VALUES($1,'logos',$2,$3),($4,'logos',$5,$3)",[id(9901),a,meta,id(9902),b])
 await db.query('INSERT INTO auth.users VALUES($1)',[id(11)])
 await db.query("INSERT INTO public.user_profiles(id,email,full_name,role,empresa_id,active) VALUES($1,'b@example.com','B','gestor',$2,true)",[id(11),id(102)])
})
after(()=>db.close())
const insert=(database,path,metadata=meta)=>database.query("INSERT INTO storage.objects VALUES($1,'logos',$2,$3)",[id(9903),path,metadata])
async function denied(run){await db.exec('SAVEPOINT denial');try{await assert.rejects(run,e=>e.code==='42501')}finally{await db.exec('ROLLBACK TO SAVEPOINT denial')}}
for(const n of [3,4]) {
 test(`empresa/gestor ${n}: own read, insert and actual ON CONFLICT upsert`,()=>actor(db,n,async()=>{
  assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='logos'")).rows.length,1)
  await insert(db,`${id(101)}/logo.webp`,{mimetype:'image/webp',size:88})
  assert.equal((await db.query(`INSERT INTO storage.objects VALUES($1,'logos',$2,$3)
    ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=excluded.metadata RETURNING id`,[id(9991),a,{...meta,size:100}])).rows.length,1)
  assert.equal((await db.query('UPDATE public.empresas SET logo_url=$1 WHERE id=$2 RETURNING id',[`logos/${a}`,id(101)])).rows.length,1)
  assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='logos' RETURNING id")).rows.length,0)
 }))
 test(`empresa/gestor ${n}: foreign insert/update/upsert denied`,()=>actor(db,n,async()=>{
  await denied(()=>insert(db,b))
  assert.equal((await db.query("UPDATE storage.objects SET metadata=$1 WHERE name=$2 RETURNING id",[meta,b])).rows.length,0)
  await denied(()=>db.query(`INSERT INTO storage.objects VALUES($1,'logos',$2,$3)
    ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=excluded.metadata`,[id(9992),b,meta]))
 }))
}
for(const [n,role] of [[1,'authenticated'],[2,'authenticated'],[5,'authenticated'],[7,'authenticated'],[9,'authenticated'],[3,'anon']]) {
 test(`no writes: actor ${n} / ${role} (admin, operational, inactive, suspended, anon)`,()=>actor(db,n,async()=>{
  await denied(()=>insert(db,`${id(101)}/logo.jpg`,{mimetype:'image/jpeg'}))
  assert.equal((await db.query("UPDATE storage.objects SET metadata=$1 WHERE bucket_id='logos' RETURNING id",[meta])).rows.length,0)
  assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='logos' RETURNING id")).rows.length,0)
  const read=(await db.query("SELECT * FROM storage.objects WHERE bucket_id='logos'")).rows.length
  assert.equal(read,n===5 && role==='authenticated'?1:0)
 },role))
}
test('missing profile and missing auth UID fail closed',async()=>{
 for(const n of [999,0]) await actor(db,n,async()=>{
  if(n===0)await db.query("SELECT set_config('request.jwt.claim.sub','',true)")
  await denied(()=>insert(db,`${id(101)}/logo.jpg`))
 })
})
test('suspended company denies its own path; tenant B manages only B',async()=>{
 await actor(db,9,()=>denied(()=>insert(db,`${id(103)}/logo.png`)))
 await actor(db,11,async()=>{
  assert.deepEqual((await db.query("SELECT name FROM storage.objects WHERE bucket_id='logos'")).rows,[{name:b}])
  await insert(db,`${id(102)}/logo.jpg`,{mimetype:'image/jpeg',size:99})
  assert.equal((await db.query('UPDATE storage.objects SET metadata=$1 WHERE name=$2 RETURNING id',[meta,b])).rows.length,1)
  await denied(()=>insert(db,`${id(101)}/logo.webp`))
 })
})
for(const path of ['bad/logo.png',`${id(102)}/logo.webp`,`${id(101)}/other.png`,`${id(101)}/nested/logo.png`,`${id(101)}/../${id(102)}/logo.png`,`${id(101)}/logo.svg`,`${id(101)}/logo.PNG`,`${id(101)}/logo.png/`,`${id(101)}/logo.jpeg`]) {
 test(`invalid/foreign path: ${path}`,()=>actor(db,3,()=>denied(()=>insert(db,path))))
}
for(const metadata of [{mimetype:'image/svg+xml'},{mimetype:'application/pdf'},{mimetype:'image/jpeg'},{mimetype:'image/png',size:2097153},{mimetype:'image/png',size:'NaN'}]) {
 test(`bad MIME/size ${JSON.stringify(metadata)}`,()=>actor(db,3,()=>denied(()=>insert(db,`${id(101)}/logo.png`,metadata))))
}
test('UPDATE cannot change tenant, path, bucket or object id',()=>actor(db,3,async()=>{
 for(const [field,value] of [['name',b],['name',`${id(101)}/logo.jpg`],['bucket_id','documentos'],['id',id(9977)]])
  await denied(()=>db.query(`UPDATE storage.objects SET ${field}=$1 WHERE id=$2`,[value,id(9901)]))
}))
test('broad PUBLIC policy cannot bypass any logo guard or move other buckets into logos',async()=>{
 await db.exec('CREATE POLICY broad_legacy ON storage.objects FOR ALL TO PUBLIC USING(true) WITH CHECK(true)')
 try {
  for(const [n,role] of [[1,'authenticated'],[5,'authenticated'],[7,'authenticated'],[3,'anon']])
   await actor(db,n,async()=>{
    await denied(()=>insert(db,`${id(101)}/logo.jpg`))
    assert.equal((await db.query("UPDATE storage.objects SET metadata=$1 WHERE bucket_id='logos' RETURNING id",[meta])).rows.length,0)
    assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='logos' RETURNING id")).rows.length,0)
   },role)
  await actor(db,3,async()=>{
   await denied(()=>db.query("UPDATE storage.objects SET bucket_id='logos',name=$1 WHERE id=$2",[`${id(101)}/logo.webp`,id(801)]))
   await denied(()=>db.query("UPDATE storage.objects SET bucket_id='unknown' WHERE id=$1",[id(9901)]))
  })
 }finally{await db.exec('DROP POLICY broad_legacy ON storage.objects')}
})
test('read-only auditors, exact contract, idempotence with existing objects/references',async()=>{
 const before=await dataSnapshot(db)
 await migrate(db,'022_logos_tenant_storage.sql')
 assert.deepEqual(await dataSnapshot(db),before)
 const results=await db.exec(await load('022_logos_postflight_readonly.sql'))
 const report=results.find(r=>r.rows?.some(x=>x.CHECK==='TOTAL_BLOQUEIOS')).rows
 assert.equal(report.find(r=>r.CHECK==='TOTAL_BLOQUEIOS').RESULTADO,'0',JSON.stringify(report))
 assert.deepEqual(await dataSnapshot(db),before)
 const isolated=await logosFixture({apply:false})
 try{
  const pre=await isolated.exec(await load('022_logos_preflight_readonly.sql'))
  assert.equal(pre.find(r=>r.rows?.length).rows.find(x=>x.CHECK==='TOTAL_BLOQUEIOS').RESULTADO,'0')
 }finally{await isolated.close()}
})
for(const drift of ["UPDATE storage.buckets SET public=true WHERE id='logos'",
 'ALTER POLICY logos_storage_insert ON storage.objects WITH CHECK(true)',
 'GRANT EXECUTE ON FUNCTION engmarq_private.can_access_logo(text,text,jsonb) TO PUBLIC']) {
 test(`rerun aborts on drift: ${drift}`,async()=>{
  const isolated=await logosFixture()
  try{
   await isolated.exec(drift)
   const before=await dataSnapshot(isolated)
   await assert.rejects(migrate(isolated,'022_logos_tenant_storage.sql'),/drift/)
   await isolated.exec('ROLLBACK')
   assert.deepEqual(await dataSnapshot(isolated),before)
   const post=await isolated.exec(await load('022_logos_postflight_readonly.sql'))
   assert.notEqual(post.find(r=>r.rows?.length).rows.find(x=>x.CHECK==='TOTAL_BLOQUEIOS').RESULTADO,'0')
  }finally{await isolated.close()}
 })
}
test('first apply aborts on changed inventory and rolls back',async()=>{
 const isolated=await logosFixture({apply:false})
 try {
  await isolated.query("UPDATE public.empresas SET logo_url='unexpected' WHERE id=$1",[id(101)])
  await assert.rejects(migrate(isolated,'022_logos_tenant_storage.sql'),/inventory changed/)
  await isolated.exec('ROLLBACK')
  assert.equal((await isolated.query("SELECT id FROM storage.buckets WHERE id='logos'")).rows.length,0)
 }finally{await isolated.close()}
})
test('other buckets/rows/policies and Storage ACLs preserved',async()=>{
 const isolated=await logosFixture({apply:false})
 try {
  const before=await dataSnapshot(isolated)
  const policies=(await isolated.query("SELECT * FROM pg_policies WHERE schemaname='storage' ORDER BY policyname")).rows
  const acl=(await isolated.query("SELECT relacl::text FROM pg_class WHERE oid='storage.objects'::regclass")).rows
  await migrate(isolated,'022_logos_tenant_storage.sql')
  const after=await dataSnapshot(isolated)
  assert.deepEqual(after.slice(0,-1),before.slice(0,-1))
  assert.deepEqual((await isolated.query("SELECT * FROM pg_policies WHERE schemaname='storage' AND policyname NOT LIKE 'logos_%' ORDER BY policyname")).rows,policies)
  assert.deepEqual((await isolated.query("SELECT relacl::text FROM pg_class WHERE oid='storage.objects'::regclass")).rows,acl)
  await actor(isolated,3,async()=>assert.equal((await isolated.query("UPDATE storage.objects SET metadata=metadata WHERE id=$1 RETURNING id",[id(801)])).rows.length,1))
 }finally{await isolated.close()}
})
