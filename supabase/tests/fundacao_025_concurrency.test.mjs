import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import {spawn,spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {bootstrapSql} from './025-postgres-fixture.mjs'
import {id,load} from './fundacao-fixture.mjs'
const name='engmarq-025-disposable-'+randomUUID().slice(0,8)
const database='engmarq_025_disposable'
let unavailable,started=false,dockerEndpoint
const delay=ms=>new Promise(r=>setTimeout(r,ms))
function command(args,input){return new Promise(resolve=>{
 const child=spawn('docker',dockerEndpoint?['--host',dockerEndpoint,...args]:args,{windowsHide:true});let out='',err=''
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b)
 child.on('error',e=>resolve({code:127,out,err:e.message}));child.on('close',code=>resolve({code,out,err}))
 child.stdin.on('error',()=>{});child.stdin.end(input)
})}
// The image entrypoint starts a temporary Unix-socket-only server BEFORE it
// creates POSTGRES_DB. TCP loopback inside this network-isolated container
// reaches only the final server, after initialization has completed.
const sql=source=>command(['exec','-i',name,'psql','-X','-h','127.0.0.1','-U','postgres','-d',database,'-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],"SET statement_timeout='8s'; SET lock_timeout='5s';\n"+source)
async function checked(source){const result=await sql(source);assert.equal(result.code,0,result.err);return result.out.trim()}
before(async()=>{
 // Context inspection is local metadata; never contact a remote Docker daemon.
 let endpoint=process.env.DOCKER_HOST
 if(!endpoint){
  const context=spawnSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8',windowsHide:true,timeout:10000})
  if(context.error||context.status!==0){unavailable='DEFERRED: local Docker context unavailable; PostgreSQL real not executed';return}
  endpoint=context.stdout.trim()
 }
 assert.match(endpoint,/^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/,'Only a local Unix/named-pipe Docker daemon is permitted')
 // Pin every subsequent operation to the inspected LOCAL endpoint: a changed
 // context or DOCKER_CONTEXT must never redirect destructive tests remotely.
 dockerEndpoint=endpoint
 const probe=spawnSync('docker',['--host',dockerEndpoint,'info','--format','{{.ServerVersion}}'],{encoding:'utf8',windowsHide:true,timeout:10000})
 if(probe.error||probe.status!==0){unavailable=`DEFERRED: local Docker daemon unavailable at ${dockerEndpoint}; PostgreSQL real not executed. ${probe.error?.message??probe.stderr.trim()}`;return}
 const image=spawnSync('docker',['--host',dockerEndpoint,'image','inspect','postgres:16'],{encoding:'utf8',windowsHide:true,timeout:10000})
 if(image.status!==0){unavailable='DEFERRED: local postgres:16 image absent; run docker pull postgres:16 explicitly';return}
 const run=await command(['run','--rm','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e',`POSTGRES_DB=${database}`,'postgres:16'])
 assert.equal(run.code,0,run.err);started=true
 let ready=false,lastReadiness
 const deadline=Date.now()+60000
 while(Date.now()<deadline){
  const probe=await command(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d',database])
  if(probe.code===0){
   lastReadiness=await sql('SELECT current_database();')
   if(lastReadiness.code===0&&lastReadiness.out.trim()===database){ready=true;break}
  }else lastReadiness=probe
  await delay(200)
 }
 if(!ready){
  const logs=await command(['logs','--tail','40',name])
  assert.fail(`Disposable PostgreSQL database ${database} not queryable via TCP after 60s: ${lastReadiness?.err??lastReadiness?.out}; ${logs.out}${logs.err}`)
 }
 const version=await checked('SELECT version();');assert.match(version,/PostgreSQL 16\./)
 console.log('REAL_POSTGRES_ENVIRONMENT '+JSON.stringify({version,currentDatabase:await checked('SELECT current_database();'),container:name,containerId:run.out.trim(),endpoint:dockerEndpoint,network:'none',database,production:false,disposable:true}))
 await checked(await bootstrapSql())
 // Existing synthetic tenant 102 has only an operacional actor. Give that
 // disposable actor the gestor role before 025 so the isolation test exercises
 // an authorized tenant write, rather than failing for unrelated authorization.
 await checked(`UPDATE user_profiles SET role='gestor' WHERE id='${id(8)}'`)
 await checked(await load('../migrations/025_entitlements_quota_hardening.sql'))
 const critical=JSON.parse(await checked(`SELECT jsonb_build_object(
 'tables',(SELECT count(*) FROM unnest(ARRAY['empresas','colaboradores','empresa_limites','empresa_uso','empresa_features']) n WHERE to_regclass('public.'||n) IS NOT NULL),
 'functions',(SELECT count(*) FROM unnest(ARRAY['lock_quota(uuid)','guard_colaborador_write()','guard_commercial_write()','lock_colaborador_statement()','account_colaborador_statement()','account_colaborador_insert()','account_colaborador_delete()','guard_uso_write()']) n WHERE to_regprocedure('engmarq_private.'||n) IS NOT NULL),
 'collaboratorTriggers',(SELECT count(*) FROM pg_trigger WHERE tgrelid='public.colaboradores'::regclass AND tgenabled='O' AND tgname IN ('guard_colaborador_write','lock_colaborador_statement','account_colaborador_insert','account_colaborador_update','account_colaborador_delete','deny_quota_truncate')),
 'quotaTriggers',(SELECT count(*) FROM pg_trigger WHERE tgenabled='O' AND ((tgrelid='public.empresa_uso'::regclass AND tgname='guard_uso_write') OR (tgrelid='public.empresa_limites'::regclass AND tgfoid='engmarq_private.guard_commercial_write()'::regprocedure))))`))
 assert.deepEqual(critical,{tables:5,functions:8,collaboratorTriggers:6,quotaTriggers:2},'025 bootstrap incomplete: missing/disabled quota infrastructure')
 console.log('REAL_POSTGRES_BOOTSTRAP '+JSON.stringify({database,schema:'synthetic Auth/Storage bootstrap; unchanged repository migrations 001-025',migration025Loaded:true,critical,disposable:true}))
})
after(async()=>{if(started){const stop=await command(['stop',name]);assert.equal(stop.code,0,stop.err)}})
const insert=n=>`INSERT INTO colaboradores(id,empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES('${id(n)}','${id(101)}','Concurrency synthetic','${String(n).padStart(11,'0')}','${id(101)}','${id(101)}','2025-01-01')`
async function reset(active){
 await checked(`UPDATE empresa_limites SET ilimitado=true,max_colaboradores_ativos=NULL WHERE empresa_id='${id(101)}';
 DELETE FROM colaboradores WHERE empresa_id='${id(101)}';`)
 for(let n=0;n<active;n++)await checked(insert(3000+n))
 for(const n of [3200,3201])await checked(insert(n)+`;UPDATE colaboradores SET active=false,data_demissao='2026-01-01' WHERE id='${id(n)}';`)
 await checked(`UPDATE empresa_limites SET ilimitado=false,max_colaboradores_ativos=100 WHERE empresa_id='${id(101)}'`)
}
const reactivate=n=>`UPDATE colaboradores SET active=true,data_demissao=NULL WHERE id='${id(n)}'`
const dismiss=n=>`UPDATE colaboradores SET active=false,data_demissao='2026-01-01' WHERE id='${id(n)}'`
const batch=ns=>`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES ${ns.map(n=>`('${id(101)}','Concurrency batch','${String(n).padStart(11,'0')}','${id(101)}','${id(101)}','2025-01-01')`).join(',')}`
async function state(company=101){
 return JSON.parse(await checked(`SELECT jsonb_build_object('company','${id(company)}','limit',l.max_colaboradores_ativos,'unlimited',l.ilimitado,
 'actual',(SELECT count(*) FROM colaboradores WHERE empresa_id=l.empresa_id AND active),'counter',u.colaboradores_ativos)
 FROM empresa_limites l JOIN empresa_uso u USING(empresa_id) WHERE l.empresa_id='${id(company)}'`))
}
const sqlstates=r=>[...r.err.matchAll(/(?:ERROR|FATAL):\s+([A-Z0-9]{5}):/g)].map(m=>m[1])
async function race(a,b,{commercial=false,firstCompletion='COMMIT',isolation='READ COMMITTED',allowedError='P2502'}={}){
 const beforeState=await state()
 const clientInsert=s=>s.replaceAll('colaboradores(id,','colaboradores(').replace(/VALUES\('00000000-0000-4000-8000-\d{12}',/g,'VALUES(')
 const auth=actor=>`SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id(actor)}',true);`
 // Barrier mirrors actual lock order. Commercial UPDATE locks its limit tuple
 // BEFORE empresas; collaborator operations do not acquire a limit tuple lock.
 const firstCommercial=a.startsWith('UPDATE empresa_limites')
 const limitLock=firstCommercial?`SELECT 1 FROM empresa_limites WHERE empresa_id='${id(101)}' FOR UPDATE;`:''
 const first=sql(`SET application_name='quota025_first';BEGIN ISOLATION LEVEL ${isolation};${limitLock}SELECT engmarq_private.lock_quota('${id(101)}');
 SELECT pg_sleep(3);${auth(firstCommercial?1:3)}${clientInsert(a)};${firstCompletion};`)
 let seen=false
 for(let n=0;n<30;n++){
  if((await checked("SELECT count(*) FROM pg_stat_activity WHERE application_name='quota025_first' AND wait_event='PgSleep'"))==='1'){seen=true;break}await delay(10)
 }
 assert.ok(seen,'First transaction never reached lock barrier')
 const second=sql(`SET application_name='quota025_second';BEGIN ISOLATION LEVEL ${isolation};${auth(commercial||b.startsWith('UPDATE empresa_limites')?1:3)}${clientInsert(b)};COMMIT;`)
 let waited=false,lockEvidence
 for(let n=0;n<30;n++){
  const evidence=JSON.parse(await checked(`SELECT coalesce(jsonb_agg(jsonb_build_object('pid',a.pid,'application',a.application_name,'wait_type',a.wait_event_type,'wait_event',a.wait_event,
   'blockers',pg_blocking_pids(a.pid),'locks',(SELECT jsonb_agg(jsonb_build_object('type',l.locktype,'mode',l.mode,'granted',l.granted,'relation',l.relation::regclass::text,'transactionid',l.transactionid::text)) FROM pg_locks l WHERE l.pid=a.pid))),'[]'::jsonb)
   FROM pg_stat_activity a WHERE a.application_name IN ('quota025_first','quota025_second')`))
  const blocker=evidence.find(e=>e.application==='quota025_first'),waiter=evidence.find(e=>e.application==='quota025_second')
  if(blocker&&waiter?.wait_type==='Lock'&&waiter.blockers.includes(blocker.pid)){waited=true;lockEvidence=evidence;break}await delay(10)
 }
 const results=await Promise.all([first,second]);assert.ok(waited,'Second transaction did not exercise lock contention')
 for(const r of results){assert.doesNotMatch(r.err,/40P01|deadlock detected|55P03|57014/);if(r.code!==0)assert.deepEqual(sqlstates(r),[allowedError],r.err)}
 const summary=await checked(`SELECT count(*)||':'||(SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id='${id(101)}')||':'||(SELECT max_colaboradores_ativos FROM empresa_limites WHERE empresa_id='${id(101)}') FROM colaboradores WHERE empresa_id='${id(101)}' AND active`)
 const [actual,counter,limit]=summary.split(':').map(Number);assert.equal(actual,counter);assert.ok(actual<=limit)
 const afterState=await state()
 const evidence={before:beforeState,after:afterState,transactions:results.map((r,i)=>({code:r.code,sqlstates:sqlstates(r),completion:i===0?firstCompletion:'COMMIT'})),lockEvidence}
 console.log('REAL_POSTGRES_RACE '+JSON.stringify(evidence))
 return {results,actual,before:beforeState,after:afterState,lockEvidence}
}
const scenarios=[
 ['99: limit increase + insert',99,`UPDATE empresa_limites SET max_colaboradores_ativos=101 WHERE empresa_id='${id(101)}'`,insert(3300),100,2],
 ['100: dismissal + insert',100,`UPDATE colaboradores SET active=false,data_demissao='2026-01-01' WHERE id='${id(3000)}'`,insert(3300),100,2],
 ['98: concurrent multi-row reactivation',98,`UPDATE colaboradores SET active=true,data_demissao=NULL WHERE id IN ('${id(3200)}','${id(3201)}')`,`UPDATE colaboradores SET active=true,data_demissao=NULL WHERE id IN ('${id(3200)}','${id(3201)}')`,100,2],
 ['99: two inserts',99,insert(3300),insert(3301),100,1],
 ['100: two inserts both rejected',100,insert(3300),insert(3301),100,0],
 ['99: two reactivations',99,reactivate(3200),reactivate(3201),100,1],
 ['99: insert + reactivation',99,insert(3300),reactivate(3200),100,1],
 ['100: dismissal + reactivation',100,dismiss(3000),reactivate(3200),100,2],
 ['99: reactivation + dismissal',99,reactivate(3200),dismiss(3000),99,2],
 ['100: decrease below usage + insert both rejected',100,`UPDATE empresa_limites SET max_colaboradores_ativos=99 WHERE empresa_id='${id(101)}'`,insert(3300),100,0],
 ['99: over-quota single-statement batch + insert',99,batch([3300,3301]),insert(3302),100,1],
 ['98: two fitting atomic batches',98,insert(3300)+';'+insert(3301),insert(3302)+';'+insert(3303),100,1],
 ['99: limit decrease + insert',99,`UPDATE empresa_limites SET max_colaboradores_ativos=99 WHERE empresa_id='${id(101)}'`,insert(3300),99,1],
 ['99: insert + limit decrease',99,insert(3300),`UPDATE empresa_limites SET max_colaboradores_ativos=99 WHERE empresa_id='${id(101)}'`,100,1],
]
for(const [title,count,a,b,expected,success] of scenarios)test('REAL PG 025 '+title,async t=>{
 if(unavailable){if(process.env.REQUIRE_REAL_POSTGRES==='1')assert.fail(unavailable);t.skip(unavailable);return}
 await reset(count);const result=await race(a,b,{commercial:title==='99: insert + limit decrease'})
 assert.equal(result.actual,expected);assert.equal(result.results.filter(r=>r.code===0).length,success)
 assert.equal(result.after.counter,expected)
 const expectedLimit=title==='99: limit increase + insert'?101:title==='99: limit decrease + insert'?99:100
 assert.equal(result.after.limit,expectedLimit)
 t.diagnostic(JSON.stringify({scenario:title,before:result.before,after:result.after,accepted:success,rejected:2-success}))
 if(title==='99: over-quota single-statement batch + insert')assert.equal(await checked("SELECT count(*) FROM colaboradores WHERE cpf IN ('00000003300','00000003301')"),'0','Failed batch must leave no partial insert')
})

test('REAL PG 025 rollback after acquired lock preserves counter and rows',async t=>{
 if(unavailable){if(process.env.REQUIRE_REAL_POSTGRES==='1')assert.fail(unavailable);t.skip(unavailable);return}
 await reset(99)
 await checked(`BEGIN;SELECT engmarq_private.lock_quota('${id(101)}');${insert(3300)};ROLLBACK;`)
 assert.equal(await checked(`SELECT count(*)||':'||(SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id='${id(101)}') FROM colaboradores WHERE empresa_id='${id(101)}' AND active`),'99:99')
 const result=await race(insert(3300),insert(3301),{firstCompletion:'ROLLBACK'})
 assert.equal(result.results.filter(r=>r.code===0).length,2)
 assert.equal(result.actual,100)
 assert.equal(await checked("SELECT count(*) FROM colaboradores WHERE cpf='00000003300'"),'0')
 assert.equal(await checked("SELECT count(*) FROM colaboradores WHERE cpf='00000003301'"),'1')
})
test('REAL PG 025 different tenants do not serialize globally',async t=>{
 if(unavailable){if(process.env.REQUIRE_REAL_POSTGRES==='1')assert.fail(unavailable);t.skip(unavailable);return}
 await reset(99)
 const held=sql(`SET application_name='quota025_independent';BEGIN;SELECT engmarq_private.lock_quota('${id(101)}');SELECT pg_sleep(2);ROLLBACK;`)
 let seen=false
 for(let n=0;n<30;n++){if(await checked("SELECT count(*) FROM pg_stat_activity WHERE application_name='quota025_independent' AND wait_event='PgSleep'")==='1'){seen=true;break}await delay(10)}
 assert.ok(seen)
 await checked(`BEGIN;SET LOCAL lock_timeout='300ms';UPDATE colaboradores SET nome=nome WHERE empresa_id='${id(102)}';COMMIT;`)
 assert.equal((await held).code,0)
})

test('REAL PG 025 retry after quota abort releases all locks and leaves no intermediate state',async t=>{
 if(unavailable){if(process.env.REQUIRE_REAL_POSTGRES==='1')assert.fail(unavailable);t.skip(unavailable);return}
 await reset(100)
 const before=await state()
 const result=await race(insert(3300),insert(3301))
 assert.equal(result.results.filter(r=>r.code===0).length,0)
 assert.deepEqual(await state(),before)
 await checked(`BEGIN;SET LOCAL lock_timeout='300ms';${dismiss(3000)};COMMIT;`)
 await checked(`BEGIN;SET LOCAL lock_timeout='300ms';SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id(3)}',true);
 INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES('${id(101)}','Retry','00000003300','${id(101)}','${id(101)}','2025-01-01');COMMIT;`)
 assert.deepEqual(await state(),before)
 assert.equal(await checked("SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('quota025_first','quota025_second')"),'0')
})

test('REAL PG 025 REPEATABLE READ serialization failure aborts safely without divergent counter',async t=>{
 if(unavailable){if(process.env.REQUIRE_REAL_POSTGRES==='1')assert.fail(unavailable);t.skip(unavailable);return}
 await reset(99)
 const result=await race(insert(3300),insert(3301),{isolation:'REPEATABLE READ',allowedError:'40001'})
 assert.equal(result.results.filter(r=>r.code===0).length,1)
 assert.equal(result.actual,100)
 assert.equal(result.after.counter,100)
 assert.equal(await checked("SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('quota025_first','quota025_second')"),'0')
})

test('REAL PG 025 independent tenants allocate their own last slot concurrently; no global quota/lost update',async t=>{
 if(unavailable){if(process.env.REQUIRE_REAL_POSTGRES==='1')assert.fail(unavailable);t.skip(unavailable);return}
 await reset(99)
 const otherBefore=await state(102)
 await checked(`UPDATE empresa_limites SET ilimitado=false,max_colaboradores_ativos=${otherBefore.actual+1} WHERE empresa_id='${id(102)}'`)
 const a=sql(`SET application_name='quota025_tenant1';BEGIN;SELECT engmarq_private.lock_quota('${id(101)}');SELECT pg_sleep(3);
 SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id(3)}',true);
 INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES('${id(101)}','Tenant1','00000003300','${id(101)}','${id(101)}','2025-01-01');COMMIT;`)
 let seen=false
 for(let n=0;n<30;n++){if(await checked("SELECT count(*) FROM pg_stat_activity WHERE application_name='quota025_tenant1' AND wait_event='PgSleep'")==='1'){seen=true;break}await delay(10)}
 assert.ok(seen)
 const b=await sql(`BEGIN;SET LOCAL lock_timeout='300ms';SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id(8)}',true);
 INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES('${id(102)}','Tenant2','00000004300','${id(102)}','${id(102)}','2025-01-01');COMMIT;`)
 assert.equal(b.code,0,b.err);assert.equal((await a).code,0)
 const [one,two]=await Promise.all([state(101),state(102)])
 assert.equal(one.actual,100);assert.equal(one.counter,100)
 assert.equal(two.actual,otherBefore.actual+1);assert.equal(two.counter,two.actual)
 assert.equal(two.limit,two.actual)
 t.diagnostic(JSON.stringify({tenant1:one,tenant2:two,transactionsAccepted:2}))
})

test('REAL PG 025 trusted multi-tenant maintenance prelocks in deterministic UUID order despite reverse row order',async t=>{
 if(unavailable){if(process.env.REQUIRE_REAL_POSTGRES==='1')assert.fail(unavailable);t.skip(unavailable);return}
 await reset(99)
 const before=[await state(101),await state(102)]
 const ordered=[101,102].map(n=>`SELECT engmarq_private.lock_quota('${id(n)}');`).join('')
 const a=sql(`SET application_name='quota025_order_first';BEGIN;${ordered}SELECT pg_sleep(3);
 UPDATE colaboradores SET nome=nome||' A' WHERE id IN ('${id(3000)}','${id(202)}');COMMIT;`)
 let seen=false
 for(let n=0;n<30;n++){if(await checked("SELECT count(*) FROM pg_stat_activity WHERE application_name='quota025_order_first' AND wait_event='PgSleep'")==='1'){seen=true;break}await delay(10)}
 assert.ok(seen)
 const b=sql(`SET application_name='quota025_order_second';BEGIN;${ordered}
 UPDATE colaboradores SET nome=nome||' B' WHERE id='${id(202)}';UPDATE colaboradores SET nome=nome||' B' WHERE id='${id(3000)}';COMMIT;`)
 let waited=false
 for(let n=0;n<30;n++){if(await checked("SELECT count(*) FROM pg_stat_activity s JOIN pg_stat_activity f ON f.application_name='quota025_order_first' WHERE s.application_name='quota025_order_second' AND f.pid=ANY(pg_blocking_pids(s.pid))")==='1'){waited=true;break}await delay(10)}
 const results=await Promise.all([a,b]);assert.ok(waited,'No real multi-tenant lock contention observed')
 for(const result of results){assert.equal(result.code,0,result.err);assert.doesNotMatch(result.err,/40P01|40001|55P03|57014/)}
 assert.deepEqual([await state(101),await state(102)],before)
 assert.equal(await checked(`SELECT count(*) FROM colaboradores WHERE id IN ('${id(3000)}','${id(202)}') AND nome LIKE '% A B'`),'2','Both writes must survive serialization; no lost update')
 t.diagnostic(JSON.stringify({orderedCompanyIds:[id(101),id(102)],before,after:before,transactionsAccepted:2}))
})
