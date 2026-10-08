import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {importRealBaseline,sha256} from './025_import_real_baseline.mjs'
import {withBaseline} from './025_postflight_baseline.mjs'
import {parseReadonly} from './025_manual_preflight.test.mjs'
import {fundacaoFixture} from './fundacao-fixture.mjs'
const real=await readFile(new URL('../../docs/audits/2026-10-08/PRE025_REAL.json',import.meta.url))
async function isolated(fn){const dir=await mkdtemp(join(tmpdir(),'pre025-import-'));try{await fn({destination:join(dir,'nested/PRE025_REAL.json'),postflight:join(dir,'nested/post.sql')})}finally{await rm(dir,{recursive:true,force:true})}}
test('real JSON: creates directory/file, preserves every byte/value, totals and deterministic SQL; idempotent',()=>isolated(async options=>{
 const r=await importRealBaseline(real,options)
 assert.equal(r.baselineState,'created');assert.equal((await stat(options.destination)).size,909757)
 assert.deepEqual(await readFile(options.destination),real)
 assert.deepEqual(JSON.parse(await readFile(options.destination,'utf8')),JSON.parse(real))
 assert.equal(r.sha256,'48411545910eddfff40896d368a2d6028d2303c3b2c602a4b44262b33094829f')
 assert.deepEqual(r.totals,{OK:941,'ATENÇÃO':182,BLOQUEIO:0})
 assert.equal(r.employees.ativos,47);assert.equal(r.employees.inativos,0)
 const sql=await readFile(options.postflight,'utf8');parseReadonly(sql)
 const embedded=sql.match(/-- BEGIN 025 BASELINE JSON\s*convert_from\(decode\('([^']+)'/)[1]
 assert.deepEqual(JSON.parse(Buffer.from(embedded,'base64').toString('utf8')),JSON.parse(real)[0].BASELINE_PRE025)
 assert.equal(sql,withBaseline(await readFile(new URL('025_fundacao_postflight_readonly.sql',import.meta.url),'utf8'),JSON.parse(real)))
 const repeat=await importRealBaseline(options.destination,options)
 assert.equal(repeat.baselineState,'unchanged');assert.equal(repeat.postflightState,'unchanged')
 assert.equal(sha256(sql),repeat.postflight_sha256)
}))
for(const [label,input,pattern] of [
 ['empty',Buffer.from('  '),/Empty/],['truncated',real.subarray(0,real.length-50),/truncated/],
 ['invalid',Buffer.from('{bad}'),/invalid/],['missing envelope',Buffer.from('[{}]'),/BASELINE_PRE025/],
 ['missing file','nonexistent-pre025-file.json',/ENOENT/]
])test(label+' is rejected without output',()=>isolated(async options=>{
 await assert.rejects(importRealBaseline(input,options),pattern)
 await assert.rejects(stat(options.destination),{code:'ENOENT'})
}))
test('different hash is rejected and original baseline survives',()=>isolated(async options=>{
 await importRealBaseline(real,options)
 await assert.rejects(importRealBaseline(Buffer.from(real.toString()+'\n'),options),/Different SHA-256/)
 assert.deepEqual(await readFile(options.destination),real)
}))
test('invalid status/category, declared blocks and collaborator counts are rejected',()=>isolated(async options=>{
 for(const mutate of [p=>p.checks[0].STATUS='PASS',p=>p.checks[0].CATEGORIA=null,p=>p.blocks=1,p=>p.checks.push(p.checks[0]),p=>p.checks.find(r=>r.CHECK==='Colaboradores ativos/inativos/total').DETALHES.ativos=48]){
  const rows=JSON.parse(real);mutate(rows[0].BASELINE_PRE025)
  await assert.rejects(importRealBaseline(Buffer.from(JSON.stringify(rows)),options))
 }
}))
test('CLI stdin supports a real byte stream and idempotent default destination',async()=>{
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['025_import_real_baseline.mjs','-'],{cwd:new URL('.',import.meta.url),stdio:['pipe','pipe','pipe']})
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b)
  child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(real)
 })
 assert.equal(result.code,0,result.stderr)
 assert.equal(JSON.parse(result.stdout).baselineState,'unchanged')
})
test('POST does not exist: SQL fails safely rather than claiming a successful comparison',async()=>{
 const db=await fundacaoFixture(true)
 try{
  const sql=withBaseline(await readFile(new URL('025_fundacao_postflight_readonly.sql',import.meta.url),'utf8'),JSON.parse(real))
  await assert.rejects(db.exec(sql),e=>e.code==='42P01'&&/fundacao_025_legado/.test(e.message))
  await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT to_regclass('engmarq_private.fundacao_025_legado') AS relation")).rows[0].relation,null)
 }finally{await db.close()}
})
