// Opt-in REAL PostgreSQL integration, local disposable database only. Never reads application .env.
// Example: CNPJ24_LOCAL_TEST_DSN=postgresql://...@127.0.0.1:5432/engmarq_024_test
// Requires psql on PATH. No Auth, production tenant or remote URL is accessed.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
const dsn=process.env.CNPJ24_LOCAL_TEST_DSN

test('real PostgreSQL concurrent canonical CNPJ: numeric and alphanumeric, exactly one winner',{
 skip:dsn?false:'No local disposable PostgreSQL DSN/psql available; PGlite cannot prove concurrency',timeout:30000
},async()=>{
 const url=new URL(dsn)
 assert.ok(['postgres:','postgresql:'].includes(url.protocol))
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only loopback PostgreSQL is permitted')
 assert.match(url.pathname,/^\/engmarq_024_[a-z0-9_]+$/,'Use a disposable database named engmarq_024_*')
 assert.equal(url.search,'','Connection redirection/options are not allowed')
 const schema='engmarq_024_race_'+randomUUID().replaceAll('-','')
 assert.match(schema,/^engmarq_024_race_[0-9a-f]{32}$/)
 function command(sql,{signal}={}) {
  const child=spawn('psql',['--no-psqlrc','--no-password','--dbname',dsn,'--set','ON_ERROR_STOP=1','--tuples-only','--no-align'],{windowsHide:true})
  let out='',err=''
  const promise=new Promise((resolve,reject)=>{
   child.on('error',()=>reject(new Error('Local psql is unavailable')))
   child.stdout.on('data',data=>{out+=data.toString();if(signal&&out.includes(signal))signal.ready?.()})
   child.stderr.on('data',data=>{err+=data.toString()})
   child.on('close',code=>resolve({code,out,err}))
  })
  child.stdin.end('\\set VERBOSITY verbose\n'+sql)
  return {promise,child}
 }
 const ok=async sql=>{const r=await command(sql).promise;assert.equal(r.code,0,r.err);return r}
 const migration=await readFile(new URL('../migrations/024_fundacao_comercial.sql',import.meta.url),'utf8')
 const helpers=migration.slice(migration.indexOf('CREATE FUNCTION engmarq_private.cnpj_canonico'),migration.indexOf('REVOKE ALL ON FUNCTION engmarq_private.cnpj_canonico'))
 assert.match(helpers,/CREATE FUNCTION engmarq_private.cnpj_valido/)
 const definition=helpers.replaceAll('engmarq_private.',schema+'.')
 let created=false
 try {
  await ok(`BEGIN;CREATE SCHEMA ${schema};${definition}
   CREATE TABLE ${schema}.empresas(id uuid DEFAULT gen_random_uuid(),cnpj text NOT NULL,
   cnpj_canonico text GENERATED ALWAYS AS (${schema}.cnpj_canonico(cnpj)) STORED,
   CONSTRAINT empresas_cnpj_valido_check CHECK(${schema}.cnpj_valido(cnpj)),
   CONSTRAINT empresas_cnpj_canonico_key UNIQUE(cnpj_canonico));COMMIT;`)
  created=true
  for(const [first,second] of [['11.222.333/0001-81','11222333000181'],['12.ABC.345/01DE-35','12abc34501de35']]){
   let ready
   const wait=new Promise(resolve=>{ready=resolve})
   const marker='winner_inserted'
   const signal=new String(marker);signal.ready=ready
   const winner=command(`BEGIN;INSERT INTO ${schema}.empresas(cnpj) VALUES('${first}');
    SELECT '${marker}';SELECT pg_sleep(1.5);COMMIT;`,{signal})
   await Promise.race([wait,winner.promise.then(()=>{throw new Error('First connection ended before race marker')})])
   const loser=command(`INSERT INTO ${schema}.empresas(cnpj) VALUES('${second}');`)
   const [a,b]=await Promise.all([winner.promise,loser.promise])
   assert.equal(a.code,0,a.err);assert.notEqual(b.code,0);assert.match(b.err,/23505/)
  }
  const result=await ok(`SELECT count(*) FROM ${schema}.empresas;`)
  assert.equal(result.out.trim(),'2')
 }finally{
  if(created)await ok(`DROP SCHEMA ${schema} CASCADE;`)
 }
})
