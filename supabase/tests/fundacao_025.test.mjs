import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fundacaoFixture,migrate,id,load,actor,dataSnapshot} from './fundacao-fixture.mjs'
import {withBaseline} from './025_postflight_baseline.mjs'
const fixture=async(options)=>{const db=await fundacaoFixture(true,options);await migrate(db,'025_entitlements_quota_hardening.sql');return db}
const insert=(n)=>`INSERT INTO colaboradores(id,empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES('${id(n)}','${id(101)}','Quota employee','${String(n).padStart(11,'0')}','${id(101)}','${id(101)}','2025-01-01')`
const usage=async(db)=>(await db.query(`SELECT colaboradores_ativos::int n FROM empresa_uso WHERE empresa_id='${id(101)}'`)).rows[0].n
const quota=async(db,n=100)=>db.exec(`UPDATE empresa_limites SET ilimitado=false,max_colaboradores_ativos=${n} WHERE empresa_id='${id(101)}'`)
const fail=code=>e=>e.code===code

for(const legacyEpi of [true,false])test(`025 preservation, exact contracts, real baseline required; optional EPI=${legacyEpi}`,async()=>{
 const db=await fundacaoFixture(true,{legacyEpi})
 try{
  const before=await dataSnapshot(db)
  const pre=(await db.exec(await load('025_fundacao_preflight_readonly.sql'))).flatMap(r=>r.rows??[])
  assert.deepEqual(pre.filter(r=>r.STATUS==='BLOQUEIO'),[])
  const fullPre=(await db.exec(await load('025_baseline_pre025_export_readonly.sql'))).flatMap(r=>r.rows??[])
  await migrate(db,'025_entitlements_quota_hardening.sql')
  assert.deepEqual(await dataSnapshot(db),before)
  const sql=await load('025_fundacao_postflight_readonly.sql')
  const empty=(await db.exec(sql)).flatMap(r=>r.rows??[])
  assert.ok(empty.some(r=>r.STATUS==='BLOQUEIO'))
  const rows=(await db.exec(withBaseline(sql,fullPre))).flatMap(r=>r.rows??[])
  assert.deepEqual(rows.filter(r=>r.STATUS==='BLOQUEIO'),[])
  assert.throws(()=>withBaseline(sql,pre.filter(r=>r.CHECK!=='Preservação: empresas')))
  await db.exec(`ALTER POLICY feature_guard ON public.user_profiles USING(true)`)
  const drift=(await db.exec(withBaseline(sql,fullPre))).flatMap(r=>r.rows??[])
  assert.ok(drift.some(r=>r.STATUS==='BLOQUEIO'))
 }finally{await db.close()}
})

test('025 explicit legacy backfill preserves previous commercial decisions and future denies missing grants',async()=>{
 const db=await fundacaoFixture(true)
 try{
  await db.exec(`INSERT INTO empresa_features VALUES('${id(101)}','exames',false);
   INSERT INTO empresa_limites(empresa_id,max_colaboradores_ativos) VALUES('${id(101)}',100)`)
  await migrate(db,'025_entitlements_quota_hardening.sql')
  assert.equal((await db.query(`SELECT enabled FROM empresa_features WHERE empresa_id='${id(101)}' AND feature_key='exames'`)).rows[0].enabled,false)
  assert.equal((await db.query('SELECT count(*)::int n FROM engmarq_private.fundacao_025_legado')).rows[0].n,3)
  await db.exec(`INSERT INTO empresas(id,razao_social,cnpj) VALUES('${id(104)}','Future deny','33.000.167/0001-01')`)
  assert.equal((await db.query(`SELECT count(*)::int n FROM empresa_features WHERE empresa_id='${id(104)}'`)).rows[0].n,0)
  await actor(db,3,async()=>{
   assert.equal((await db.query(`SELECT engmarq_private.has_empresa_feature('${id(101)}','treinamentos') ok`)).rows[0].ok,false)
   assert.equal((await db.query(`SELECT engmarq_private.has_empresa_feature('${id(104)}','treinamentos') ok`)).rows[0].ok,false)
  })
 }finally{await db.close()}
})

test('025 quota 99/100/101, dismissal, reactivation, atomic import and rollback',async()=>{
 const db=await fixture()
 try{
  await quota(db)
  for(let n=2000;n<2098;n++)await db.exec(insert(n))
  assert.equal(await usage(db),99)
  await db.exec(insert(2098));assert.equal(await usage(db),100)
  await assert.rejects(db.exec(insert(2099)),fail('P2502'));assert.equal(await usage(db),100)
  await db.exec(`UPDATE colaboradores SET active=false,data_demissao='2026-01-01' WHERE id='${id(201)}'`)
  assert.equal(await usage(db),99)
  await actor(db,3,async()=>{await db.exec(`UPDATE colaboradores SET active=true,data_demissao=NULL WHERE id='${id(201)}'`);assert.equal(await usage(db),100)})
  assert.equal(await usage(db),99)
  await db.exec(insert(2099))
  await actor(db,3,async()=>{await assert.rejects(db.exec(`UPDATE colaboradores SET active=true,data_demissao=NULL WHERE id='${id(201)}'`),fail('P2502'))})
  await assert.rejects(quota(db,99),fail('P2502'))
  await db.exec(`UPDATE colaboradores SET active=false,data_demissao='2026-01-01' WHERE id='${id(2099)}'`)
  const batch=insert(2100).replace(/;?$/,';')+insert(2101)
  await db.exec('BEGIN');await assert.rejects(db.exec(batch),fail('P2502'));await db.exec('ROLLBACK')
  assert.equal(await usage(db),99)
  await db.exec('BEGIN');await db.exec(insert(2102));await db.exec('ROLLBACK');assert.equal(await usage(db),99)
  assert.equal((await db.query(`SELECT count(*)::int n FROM colaboradores WHERE empresa_id='${id(101)}' AND active`)).rows[0].n,99)
  await actor(db,3,async()=>{await assert.rejects(db.exec(`UPDATE empresa_uso SET colaboradores_ativos=0 WHERE empresa_id='${id(101)}'`),fail('42501'))})
 }finally{await db.close()}
})

for(const user of [1,5,7,9])test(`025 Admin/operational/inactive/suspended ${user} cannot write employees`,async()=>{
 const db=await fixture()
 try{await actor(db,user,async()=>{await assert.rejects(db.exec(insert(2300)))})}finally{await db.close()}
})

test('025 direct RLS isolates tenants and gates modules; Free dependencies and logos remain',async()=>{
 const db=await fixture()
 try{
  await db.exec(`UPDATE empresa_features SET enabled=false WHERE empresa_id='${id(101)}' AND feature_key IN ('treinamentos','exames','documentos','relatorios.sst')`)
  await actor(db,3,async()=>{
   assert.equal((await db.query('SELECT * FROM colaboradores')).rows.length,1)
   for(const t of ['funcoes','setores','ambientes'])assert.equal((await db.query(`SELECT * FROM ${t}`)).rows.length,1)
   for(const t of ['documentos','treinamentos','matriz_treinamentos','exames_catalogo','treinamento_tipos'])assert.equal((await db.query(`SELECT * FROM ${t}`)).rows.length,0)
   assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id IN ('documentos','assinaturas')")).rows.length,0)
   assert.equal((await db.query(`SELECT engmarq_private.can_use_documento_object('${id(102)}/a.pdf',false) ok`)).rows[0].ok,false)
   await db.exec(insert(2400).replace('colaboradores(id,','colaboradores(').replace(`'${id(2400)}',`,''))
  })
  await actor(db,3,async()=>{await db.exec(`INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES('${id(2401)}','logos','${id(101)}/logo.png','{"mimetype":"image/png","size":9}')`)})
  await db.exec(`UPDATE empresa_features SET enabled=false WHERE empresa_id='${id(101)}' AND feature_key='colaboradores.gestao'`)
  await actor(db,3,async()=>{assert.equal((await db.query('SELECT * FROM colaboradores')).rows.length,0);await assert.rejects(db.exec(insert(2400)))})
 }finally{await db.close()}
})

test('025 Storage module reservation cannot be relabelled to bypass paid feature',async()=>{
 const db=await fixture()
 try{
  await db.exec(`UPDATE empresa_features SET enabled=false WHERE empresa_id='${id(101)}' AND feature_key IN ('documentos','treinamentos')`)
  await actor(db,3,async()=>{
   const path=(await db.query("SELECT public.reservar_arquivo_sst('exames','pdf') path")).rows[0].path
   await db.query('INSERT INTO storage.objects VALUES($1,$2,$3,$4)',[id(2500),'documentos',path,{mimetype:'application/pdf',size:9}])
   assert.equal((await db.query('SELECT engmarq_private.can_use_documento_object($1,false) ok',[path])).rows[0].ok,true)
   assert.equal((await db.query(`SELECT engmarq_private.can_use_documento_object('${id(101)}/unclassified.pdf',true) ok`)).rows[0].ok,false)
  })
  for(const role of ['anon','authenticated','service_role'])await actor(db,3,async()=>{
   await assert.rejects(db.exec(`SELECT engmarq_private.reconciliar_uso('${id(101)}')`),fail('42501'))
  },role)
  await actor(db,3,async()=>{await assert.rejects(db.exec('SELECT * FROM fichas_epi'),fail('42501'))})
 }finally{await db.close()}
})

test('025 future tenant owns no inherited grants; explicit Free configuration enforces 100 active',async()=>{
 const db=await fixture()
 try{
  await db.exec(`INSERT INTO empresas(id,razao_social,cnpj) VALUES('${id(104)}','Future synthetic','33.000.167/0001-01');
   INSERT INTO auth.users VALUES('${id(11)}');
   INSERT INTO user_profiles(id,email,full_name,role,empresa_id,active) VALUES('${id(11)}','future@example.com','Future','empresa','${id(104)}',true)`)
  await actor(db,11,async()=>{
   assert.equal((await db.query(`SELECT engmarq_private.has_empresa_feature('${id(104)}','colaboradores.gestao') ok`)).rows[0].ok,false)
   assert.equal((await db.query('SELECT * FROM colaboradores')).rows.length,0)
  })
  await db.exec(`INSERT INTO empresa_comercial(empresa_id,origem) VALUES('${id(104)}','autocadastro');
   INSERT INTO empresa_limites(empresa_id,max_colaboradores_ativos) VALUES('${id(104)}',100);
   INSERT INTO empresa_uso(empresa_id,colaboradores_ativos,apurado_em) VALUES('${id(104)}',0,clock_timestamp());
   INSERT INTO empresa_features(empresa_id,feature_key,enabled) SELECT '${id(104)}',feature_key,feature_key IN ('empresa.cadastro','usuarios.gestao','colaboradores.gestao') FROM features;
   INSERT INTO funcoes(id,empresa_id,nome) VALUES('${id(104)}','${id(104)}','Synthetic');
   INSERT INTO setores(id,empresa_id,nome) VALUES('${id(104)}','${id(104)}','Synthetic')`)
  await actor(db,11,async()=>{
   for(const key of ['treinamentos','exames','documentos','epi','relatorios.sst'])assert.equal((await db.query(`SELECT engmarq_private.can_use_feature('${id(104)}',$1) ok`,[key])).rows[0].ok,false)
   assert.equal((await db.query('SELECT * FROM funcoes')).rows.length,1)
   await db.exec(`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao)
    SELECT '${id(104)}','Synthetic',lpad(n::text,11,'0'),'${id(104)}','${id(104)}','2025-01-01'::date FROM generate_series(1,100)n`)
   assert.equal((await db.query('SELECT colaboradores_ativos::int n FROM empresa_uso')).rows[0].n,100)
   await assert.rejects(db.exec(`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES('${id(104)}','Synthetic','00000000101','${id(104)}','${id(104)}','2025-01-01')`),fail('P2502'))
  })
  assert.equal((await db.query(`SELECT colaboradores_ativos::int n FROM empresa_uso WHERE empresa_id='${id(104)}'`)).rows[0].n,0)
 }finally{await db.close()}
})

test('025 inconsistent stored usage blocks migration atomically instead of silently repairing legacy data',async()=>{
 const db=await fundacaoFixture(true)
 try{
  await db.exec(`INSERT INTO empresa_uso(empresa_id,colaboradores_ativos,apurado_em) VALUES('${id(101)}',0,clock_timestamp())`)
  await assert.rejects(migrate(db,'025_entitlements_quota_hardening.sql'),/inconsistent/)
  await db.exec('ROLLBACK')
  assert.equal((await db.query("SELECT to_regclass('engmarq_private.fundacao_025_legado') relation")).rows[0].relation,null)
  assert.equal((await db.query('SELECT count(*)::int n FROM empresa_features')).rows[0].n,0)
 }finally{await db.close()}
})
