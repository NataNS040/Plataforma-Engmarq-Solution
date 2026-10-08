import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {fundacaoFixture} from './fundacao-fixture.mjs'
import {catalog} from './025-catalog.mjs'
const sql=await readFile(new URL('025_preflight_remoto_manual.sql',import.meta.url),'utf8')
const execute=async db=>(await db.exec(sql)).flatMap(r=>r.rows??[])
const blocked=rows=>rows.filter(r=>r.CATEGORIA!=='RESUMO'&&r.STATUS==='BLOQUEIO')

test('001–024 retain confirmed Supabase sequence defaults; native ACLs and reviewed PRE-025 contract agree',async()=>{
 const db=await fundacaoFixture(true,{legacySequenceDefaults:true})
 try{
  const entries=(await db.query(catalog)).rows
  for(const role of ['anon','authenticated','service_role']){
   const grant=entries.find(r=>r.identity===`grant:public.exames_catalogo_id_seq.${role}`)
   assert.deepEqual(grant.detail,{sequence:['SELECT','UPDATE','USAGE'],table:[],columns:[]})
  }
  const rows=await execute(db),blocks=blocked(rows)
  assert.equal(blocks.length,0)
  for(const row of rows.filter(r=>r.CHECK.startsWith('grant:public.exames_catalogo_id_seq.'))){
   assert.equal(row.STATUS,'OK')
   assert.match(row.CHECK,/^grant:public\.exames_catalogo_id_seq\./)
   assert.ok(row.DETALHES.origem_sequence.default_privileges_atuais.some(d=>d.creator==='postgres'))
   assert.ok(row.DETALHES.origem_sequence.acl_nativo.some(a=>a.privilege==='USAGE'))
  }
  assert.deepEqual(rows.at(-1).DETALHES.bloqueios,blocks.map(({CATEGORIA,CHECK,RESULTADO,STATUS,DETALHES})=>({CATEGORIA,CHECK,RESULTADO,STATUS,DETALHES})))
  // UPDATE is a real capability if SQL is reachable; no production change here.
  await db.exec('SET ROLE anon')
  assert.equal((await db.query("SELECT setval('public.exames_catalogo_id_seq',1,false) value")).rows[0].value,1)
  await db.exec('RESET ROLE')
 }finally{await db.close()}
})

test('USAGE-only drift is detected; table/column privilege emulation cannot hide it',async()=>{
 const db=await fundacaoFixture(true)
 try{
  await db.exec('REVOKE ALL ON SEQUENCE public.exames_catalogo_id_seq FROM anon; GRANT USAGE ON SEQUENCE public.exames_catalogo_id_seq TO anon')
  const row=blocked(await execute(db)).find(r=>r.CHECK==='grant:public.exames_catalogo_id_seq.anon')
  assert.ok(row)
  assert.deepEqual(row.DETALHES.atual,{sequence:['USAGE'],table:[],columns:[]})
 }finally{await db.close()}
})

test('event-trigger EXECUTE is DDL-only attention; unknown body still blocks and is never invoked',async()=>{
 const db=await fundacaoFixture(true,{legacySequenceDefaults:true})
 try{
  await db.exec(`CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'auditor must never execute unknown body'; END $$`)
  const rows=await execute(db),blocks=blocked(rows)
  assert.equal(blocks.length,1)
  const func=blocks.find(r=>r.CHECK==='function:rls_auto_enable()')
  const acl=rows.find(r=>r.CHECK==='EXECUTE: rls_auto_enable()')
  assert.ok(func&&acl)
  assert.equal(acl.STATUS,'ATENÇÃO')
  assert.match(acl.DETALHES.surface,/DDL_ONLY/)
  assert.match(func.DETALHES.origem_funcao.definition,/auditor must never execute unknown body/)
  assert.equal(func.DETALHES.origem_funcao.event_triggers[0].name,'ensure_rls')
  assert.equal(func.DETALHES.origem_funcao.extension,null)
  assert.equal(rows.at(-1).DETALHES.bloqueios.length,1)
  await assert.rejects(db.query('SELECT public.rls_auto_enable()'),/trigger functions can only be called as triggers/)
 }finally{await db.close()}
})
