import assert from 'node:assert/strict'
import { before,after,test } from 'node:test'
import { fixture,id,migrate,actor,dataSnapshot,load } from './remediation-fixture.mjs'
let db,original
before(async()=>{
 db=await fixture()
 // Model old table AND column grants and a leaked view before remediation.
 await db.exec('GRANT SELECT ON vw_dashboard_documentos TO anon; GRANT SELECT(titulo) ON vw_dashboard_documentos TO anon; GRANT UPDATE(titulo) ON vw_dashboard_documentos TO authenticated; GRANT UPDATE(status), UPDATE(id) ON empresas TO anon,authenticated')
 original=await dataSnapshot(db)
 const pre=await readOnlyChecks(db,'021_security_preflight_readonly.sql')
 assert.equal(Number(pre.at(-2).RESULTADO),0,JSON.stringify(pre.filter(r=>r.STATUS==='BLOQUEIO')))
 await migrate(db,'021_documentos_empresas_security.sql')
})
after(()=>db.close())
async function fullSnapshot(database) {
 return [await dataSnapshot(database),
  (await database.query('SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname')).rows,
  (await database.query("SELECT tgrelid,tgname,tgtype,tgenabled,tgfoid FROM pg_trigger ORDER BY tgrelid,tgname")).rows,
  (await database.query("SELECT p.oid,pg_get_functiondef(p.oid) definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private' OR (n.nspname='public' AND p.proname IN ('get_user_role','get_user_empresa_id')) ORDER BY p.oid")).rows,
  (await database.query("SELECT k.conrelid,k.conname,k.convalidated,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','storage') ORDER BY k.conrelid,k.conname")).rows,
  (await database.query("SELECT c.oid,c.reloptions,c.relacl::text,c.relrowsecurity,a.attnum,a.attacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','v') ORDER BY c.oid,a.attnum")).rows]
}
async function readOnlyChecks(database,name) {
 const before=await fullSnapshot(database)
 const sql=await load(name)
 assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/)
 const results=await database.exec(sql)
 const checks=results.filter(r=>r.rows?.length).at(-1).rows
 assert.deepEqual(Object.keys(checks[0]),['CHECK','RESULTADO','STATUS'])
 assert.ok(checks.every(r=>['OK','ATENÇÃO','BLOQUEIO'].includes(r.STATUS)))
 assert.deepEqual(checks.slice(-2).map(r=>r.CHECK),['TOTAL_BLOQUEIOS','TOTAL_ATENCOES'])
 assert.equal(Number(checks.at(-2).RESULTADO),checks.slice(0,-2).filter(r=>r.STATUS==='BLOQUEIO').length)
 assert.equal(Number(checks.at(-1).RESULTADO),checks.slice(0,-2).filter(r=>r.STATUS==='ATENÇÃO').length)
 assert.deepEqual(await fullSnapshot(database),before)
 return checks
}
test('021 postflight confirms expected catalog and grants without writes',async()=>{
 const checks=await readOnlyChecks(db,'021_security_postflight_readonly.sql')
 assert.equal(Number(checks.at(-2).RESULTADO),0,JSON.stringify(checks.filter(r=>r.STATUS==='BLOQUEIO')))
})
test('021 preserves every row and object; reexecution changes no business data',async()=>{
 assert.deepEqual(await dataSnapshot(db),original)
 await migrate(db,'021_documentos_empresas_security.sql')
 assert.deepEqual(await dataSnapshot(db),original)
})
for(const [n,count] of [[1,0],[2,0],[3,11],[4,11],[5,11],[7,0],[8,1],[9,0],[10,0]]) {
 test(`B01/B02 document table and invoker view actor ${n}`,()=>actor(db,n,async()=>{
  assert.equal((await db.query('SELECT * FROM documentos')).rows.length,count)
  assert.equal((await db.query('SELECT * FROM vw_dashboard_documentos')).rows.length,count)
  assert.equal((await db.query('SELECT * FROM vw_dashboard_documentos WHERE empresa_id<>public.get_user_empresa_id()')).rows.length,0)
 }))
}
test('B01/B02 anon denied at table and view despite former column grants',()=>actor(db,3,async()=>{
 for(const t of ['documentos','vw_dashboard_documentos']) {
  await db.exec('SAVEPOINT denied')
  await assert.rejects(db.query(`SELECT * FROM ${t}`),e=>e.code==='42501')
  await db.exec('ROLLBACK TO SAVEPOINT denied')
 }
},'anon'))
for(const n of [1,5,7,8,9]) {
 test(`B01 actor ${n} cannot write or delete A metadata`,()=>actor(db,n,async()=>{
  assert.equal((await db.query("UPDATE documentos SET titulo='forged' WHERE empresa_id=$1 RETURNING id",[id(101)])).rows.length,0)
  assert.equal((await db.query('DELETE FROM documentos WHERE empresa_id=$1 RETURNING id',[id(101)])).rows.length,0)
  await assert.rejects(db.query(`INSERT INTO documentos(empresa_id,tipo_id,titulo)
   VALUES($1,(SELECT id FROM documento_tipos WHERE nome='PGR'),'forged')`,[id(101)]),e=>e.code==='42501')
 }))
}
for(const n of [3,4]) {
 test(`B01 own company metadata CRUD actor ${n}; cross-tenant denied`,()=>actor(db,n,async()=>{
  assert.equal((await db.query("UPDATE documentos SET titulo='own' WHERE id=$1 RETURNING id",[id(901)])).rows.length,1)
  assert.equal((await db.query("UPDATE documentos SET titulo='foreign' WHERE id=$1 RETURNING id",[id(904)])).rows.length,0)
  assert.equal((await db.query('DELETE FROM documentos WHERE id=$1 RETURNING id',[id(912)])).rows.length,1)
  await db.query(`INSERT INTO documentos(empresa_id,tipo_id,titulo) VALUES($1,(SELECT id FROM documento_tipos WHERE nome='PGR'),'own')`,[id(101)])
 }))
 test(`B05 tenant actor ${n} cannot suspend or change status but may edit registration`,()=>actor(db,n,async()=>{
  await assert.rejects(db.query("UPDATE empresas SET status='suspensa',cidade='forged' WHERE id=$1",[id(101)]),e=>e.code==='42501')
 }))
 test(`B05 legitimate registration actor ${n} preserved`,()=>actor(db,n,async()=>{
  assert.equal((await db.query("UPDATE empresas SET cidade='new' WHERE id=$1 RETURNING id",[id(101)])).rows.length,1)
  assert.equal((await db.query("UPDATE empresas SET cidade='foreign' WHERE id=$1 RETURNING id",[id(102)])).rows.length,0)
 }))
}
test('B05 suspended manager cannot reactivate and regain operational access',()=>actor(db,9,async()=>{
 assert.equal((await db.query("UPDATE empresas SET status='ativa' WHERE id=$1 RETURNING id",[id(103)])).rows.length,0)
 assert.equal((await db.query('SELECT * FROM colaboradores')).rows.length,0)
 assert.equal((await db.query('SELECT * FROM documentos')).rows.length,0)
}))
test('B05 admin retains commercial status management without operational access',()=>actor(db,1,async()=>{
 assert.equal((await db.query("UPDATE empresas SET status='ativa' WHERE id=$1 RETURNING id",[id(103)])).rows.length,1)
 assert.equal((await db.query('SELECT * FROM documentos')).rows.length,0)
 assert.equal((await db.query('SELECT * FROM colaboradores')).rows.length,0)
 assert.equal((await db.query('SELECT * FROM treinamentos')).rows.length,0)
}))
test('B05 operational company writes remain denied',()=>actor(db,5,async()=>{
 assert.equal((await db.query("UPDATE empresas SET cidade='forged' RETURNING id")).rows.length,0)
}))
test('AT06 cross-tenant collaborator FK rejects own document with foreign individual',()=>actor(db,3,async()=>{
 await assert.rejects(db.query('UPDATE documentos SET colaborador_id=$1 WHERE id=$2',[id(202),id(901)]),e=>e.code==='23503')
}))
test('021 fail closed on unexpected permissive policies with integral rollback',async()=>{
 await db.exec('CREATE POLICY unexpected_policy ON documentos USING(true)')
 const before=await dataSnapshot(db)
 await assert.rejects(migrate(db,'021_documentos_empresas_security.sql'),/Unexpected policies/)
 await db.exec('ROLLBACK')
 assert.deepEqual(await dataSnapshot(db),before)
 await db.exec('DROP POLICY unexpected_policy ON documentos')
})
test('021 aborts when a prerequisite operational table has RLS disabled',async()=>{
 await db.exec('ALTER TABLE colaboradores DISABLE ROW LEVEL SECURITY')
 const before=await fullSnapshot(db)
 try {
  const checks=await readOnlyChecks(db,'021_security_preflight_readonly.sql')
  assert.equal(checks.find(r=>r.CHECK==='RLS: public.colaboradores').STATUS,'BLOQUEIO')
  await assert.rejects(migrate(db,'021_documentos_empresas_security.sql'),/021 requires/)
  await db.exec('ROLLBACK')
  assert.deepEqual(await fullSnapshot(db),before)
 }finally{await db.exec('ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY')}
})
test('021 does not repair/delete cross-tenant legacy references; FK failure rolls everything back',async()=>{
 const isolated=await fixture()
 try {
  await isolated.query('UPDATE documentos SET colaborador_id=$1 WHERE id=$2',[id(202),id(901)])
  const before=await fullSnapshot(isolated)
  const checks=await readOnlyChecks(isolated,'021_security_preflight_readonly.sql')
  assert.equal(checks.find(r=>r.CHECK==='Documentos vinculados a colaborador estrangeiro').STATUS,'BLOQUEIO')
  await assert.rejects(migrate(isolated,'021_documentos_empresas_security.sql'),e=>e.code==='23503')
  await isolated.exec('ROLLBACK')
  assert.deepEqual(await fullSnapshot(isolated),before)
 }finally{await isolated.close()}
})
test('021 preflight identifies missing migration ownership under a SELECT-only auditor',async()=>{
 const isolated=await fixture()
 try {
  await isolated.exec(`CREATE ROLE remediation_auditor NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public,storage,engmarq_private TO remediation_auditor;
    GRANT SELECT ON ALL TABLES IN SCHEMA public,storage TO remediation_auditor;
    SET ROLE remediation_auditor;`)
  const checks=await readOnlyChecks(isolated,'021_security_preflight_readonly.sql')
  assert.equal(checks.find(r=>r.CHECK==='Auditor: SELECT integral').STATUS,'OK')
  assert.ok(checks.filter(r=>r.CHECK==='021: permissões de ownership em tabelas/view').every(r=>r.STATUS==='BLOQUEIO'))
  assert.equal(checks.find(r=>r.CHECK==='021: CREATE no schema privado').STATUS,'BLOQUEIO')
  assert.equal(checks.some(r=>r.CHECK==='Storage: CREATE/DROP POLICY autorizado'),false)
  await isolated.exec('RESET ROLE')
 }finally{await isolated.close()}
})
test('certificate evidence remains immutable under the preserved 018/020 guards',()=>actor(db,3,async()=>{
 await db.query("INSERT INTO storage.objects VALUES($1,'documentos',$2,NULL)",[id(9999),`${id(101)}/certificados/keep.pdf`])
 assert.equal((await db.query("UPDATE storage.objects SET name=name WHERE name LIKE '%/certificados/%' RETURNING id")).rows.length,0)
 assert.equal((await db.query("DELETE FROM storage.objects WHERE name LIKE '%/certificados/%' RETURNING id")).rows.length,0)
}))
test('restrictive row policy and write guards withstand future permissive drift',async()=>{
 await db.exec('CREATE POLICY unexpected_policy ON documentos FOR ALL USING(true) WITH CHECK(true); CREATE POLICY unexpected_policy ON empresas FOR ALL USING(true) WITH CHECK(true)')
 try {
  await actor(db,1,async()=>assert.equal((await db.query('SELECT * FROM documentos')).rows.length,0))
  await actor(db,9,async()=>assert.rejects(db.query("UPDATE empresas SET status='ativa' RETURNING id"),e=>e.code==='42501'))
  await actor(db,5,async()=>assert.rejects(db.query("UPDATE documentos SET titulo='forged'"),e=>e.code==='42501'))
  await actor(db,5,async()=>assert.rejects(db.query('DELETE FROM documentos'),e=>e.code==='42501'))
 } finally {await db.exec('DROP POLICY unexpected_policy ON documentos; DROP POLICY unexpected_policy ON empresas')}
})
for(const [name,mutation,restore,label] of [
 ['admin policy drift','DROP POLICY documentos_select ON documentos; CREATE POLICY documentos_select ON documentos USING(true)',
  null,'Policy: public.documentos.documentos_select'],
 ['view bypass','ALTER VIEW vw_dashboard_documentos SET(security_invoker=false)',null,'View documentos: invoker e grants'],
 ['disabled company guard','ALTER TABLE empresas DISABLE TRIGGER guard_empresa_write',
  'ALTER TABLE empresas ENABLE TRIGGER guard_empresa_write','Trigger: empresas.guard_empresa_write'],
 ['company status column leak','GRANT UPDATE(id) ON empresas TO authenticated',null,'ACL: empresas / authenticated'],
 ['mime drift',`UPDATE storage.objects SET metadata=jsonb_set(metadata,'{mimetype}','"invalid/type"')`,
  `UPDATE storage.objects SET metadata=jsonb_set(metadata,'{mimetype}','"application/pdf"')`,'MIME incompatível'],
 ['count drift',`UPDATE documentos SET arquivo_path=NULL WHERE id='${id(901)}'`,
  `UPDATE documentos SET arquivo_path='${id(101)}/synthetic1.pdf' WHERE id='${id(901)}'`,'Canonical references preservadas'],
 ['guard body drift',`CREATE OR REPLACE FUNCTION engmarq_private.guard_empresa_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN NEW; END $$`,
  null,'Função: engmarq_private.guard_empresa_write()'],
 ['semantic whitespace in policy',"ALTER POLICY documentos_select ON documentos USING(get_user_role()::text='emp resa')",
  null,'Policy: public.documentos.documentos_select'],
 ['semantic whitespace in guard',`DO $$ DECLARE definition text; BEGIN
   SELECT pg_get_functiondef('engmarq_private.guard_empresa_write()'::regprocedure) INTO definition;
   EXECUTE replace(definition,'''authenticated''','''auth enticated'''); END $$;`,
  null,'Função: engmarq_private.guard_empresa_write()'],
])test(`postflight blocks ${name} and remains read-only`,async()=>{
 await db.exec(mutation)
 try {
  const checks=await readOnlyChecks(db,'021_security_postflight_readonly.sql')
  assert.equal(checks.find(r=>r.CHECK===label)?.STATUS,'BLOQUEIO')
 } finally {
  if(restore)await db.exec(restore)
  else await migrate(db,'021_documentos_empresas_security.sql')
 }
})



test('real remote scope: absent EPI/signatures does not hide Documentos or block 021',async()=>{
 const isolated=await fixture()
 try {
  for(const phase of ['preflight','postflight']) {
   if(phase==='postflight')await migrate(isolated,'021_documentos_empresas_security.sql')
   const checks=await readOnlyChecks(isolated,`021_security_${phase}_readonly.sql`)
   assert.equal(Number(checks.at(-2).RESULTADO),0)
   assert.equal(checks.find(r=>r.CHECK==='Auditor: SELECT integral').STATUS,'OK')
   assert.equal(checks.find(r=>r.CHECK==='Documentos preservados').RESULTADO,'12 / esperado 12')
   assert.equal(checks.find(r=>r.CHECK==='Objetos preservados').RESULTADO,'4 / esperado 4')
   assert.equal(checks.find(r=>r.CHECK==='Escopo: EPI/assinaturas').STATUS,'ATENÇÃO')
   assert.ok(!checks.some(r=>r.CHECK.includes('fichas_epi') || r.CHECK.includes('assinaturas_storage')))
   assert.equal((await isolated.query("SELECT to_regclass('public.fichas_epi') relation")).rows[0].relation,null)
  }
  await isolated.exec(`UPDATE storage.objects SET metadata=jsonb_set(metadata,'{mimetype}','"bad/type"')`)
  const bad=await readOnlyChecks(isolated,'021_security_postflight_readonly.sql')
  assert.equal(bad.find(r=>r.CHECK.includes('MIME incompat')).STATUS,'BLOQUEIO')
 } finally {await isolated.close()}
})

test('known Users 014 is PRE_CORRECAO; 021 installs the exact safe 015 definitions',async()=>{
 const isolated=await fixture()
 try {
  await migrate(isolated,'014_fix_user_profiles_permissions.sql')
  const pre=await readOnlyChecks(isolated,'021_security_preflight_readonly.sql')
  const userChecks=pre.filter(r=>!r.CHECK.includes('ownership') && (r.CHECK.endsWith('can_manage_profile(uuid,user_role)') || r.CHECK.endsWith('guard_profile_update()')))
  assert.equal(userChecks.length,2)
  assert.ok(userChecks.every(r=>r.STATUS==='ATENÇÃO' && r.RESULTADO.startsWith('PRE_CORRECAO')))
  assert.equal(Number(pre.at(-2).RESULTADO),0)
  await migrate(isolated,'021_documentos_empresas_security.sql')
  const post=await readOnlyChecks(isolated,'021_security_postflight_readonly.sql')
  assert.equal(Number(post.at(-2).RESULTADO),0)
  assert.ok(post.filter(r=>r.CHECK.endsWith('can_manage_profile(uuid,user_role)') || r.CHECK.endsWith('guard_profile_update()')).every(r=>r.STATUS==='OK'))
  await actor(isolated,1,async()=>{
   assert.equal((await isolated.query('SELECT engmarq_private.can_manage_profile($1) allowed',[id(101)])).rows[0].allowed,false)
   assert.equal((await isolated.query('UPDATE user_profiles SET active=false WHERE id=$1 RETURNING id',[id(3)])).rows.length,0)
  })
  await actor(isolated,3,async()=>{
   assert.equal((await isolated.query('UPDATE user_profiles SET active=false WHERE id=$1 RETURNING id',[id(5)])).rows.length,1)
   await assert.rejects(isolated.query('UPDATE user_profiles SET empresa_id=$1 WHERE id=$2',[id(102),id(5)]),e=>e.code==='42501')
  })
  await migrate(isolated,'014_fix_user_profiles_permissions.sql')
  const drift=await readOnlyChecks(isolated,'021_security_postflight_readonly.sql')
  assert.ok(drift.filter(r=>r.CHECK.endsWith('can_manage_profile(uuid,user_role)') || r.CHECK.endsWith('guard_profile_update()')).every(r=>r.STATUS==='BLOQUEIO'))
 } finally {await isolated.close()}
})

test('unknown Users body or unsafe legacy ACL remains blocked, not PRE_CORRECAO approval',async()=>{
 const isolated=await fixture()
 try {
  await migrate(isolated,'014_fix_user_profiles_permissions.sql')
  await isolated.exec('GRANT EXECUTE ON FUNCTION engmarq_private.can_manage_profile(uuid,user_role) TO anon')
  let checks=await readOnlyChecks(isolated,'021_security_preflight_readonly.sql')
  assert.equal(checks.find(r=>r.CHECK.endsWith('can_manage_profile(uuid,user_role)')).STATUS,'BLOQUEIO')
  await isolated.exec(`REVOKE EXECUTE ON FUNCTION engmarq_private.can_manage_profile(uuid,user_role) FROM anon;
   CREATE OR REPLACE FUNCTION engmarq_private.can_manage_profile(target_empresa uuid,target_role public.user_role DEFAULT NULL)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT true $$;`)
  checks=await readOnlyChecks(isolated,'021_security_preflight_readonly.sql')
  assert.equal(checks.find(r=>r.CHECK.endsWith('can_manage_profile(uuid,user_role)')).STATUS,'BLOQUEIO')
  await assert.rejects(migrate(isolated,'021_documentos_empresas_security.sql'),/known Users 014\/015/)
  await isolated.exec('ROLLBACK')
 } finally {await isolated.close()}
})

test('021 leaves an existing legacy EPI/signature catalog and data unchanged',async()=>{
 const isolated=await fixture({legacyEpi:true})
 try {
  const snapshot=async()=>[
   (await isolated.query("SELECT * FROM pg_policies WHERE tablename IN ('fichas_epi','fichas_epi_itens') OR policyname LIKE 'assinaturas_%' ORDER BY policyname")).rows,
   (await isolated.query("SELECT relname,relacl,relrowsecurity FROM pg_class WHERE relname IN ('fichas_epi','fichas_epi_itens') ORDER BY relname")).rows,
   (await isolated.query('SELECT * FROM fichas_epi ORDER BY id')).rows,
   (await isolated.query('SELECT * FROM fichas_epi_itens ORDER BY id')).rows,
   (await isolated.query("SELECT * FROM storage.objects WHERE bucket_id='assinaturas' ORDER BY id")).rows,
  ]
  const before=await snapshot()
  await migrate(isolated,'021_documentos_empresas_security.sql')
  assert.deepEqual(await snapshot(),before)
  assert.equal(Number((await readOnlyChecks(isolated,'021_security_postflight_readonly.sql')).at(-2).RESULTADO),0)
 } finally {await isolated.close()}
})


test('Documentos inventory remains independent of another module auditor failure',async()=>{
 const isolated=await fixture()
 try {
  await isolated.exec('DROP VIEW vw_dashboard_treinamentos')
  const checks=await readOnlyChecks(isolated,'021_security_preflight_readonly.sql')
  assert.match(checks.find(r=>r.CHECK==='Auditor: SELECT integral').RESULTADO,/vw_dashboard_treinamentos:relation_missing/)
  assert.equal(checks.find(r=>r.CHECK==='Documentos preservados').STATUS,'OK')
  assert.equal(checks.find(r=>r.CHECK==='Objetos preservados').STATUS,'OK')
 } finally {await isolated.close()}
})

test('missing Documentos object is a measured block even when EPI is absent',async()=>{
 const isolated=await fixture()
 try {
  await isolated.query('DELETE FROM storage.objects WHERE id=$1',[id(801)])
  const checks=await readOnlyChecks(isolated,'021_security_preflight_readonly.sql')
  assert.equal(checks.find(r=>r.CHECK==='Objetos preservados').RESULTADO,'3 / esperado 4')
  assert.equal(checks.find(r=>r.CHECK.includes('Arquivo_path')).STATUS,'BLOQUEIO')
  assert.equal(checks.find(r=>r.CHECK.includes('Legacy URL')).STATUS,'BLOQUEIO')
 } finally {await isolated.close()}
})

for(const [field,value] of [['role',"'admin'"],['empresa_id',`'${id(102)}'`],['id',`'${id(99)}'`]]) {
 test(`Users 014 -> 021 denies tenant privilege escalation through ${field}`,async()=>{
  const isolated=await fixture()
  try {
   await migrate(isolated,'014_fix_user_profiles_permissions.sql')
   await migrate(isolated,'021_documentos_empresas_security.sql')
   await actor(isolated,3,async()=>assert.rejects(isolated.query(`UPDATE user_profiles SET ${field}=${value} WHERE id=$1`,[id(5)]),e=>e.code==='42501'))
  } finally {await isolated.close()}
 })
}
