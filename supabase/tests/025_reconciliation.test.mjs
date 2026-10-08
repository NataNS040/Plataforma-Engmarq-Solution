import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {fundacaoFixture,migrate,actor,dataSnapshot} from './fundacao-fixture.mjs'
import {catalog} from './025-catalog.mjs'
import {reviewedRlsBody,reviewedRlsContract,assertReviewedInfrastructure} from './025-reviewed-infrastructure.mjs'
const preSql=await readFile(new URL('025_preflight_remoto_manual.sql',import.meta.url),'utf8')
const preCatalog=JSON.parse(await readFile(new URL('../../docs/audits/2026-10-04/expected-025-preflight-catalog.json',import.meta.url),'utf8'))
const postCatalog=JSON.parse(await readFile(new URL('../../docs/audits/2026-10-04/expected-025-postflight-catalog.json',import.meta.url),'utf8'))
const identity='function:rls_auto_enable()'
const definition=body=>`CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $reviewed$${body}$reviewed$`
const entry=async db=>(await db.query(catalog)).rows.find(r=>r.identity===identity)
const denied=e=>e.code==='42501'

test('reviewed PRE differs from hardened POST only for the intended sequence ACLs; infrastructure body/bindings remain exact',()=>{
 assert.deepEqual(preCatalog.find(r=>r.identity===identity),postCatalog.find(r=>r.identity===identity))
 const known=preCatalog.find(r=>r.identity===identity)
 assert.deepEqual(known,reviewedRlsContract)
 assertReviewedInfrastructure(preCatalog)
 assertReviewedInfrastructure(postCatalog,{post:true})
 const unreviewed=structuredClone(preCatalog)
 unreviewed.find(r=>r.identity===identity).detail.hash='unreviewed'
 assert.throws(()=>assertReviewedInfrastructure(unreviewed),/Reviewed external RLS contract changed/)
 assert.equal(known.optional,false)
 assert.equal(known.detail.language,'plpgsql')
 assert.deepEqual(known.detail.event_triggers,[{name:'ensure_rls',event:'ddl_command_end',enabled:'O',tags:['CREATE TABLE','CREATE TABLE AS','SELECT INTO']}])
 for(const role of ['anon','authenticated','service_role']){
  const key=`grant:public.exames_catalogo_id_seq.${role}`
  assert.deepEqual(preCatalog.find(r=>r.identity===key).detail.sequence,['SELECT','UPDATE','USAGE'])
  assert.deepEqual(postCatalog.find(r=>r.identity===key).detail.sequence,role==='service_role'?['USAGE']:[])
 }
})

test('sequence hardening denies client mutation/read, retains authenticated catalog read and technical SERIAL inserts',async()=>{
 const db=await fundacaoFixture(true)
 try{
  const before=await dataSnapshot(db),functionBefore=await entry(db)
  for(const role of ['anon','authenticated','service_role']){
   await actor(db,4,async()=>{
    const value=(await db.query("SELECT nextval('public.exames_catalogo_id_seq') n")).rows[0].n
    assert.equal((await db.query("SELECT currval('public.exames_catalogo_id_seq') n")).rows[0].n,value)
    assert.ok((await db.query('SELECT last_value FROM public.exames_catalogo_id_seq')).rows.length)
    // Keep the counter forward-only in this disposable fixture.
    await db.query("SELECT setval('public.exames_catalogo_id_seq',$1)",[value])
   },role)
  }
  // No table INSERT is granted to clients even BEFORE sequence hardening.
  for(const role of ['anon','authenticated'])await actor(db,4,async()=>{
   await assert.rejects(db.query("INSERT INTO public.exames_catalogo(nome) VALUES('denied pre')"),denied)
  },role)
  await migrate(db,'025_entitlements_quota_hardening.sql')
  assert.deepEqual(await dataSnapshot(db),before)
  assert.deepEqual(await entry(db),functionBefore)
  for(const role of ['anon','authenticated'])for(const query of [
   "SELECT nextval('public.exames_catalogo_id_seq')",
   "SELECT currval('public.exames_catalogo_id_seq')",
   "SELECT setval('public.exames_catalogo_id_seq',1,false)",
   'SELECT last_value FROM public.exames_catalogo_id_seq',
   "INSERT INTO public.exames_catalogo(nome) VALUES('denied post')"
  ])await actor(db,4,()=>assert.rejects(db.query(query),denied),role)
  await actor(db,4,async()=>assert.ok((await db.query('SELECT * FROM public.exames_catalogo ORDER BY ordem,id')).rows.length>0))
  await actor(db,4,async()=>{
   const row=(await db.query("INSERT INTO public.exames_catalogo(nome,ordem) VALUES('legitimate technical insert',100) RETURNING id,nome")).rows[0]
   assert.ok(Number(row.id)>27)
   assert.equal(row.nome,'legitimate technical insert')
   assert.equal((await db.query("SELECT currval('public.exames_catalogo_id_seq') n")).rows[0].n,row.id)
  },'service_role')
  for(const query of ["SELECT setval('public.exames_catalogo_id_seq',1,false)",'SELECT last_value FROM public.exames_catalogo_id_seq'])
   await actor(db,4,()=>assert.rejects(db.query(query),denied),'service_role')
  assert.ok((await db.query('SELECT last_value FROM public.exames_catalogo_id_seq')).rows.length)
 }finally{await db.close()}
})

test('event trigger PUBLIC EXECUTE cannot invoke its body as SQL under API roles; DDL handles quoted identities safely',async()=>{
 const db=await fundacaoFixture(true)
 try{
  for(const role of ['anon','authenticated','service_role'])await actor(db,4,()=>assert.rejects(db.query('SELECT public.rls_auto_enable()'),/trigger functions can only be called as triggers/),role)
  const evil='reviewed"; DROP TABLE public.exames_catalogo; --'
  await db.exec(`CREATE TABLE public."${evil.replaceAll('"','""')}"(id integer);
   CREATE TABLE public.reviewed_ctas AS SELECT 1 id;
   SELECT 1 AS id INTO public.reviewed_select_into;
   CREATE SCHEMA reviewed_other;
   CREATE TABLE reviewed_other.not_enforced(id integer)`)
  const rows=(await db.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname=ANY($1)",[[evil,'reviewed_ctas','reviewed_select_into','not_enforced']])).rows
  assert.equal(rows.length,4)
  for(const row of rows)assert.equal(row.relrowsecurity,row.relname!=='not_enforced')
  assert.equal((await db.query('SELECT count(*)::int n FROM public.exames_catalogo')).rows[0].n,27)
  // A public overload must not shadow format() in the definer's pg_catalog path.
  await db.exec("CREATE FUNCTION public.format(text,text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'shadowed'; END $$; CREATE TABLE public.reviewed_no_shadow(id integer)")
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.reviewed_no_shadow'::regclass")).rows[0].relrowsecurity,true)
 }finally{await db.close()}
})

test('body token hash ignores only formatting; quoted-literal, token and SQL behavior drift remain blocking',async()=>{
 const db=await fundacaoFixture(true)
 try{
  const original=(await entry(db)).detail.hash
  await db.exec(definition(reviewedRlsBody.replaceAll('\n','\r\n')))
  assert.equal((await entry(db)).detail.hash,original)
  await db.exec(definition(reviewedRlsBody.replace('  cmd record;','\tcmd\t\trecord;')))
  assert.equal((await entry(db)).detail.hash,original)
  for(const body of [
   reviewedRlsBody.replace('enable row level security','disable row level security'),
   reviewedRlsBody.replace('enable row level security','enable  row level security'),
   reviewedRlsBody.replace('cmd record;','cmdrecord;'),
   reviewedRlsBody.replace('cmd.schema_name','cmd.schema_ name'),
   reviewedRlsBody.replace('cmd.object_identity','cmd.schema_name'),
   reviewedRlsBody.replace('END;\n','RAISE; END;\n'),
  ]){
   // Some invalid PL/pgSQL source is rejected at CREATE; every accepted drift
   // must still fail the exact reviewed contract, without invoking the body.
   try{await db.exec(definition(body))}catch{continue}
   assert.notEqual((await entry(db)).detail.hash,original)
   const rows=(await db.exec(preSql)).flatMap(r=>r.rows??[])
   assert.ok(rows.some(r=>r.CHECK===identity&&r.STATUS==='BLOQUEIO'))
  }
 }finally{await db.close()}
})

test('owner/path/definer/language and every event binding drift block PRE-025 and migration assertion',async()=>{
 const db=await fundacaoFixture(true)
 try{
  for(const mutation of [
   'ALTER FUNCTION public.rls_auto_enable() SET search_path=public,pg_catalog',
   'ALTER FUNCTION public.rls_auto_enable() SECURITY INVOKER',
   "CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE internal SECURITY DEFINER SET search_path=pg_catalog AS 'suppress_redundant_updates_trigger'",
   'ALTER FUNCTION public.rls_auto_enable() OWNER TO service_role',
   'ALTER FUNCTION public.rls_auto_enable() RENAME TO rls_auto_enable_changed',
   'ALTER FUNCTION public.rls_auto_enable() SET SCHEMA engmarq_private',
   'ALTER EVENT TRIGGER ensure_rls DISABLE',
   'ALTER EVENT TRIGGER ensure_rls ENABLE ALWAYS',
   'ALTER EVENT TRIGGER ensure_rls RENAME TO ensure_rls_changed',
   "DROP EVENT TRIGGER ensure_rls; CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.rls_auto_enable()",
   'CREATE EVENT TRIGGER extra_rls ON ddl_command_start EXECUTE FUNCTION public.rls_auto_enable()',
   'DROP EVENT TRIGGER ensure_rls',
   'DROP EVENT TRIGGER ensure_rls; DROP FUNCTION public.rls_auto_enable()',
  ]){
   await db.exec('BEGIN')
   try{
    await db.exec(mutation)
    const rows=(await db.query(catalog)).rows
    assert.notDeepEqual(rows.find(r=>r.identity===identity),preCatalog.find(r=>r.identity===identity),mutation)
   }finally{await db.exec('ROLLBACK')}
   // Exercise the actual generated assertion outside our rollback transaction.
   await db.exec(mutation)
   await assert.rejects(migrate(db,'025_entitlements_quota_hardening.sql'),/025 baseline contract drift/)
   await db.exec('ROLLBACK')
   // Restore the fixture without executing any unknown body.
   if(mutation.includes('RENAME TO rls_auto_enable_changed'))await db.exec('ALTER FUNCTION public.rls_auto_enable_changed() RENAME TO rls_auto_enable')
   if(mutation.includes('SET SCHEMA'))await db.exec('ALTER FUNCTION engmarq_private.rls_auto_enable() SET SCHEMA public')
   if(mutation.includes('RENAME TO ensure_rls_changed'))await db.exec('ALTER EVENT TRIGGER ensure_rls_changed RENAME TO ensure_rls')
   await db.exec('DROP EVENT TRIGGER IF EXISTS ensure_rls; DROP EVENT TRIGGER IF EXISTS extra_rls; DROP FUNCTION IF EXISTS public.rls_auto_enable()')
   const {reviewedRlsFixture}=await import('./025-reviewed-infrastructure.mjs')
   await db.exec(reviewedRlsFixture)
  }
 }finally{await db.close()}
})

test('inherited sequence UPDATE cannot silently survive hardening; failed local migration rolls back ACLs/data',async()=>{
 const db=await fundacaoFixture(true)
 try{
  const before=await dataSnapshot(db)
  await db.exec('CREATE ROLE sequence_bridge; GRANT UPDATE ON SEQUENCE public.exames_catalogo_id_seq TO sequence_bridge; GRANT sequence_bridge TO authenticated')
  await assert.rejects(migrate(db,'025_entitlements_quota_hardening.sql'),/sequence ACL hardening incomplete/)
  await db.exec('ROLLBACK')
  assert.deepEqual(await dataSnapshot(db),before)
  const grant=(await db.query(catalog)).rows.find(r=>r.identity==='grant:public.exames_catalogo_id_seq.anon')
  assert.deepEqual(grant.detail.sequence,['SELECT','UPDATE','USAGE'])
 }finally{await db.close()}
})
