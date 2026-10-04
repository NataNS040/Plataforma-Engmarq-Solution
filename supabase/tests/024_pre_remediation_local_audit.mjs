// Offline evidence only: synthetic PGlite, no environment/credentials/network.
import {readFile,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fundacaoFixture,load} from './fundacao-fixture.mjs'
const root=new URL('../../',import.meta.url)
const helpers=new Set(['function:get_user_empresa_id()','function:get_user_role()'])
const diff=[]
for(const path of ['supabase/migrations/024_fundacao_comercial.sql',
 'supabase/tests/024_fundacao_preflight_readonly.sql','supabase/tests/024_fundacao_postflight_readonly.sql']) {
 const old=execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'})
 const expected=old.replace(/jsonb_to_recordset\('((?:''|[^'])*)'::jsonb\)/g,(whole,literal)=>{
  const rows=JSON.parse(literal.replaceAll("''","'"))
  if(!Array.isArray(rows)||!rows.some(r=>helpers.has(r.identity)))return whole
  for(const row of rows)if(helpers.has(row.identity))row.detail.service=true
  return `jsonb_to_recordset('${JSON.stringify(rows).replaceAll("'","''")}'::jsonb)`
 })
 assert.equal((await readFile(new URL(path,root),'utf8')).replaceAll('\r\n','\n'),
  expected.replaceAll('\r\n','\n'),`${path}: only two embedded contract flags may change`)
}
for(const stage of ['preflight','postflight']) {
 const path=`docs/audits/2026-10-03/expected-024-${stage}-catalog.json`
 const old=JSON.parse(execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'}))
 const current=JSON.parse(await readFile(new URL(path,root),'utf8'))
 assert.equal(current.length,old.length)
 const byId=new Map(current.map(r=>[r.identity,r]))
 for(const original of old) {
  const expected=structuredClone(original)
  if(helpers.has(expected.identity)) {
   expected.detail.service=true
   diff.push({stage,identity:expected.identity,only_change:'service: false -> true'})
  }
  assert.deepEqual(byId.get(original.identity),expected,original.identity)
 }
}
const hashes=JSON.parse(await readFile(new URL('docs/audits/2026-10-03/fundacao-024-migrations-015-023-sha256.json',root),'utf8'))
for(const [file,hash] of Object.entries(hashes))
 assert.equal(createHash('sha256').update(await readFile(new URL(`supabase/migrations/${file}`,root))).digest('hex'),hash,file)
const db=await fundacaoFixture()
try {
 const policies=(await db.query(`SELECT schemaname,tablename,policyname,qual,with_check
  FROM pg_policies WHERE coalesce(qual,'')||coalesce(with_check,'') ~ 'get_user_(empresa_id|role)'
  ORDER BY 1,2,3`)).rows
 const functionConsumers=(await db.query(`SELECT p.oid::regprocedure::text AS consumer
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','engmarq_private','storage') AND p.prosrc ~ 'get_user_(empresa_id|role)' ORDER BY 1`)).rows
 const rows=(await db.exec(await load('024_fundacao_preflight_consolidado_readonly.sql'))).flatMap(r=>r.rows??[])
 const warnings=rows.filter(r=>r.CATEGORIA!=='RESUMO'&&r.STATUS==='ATENÇÃO')
 const warningGroups=Object.fromEntries([...new Set(warnings.map(r=>r.CATEGORIA))].sort()
  .map(c=>[c,warnings.filter(r=>r.CATEGORIA===c).length]))
 await writeFile(new URL('docs/audits/2026-10-04/pre-024-local-evidence.json',root),JSON.stringify({
  environment:'LOCAL SYNTHETIC ONLY; not remote inventory',contract_diff:diff,
  migrations_015_023_hashes_verified:true,policies,functionConsumers,
  local_warning_groups:warningGroups,local_warnings:warnings.map(r=>({category:r.CATEGORIA,check:r.CHECK})),
  remote_totals_user_reported:{ok:333,warnings:98,blocks:3},
  remote_warning_rows_available:false
 },null,2)+'\n')
 console.log(JSON.stringify({contract_diff:diff,policies:policies.length,functionConsumers,local_warning_groups:warningGroups,hashes:'015-023 verified'}))
}finally{await db.close()}
