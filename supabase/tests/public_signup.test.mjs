import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { fundacaoFixture, migrate, id } from './fundacao-fixture.mjs'

const candidate = await readFile(new URL('../pending/public_company_signup.sql', import.meta.url), 'utf8')
async function foundation(emailType = 'varchar(255)') {
 const db = await fundacaoFixture(true)
 await migrate(db, '025_entitlements_quota_hardening.sql')
 await db.exec(`ALTER TABLE auth.users ADD COLUMN email ${emailType} UNIQUE, ADD COLUMN raw_user_meta_data jsonb, ADD COLUMN raw_app_meta_data jsonb, ADD COLUMN is_anonymous boolean DEFAULT false, ADD COLUMN email_confirmed_at timestamptz;
 CREATE ROLE supabase_auth_admin NOLOGIN; GRANT USAGE ON SCHEMA auth TO supabase_auth_admin; GRANT INSERT ON auth.users TO supabase_auth_admin`)
 return db
}
async function fixture(open = true, emailType = 'varchar(255)') {
 const db = await foundation(emailType)
 await db.exec(candidate)
 if(open) await db.exec("UPDATE engmarq_private.public_signup_control SET enabled=true,review_reference='SYNTHETIC-LOCAL-TEST-ONLY'")
 return db
}
const payload = (extra={}) => ({norveo_signup:{version:'1',razao_social:'Nova Empresa',cnpj:'33.000.167/0001-01',full_name:'Responsável Empresa',...extra},role:'admin',empresa_id:id(101)})
const signup = (db,n=9000,data=payload()) => db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id(n),`signup${n}@example.test`,data])

for(const emailType of ['varchar(255)','text','varchar','varchar(320)']) {
 test(`Auth email ${emailType}: preflight, public signup and private admission remain compatible`,async()=>{
  const db=await foundation(emailType)
  try {
   const preflight=await readFile(new URL('../pending/public_company_signup_preflight_readonly.sql',import.meta.url),'utf8')
   await db.exec(preflight)
   await db.exec(candidate)
   // Internal admission works with the public gate still closed.
   await db.exec('SET ROLE service_role')
   await db.query('SELECT public.autorizar_auth_interno($1,$2,$3)',[id(3),id(9700),'Mixed@Example.test'])
   await db.exec('RESET ROLE; SET ROLE supabase_auth_admin')
   await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id(9700),'mixed@example.test'])
   await db.exec('RESET ROLE; SET ROLE service_role')
   await db.query('SELECT public.provisionar_perfil_interno($1,$2,$3,$4)',[id(3),id(9700),'Internal','operacional'])
   await db.exec('RESET ROLE')
   const internal=(await db.query('SELECT email,empresa_id,role FROM user_profiles WHERE id=$1',[id(9700)])).rows[0]
   assert.equal(internal.email,'mixed@example.test');assert.equal(internal.empresa_id,id(101));assert.equal(internal.role,'operacional')
   await db.exec("UPDATE engmarq_private.public_signup_control SET enabled=true,review_reference='SYNTHETIC-LOCAL-TEST-ONLY'")
   await signup(db,9701)
   assert.equal((await db.query('SELECT email,role FROM user_profiles WHERE id=$1',[id(9701)])).rows[0].email,'signup9701@example.test')
   const column=(await db.query('SELECT atttypid::regtype::text type,atttypmod FROM pg_attribute WHERE attrelid=$1::regclass AND attname=$2',['auth.users','email'])).rows[0]
   assert.equal(column.type,emailType==='text'?'text':'character varying')
   assert.equal(column.atttypmod,emailType==='varchar(255)'?259:emailType==='varchar(320)'?324:-1)
  }finally{await db.close()}
 })
}

for(const emailType of ['varchar(254)','char(255)','integer','jsonb','text[]']) {
 test(`Auth email ${emailType}: incompatible type fails closed before DDL`,async()=>{
  const db=await foundation(emailType)
  try {
   const preflight=await readFile(new URL('../pending/public_company_signup_preflight_readonly.sql',import.meta.url),'utf8')
   await assert.rejects(db.exec(preflight),/incompatible Auth column email/)
   await db.exec('ROLLBACK')
   await assert.rejects(db.exec(candidate),/incompatible Auth column email/)
   await db.exec('ROLLBACK')
   assert.equal((await db.query("SELECT to_regclass('engmarq_private.public_signup_control') AS gate")).rows[0].gate,null)
  }finally{await db.close()}
 })
}

test('public signup provisions isolated company, company administrator and free entitlements atomically',async()=>{
 const db=await fixture()
 try {
  await db.exec('SET ROLE supabase_auth_admin')
  await signup(db)
  await db.exec('RESET ROLE')
  const p=(await db.query('SELECT * FROM user_profiles WHERE id=$1',[id(9000)])).rows[0]
  assert.equal(p.role,'empresa'); assert.notEqual(p.empresa_id,id(101));assert.equal(p.active,true)
  assert.equal((await db.query('SELECT max_colaboradores_ativos,ilimitado FROM empresa_limites WHERE empresa_id=$1',[p.empresa_id])).rows[0].max_colaboradores_ativos,100)
  assert.equal((await db.query('SELECT colaboradores_ativos::int n FROM empresa_uso WHERE empresa_id=$1',[p.empresa_id])).rows[0].n,0)
  assert.equal((await db.query('SELECT origem,titularidade FROM empresa_comercial WHERE empresa_id=$1',[p.empresa_id])).rows[0].origem,'autocadastro')
  assert.equal((await db.query('SELECT count(*)::int n FROM empresa_features WHERE empresa_id=$1 AND enabled',[p.empresa_id])).rows[0].n,7)
  assert.equal((await db.query('SELECT estado FROM engmarq_private.onboarding_solicitacoes WHERE auth_user_id=$1',[id(9000)])).rows[0].estado,'completed')
  // JWT tenant, not caller supplied metadata, determines RLS.
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${id(9000)}'`)
  assert.equal((await db.query('SELECT id FROM empresas')).rows.length,1)
  assert.equal((await db.query('SELECT id FROM user_profiles')).rows.length,1)
  await db.exec(`UPDATE user_profiles SET role='admin' WHERE id='${id(9000)}'`)
  assert.equal((await db.query('SELECT role FROM user_profiles WHERE id=$1',[id(9000)])).rows[0].role,'empresa')
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO funcoes(id,empresa_id,nome) VALUES($1,$2,$3)',[id(9000),p.empresa_id,'Função'])
  await db.query('INSERT INTO setores(id,empresa_id,nome) VALUES($1,$2,$3)',[id(9000),p.empresa_id,'Setor'])
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${id(9000)}'`)
  for(let n=0;n<100;n++) await db.query('INSERT INTO colaboradores(empresa_id,nome,cpf,data_admissao,funcao_id,setor_id) VALUES($1,$2,$3,$4,$5,$5)',[p.empresa_id,'Colaborador',String(n).padStart(11,'0'),'2026-01-01',id(9000)])
  await assert.rejects(db.query('INSERT INTO colaboradores(empresa_id,nome,cpf,data_admissao,funcao_id,setor_id) VALUES($1,$2,$3,$4,$5,$5)',[p.empresa_id,'Excedente','99999999999','2026-01-01',id(9000)]),e=>e.code==='P2502')
  await assert.rejects(db.query(`INSERT INTO colaboradores(empresa_id,nome,cpf,data_admissao,funcao_id,setor_id) SELECT $1,'Lote',lpad(n::text,11,'0'),'2026-01-01'::date,$2,$2 FROM generate_series(101,102) n`,[p.empresa_id,id(9000)]),e=>e.code==='P2502')
  assert.equal((await db.query('SELECT count(*)::int n FROM colaboradores WHERE empresa_id=$1',[p.empresa_id])).rows[0].n,100)
  await db.exec('RESET ROLE')
 } finally {await db.close()}
})

test('server gate denies marked/unmarked signup and spoofed internal user metadata without creating Auth/company/profile rows', async () => {
 const db=await fixture(false)
 try {
  const before=(await db.query('SELECT count(*)::int n FROM empresas')).rows[0].n
  for(const data of [payload(),{}, { norveo_internal_provisioning:true }, { app_metadata:{norveo_internal_provisioning:true} }]) {
   await assert.rejects(signup(db,9100,data),e=>e.code==='P2600')
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM empresas')).rows[0].n,before)
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[id(9100)])).rows[0].n,0)
  for(const role of ['anon','authenticated','service_role']) {
   await db.exec(`SET ROLE ${role}`)
   await assert.rejects(db.exec('UPDATE engmarq_private.public_signup_control SET enabled=true'))
   await assert.rejects(db.exec('SELECT * FROM engmarq_private.public_signup_control'))
   await db.exec('RESET ROLE')
  }
 } finally {await db.close()}
})

test('pre-insert service-only admission preserves 025-A authorized provisioning while public gate is closed',async()=>{
 const db=await fixture(false)
 try {
  const before=(await db.query('SELECT count(*)::int n FROM empresas')).rows[0].n
  await db.exec('SET ROLE service_role')
  await db.query('SELECT public.autorizar_auth_interno($1,$2,$3)',[id(3),id(9101),'internal@example.test'])
  await db.exec('RESET ROLE; SET ROLE supabase_auth_admin')
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id(9101),'internal@example.test'])
  await db.exec('RESET ROLE; SET ROLE service_role')
  await db.query('SELECT public.provisionar_perfil_interno($1,$2,$3,$4)',[id(3),id(9101),'Internal','operacional'])
  await db.exec('RESET ROLE')
  const p=(await db.query('SELECT role,empresa_id FROM user_profiles WHERE id=$1',[id(9101)])).rows[0]
  assert.equal(p.role,'operacional');assert.equal(p.empresa_id,id(101))
  assert.equal((await db.query('SELECT count(*)::int n FROM empresas')).rows[0].n,before)
  assert.equal((await db.query('SELECT count(*)::int n FROM engmarq_private.internal_auth_admissions')).rows[0].n,0)
 } finally {await db.close()}
})

test('expired operational deadline never releases or transfers a reserved CNPJ',async()=>{
 const db=await fixture()
 try {
  await signup(db)
  await db.exec(`UPDATE engmarq_private.onboarding_solicitacoes SET criado_em=clock_timestamp()-interval '3 days',expira_em=clock_timestamp()-interval '2 days' WHERE auth_user_id='${id(9000)}'`)
  await assert.rejects(signup(db,9102),e=>e.code==='23505')
  assert.equal((await db.query('SELECT auth_user_id FROM engmarq_private.onboarding_solicitacoes WHERE estado=$1',['completed'])).rows[0].auth_user_id,id(9000))
 } finally {await db.close()}
})

test('reserved CNPJ triage is restricted to trusted read-only review and never changes ownership',async()=>{
 const db=await fixture()
 try {
  await signup(db)
  await db.exec("SET norveo.support_cnpj='33.000.167/0001-01'")
  const review=await readFile(new URL('../pending/public_company_signup_recovery_review.sql',import.meta.url),'utf8')
  const result=(await db.exec(review)).flatMap(r=>r.rows??[])
  assert.equal(result[0].auth_user_id,id(9000));assert.equal(result[0].email_confirmado,false)
  await db.exec("SET norveo.support_cnpj='11.222.333/0001-81'")
  const legacy=(await db.exec(review)).flatMap(r=>r.rows??[])
  assert.equal(legacy[0].empresa_id,id(101));assert.equal(legacy[0].cadastro_publico,false)
  assert.equal(legacy[0].auth_user_id,null)
  await db.exec('SET ROLE authenticated')
  await assert.rejects(db.exec(review),/trusted operator/)
  await db.exec('ROLLBACK; RESET ROLE')
  const p=(await db.query('SELECT empresa_id,role FROM user_profiles WHERE id=$1',[id(9000)])).rows[0]
  assert.equal(p.role,'empresa');assert.equal(p.empresa_id,result[0].empresa_id)
 }finally {await db.close()}
})

test('activation requires approved reference; operational rollback closes signup and preserves existing tenants and identities',async()=>{
 const db=await fixture(false)
 try {
  const activate=await readFile(new URL('../pending/public_company_signup_activate.sql',import.meta.url),'utf8')
  await assert.rejects(db.exec(activate),/explicit approved evidence/)
  await db.exec('ROLLBACK; RESET ROLE')
  await db.exec("SET norveo.signup_approval_reference='SYNTHETIC-LOCAL-APPROVAL'")
  await db.exec(activate);await signup(db)
  const before=(await db.query("SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) data FROM user_profiles p")).rows[0].data
  await db.exec(await readFile(new URL('../pending/public_company_signup_close.sql',import.meta.url),'utf8'))
  await assert.rejects(signup(db,9103,payload({cnpj:'45.723.174/0001-10'})),e=>e.code==='P2600')
  assert.deepEqual((await db.query("SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) data FROM user_profiles p")).rows[0].data,before)
  assert.equal((await db.query('SELECT count(*)::int n FROM empresas')).rows[0].n,4)
 } finally {await db.close()}
})

for(const [name,mutation] of [
 ['disabled quota trigger',"ALTER TABLE colaboradores DISABLE TRIGGER guard_colaborador_write"],
 ['changed quota function',"ALTER FUNCTION engmarq_private.guard_colaborador_write() SET search_path=public"],
 ['disabled RLS',"ALTER TABLE empresas DISABLE ROW LEVEL SECURITY"],
 ['overbroad policy',"CREATE POLICY leak_test ON user_profiles FOR SELECT TO authenticated USING(true)"],
 ['privilege escalation',"GRANT CREATE ON SCHEMA engmarq_private TO authenticated"],
 ['extra privileged EXECUTE',"GRANT EXECUTE ON FUNCTION engmarq_private.guard_uso_write() TO authenticated"],
 ['missing feature',"DELETE FROM empresa_features WHERE feature_key='relatorios.sst'; DELETE FROM features WHERE feature_key='relatorios.sst'"],
 ['existing disabled Auth INSERT trigger',"CREATE FUNCTION auth.existing_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER existing_test AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.existing_test(); ALTER TABLE auth.users DISABLE TRIGGER existing_test"],
]) test(`signup preflight fails closed: ${name}`,async()=>{
 const db=await foundation()
 try {
  await db.exec(mutation)
  await assert.rejects(db.exec(candidate),/Signup preflight|Signup dependency drift/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT to_regclass('engmarq_private.public_signup_control') IS NULL absent")).rows[0].absent,true)
  if(name.includes('Auth')) assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='existing_test'")).rows[0].tgenabled,'D')
 } finally {await db.close()}
})

test('standalone pre/postflight are read only; activation detects tampered provisioning and gate column grants',async()=>{
 const db=await foundation()
 try {
  const pre=await readFile(new URL('../pending/public_company_signup_preflight_readonly.sql',import.meta.url),'utf8')
  await db.exec(pre);await db.exec(candidate)
  const post=await readFile(new URL('../pending/public_company_signup_postflight_readonly.sql',import.meta.url),'utf8')
  await db.exec(post)
  await db.exec("GRANT UPDATE(enabled) ON engmarq_private.public_signup_control TO authenticated")
  await assert.rejects(db.exec(post),/gate RLS, ownership or privilege drift/)
  await db.exec('ROLLBACK; REVOKE UPDATE(enabled) ON engmarq_private.public_signup_control FROM authenticated')
  await db.exec("ALTER FUNCTION engmarq_private.provision_public_company() SET search_path=public; SET norveo.signup_approval_reference='SYNTHETIC-LOCAL-APPROVAL'")
  const activate=await readFile(new URL('../pending/public_company_signup_activate.sql',import.meta.url),'utf8')
  await assert.rejects(db.exec(activate),/provisioning body, owner or ACL drift/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT enabled FROM engmarq_private.public_signup_control')).rows[0].enabled,false)
 } finally {await db.close()}
})

test('duplicate CNPJ/email, malformed input and partial provisioning roll back new Auth and company rows',async()=>{
 const db=await fixture()
 try {
  await signup(db)
  const before=(await db.query('SELECT count(*)::int n FROM empresas')).rows[0].n
  await assert.rejects(signup(db,9001),e=>e.code==='23505')
  await assert.rejects(signup(db,9002,payload({role:'admin'})),e=>e.code==='22023')
  await assert.rejects(signup(db,9003,payload({cnpj:'123'})),e=>e.code==='22023')
  await assert.rejects(db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id(9004),'signup9000@example.test',payload()]),e=>e.code==='23505')
  await db.exec(`CREATE FUNCTION engmarq_private.fail_signup_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END $$;
   CREATE TRIGGER fail_signup_test BEFORE INSERT ON empresa_limites FOR EACH ROW EXECUTE FUNCTION engmarq_private.fail_signup_test()`)
  await assert.rejects(signup(db,9005,payload({cnpj:'45.723.174/0001-10'})),e=>e.message==='Injected failure')
  assert.equal((await db.query('SELECT count(*)::int n FROM empresas')).rows[0].n,before)
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id IN ($1,$2,$3,$4,$5)',[id(9001),id(9002),id(9003),id(9004),id(9005)])).rows[0].n,0)
  assert.equal((await db.query("SELECT has_function_privilege('anon','engmarq_private.provision_public_company()','EXECUTE') ok")).rows[0].ok,false)
 } finally {await db.close()}
})


test('internal admission is private, exact identity bound, expiring and cannot bypass public gate via app metadata',async()=>{
 const db=await fixture(false)
 try {
  await assert.rejects(db.query('INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES($1,$2,$3)',[id(9500),'x@example.test',{norveo_internal_provisioning:true}]),e=>e.code==='P2600')
  for(const role of ['anon','authenticated']) {
   await db.exec(`SET ROLE ${role}`)
   await assert.rejects(db.query('SELECT public.autorizar_auth_interno($1,$2,$3)',[id(3),id(9500),'x@example.test']))
   await assert.rejects(db.exec('SELECT * FROM engmarq_private.internal_auth_admissions'))
   await db.exec('RESET ROLE')
  }
  await db.exec('SET ROLE service_role')
  await assert.rejects(db.query('SELECT public.autorizar_auth_interno($1,$2,$3)',[id(1),id(9500),'x@example.test']))
  await db.query('SELECT public.autorizar_auth_interno($1,$2,$3)',[id(3),id(9500),'x@example.test'])
  await db.exec('RESET ROLE')
  await assert.rejects(db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id(9500),'other@example.test']),e=>e.code==='42501')
  await assert.rejects(signup(db,9500),e=>e.code==='42501')
  await db.exec("UPDATE engmarq_private.internal_auth_admissions SET expires_at=clock_timestamp()-interval '1 minute'")
  await assert.rejects(db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id(9500),'x@example.test']),e=>e.code==='42501')
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[id(9500)])).rows[0].n,0)
 }finally{await db.close()}
})

test('Auth transaction failure restores one-use admission; revoked actor cannot use it',async()=>{
 const db=await fixture(false)
 try {
  await db.exec('SET ROLE service_role')
  await db.query('SELECT public.autorizar_auth_interno($1,$2,$3)',[id(3),id(9600),'x@example.test'])
  await db.exec('RESET ROLE; BEGIN')
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id(9600),'x@example.test'])
  // Simulates Auth failing after INSERT (identity/metadata/confirmation).
  await db.exec('ROLLBACK; RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int n FROM engmarq_private.internal_auth_admissions WHERE user_id=$1',[id(9600)])).rows[0].n,1)
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.users WHERE id=$1',[id(9600)])).rows[0].n,0)
  await db.query('UPDATE user_profiles SET active=false WHERE id=$1',[id(3)])
  await assert.rejects(db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id(9600),'x@example.test']),e=>e.code==='42501')
 } finally {await db.close()}
})
