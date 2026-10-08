import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import {fundacaoFixture,migrate,id,actor} from './fundacao-fixture.mjs'
let db
before(async()=>{db=await fundacaoFixture(true);await migrate(db,'025_entitlements_quota_hardening.sql')})
after(async()=>await db?.close())
const employee=(tenant=101,func=101)=>`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) VALUES('${id(tenant)}','Attack','00000009999','${id(func)}','${id(tenant)}','2025-01-01')`
const denied=e=>['42501','P2501','P2502','P2503','P2504','P2505','P2506','23503'].includes(e.code)
for(const [name,sql] of [
 ['foreign tenant INSERT',employee(102)],
 ['foreign catalog reference',employee(101,102)],
 ['foreign tenant UPDATE',`UPDATE colaboradores SET empresa_id='${id(102)}' WHERE id='${id(201)}'`],
 ['direct lock RPC',`SELECT engmarq_private.lock_quota('${id(102)}')`],
 ['direct storage classification RPC',`SELECT engmarq_private.storage_features('${id(102)}/synthetic4.pdf')`],
 ['forged storage path',`INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES('${id(9001)}','documentos','${id(102)}/forged.pdf','{"mimetype":"application/pdf","size":9}')`],
 ['foreign arquivo_path',`UPDATE documentos SET arquivo_path='${id(102)}/synthetic4.pdf' WHERE empresa_id='${id(101)}'`],
])test('ADVERSARIAL 025 '+name,async()=>actor(db,3,async()=>assert.rejects(db.exec(sql),denied)))
for(const mode of ['OFF','absent'])for(const surface of ['collaborator','RPC','logo UPDATE','logo DELETE'])test(`ADVERSARIAL 025 ${mode} ${surface}`,async()=>{
 await db.exec('BEGIN')
 try{
  const key=surface==='collaborator'?'colaboradores.gestao':surface==='RPC'?'exames':'empresa.cadastro'
  if(surface.startsWith('logo'))await db.exec(`INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES('${id(9002)}','logos','${id(101)}/logo.png','{"mimetype":"image/png","size":9}')`)
  await db.query(mode==='OFF'?'UPDATE empresa_features SET enabled=false WHERE empresa_id=$1 AND feature_key=$2':'DELETE FROM empresa_features WHERE empresa_id=$1 AND feature_key=$2',[id(101),key])
  await db.exec('SET LOCAL ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(3)])
  if(surface==='collaborator')await assert.rejects(db.exec(employee()),denied)
  else if(surface==='RPC')await assert.rejects(db.exec("SELECT reservar_arquivo_sst('exames','pdf')"),denied)
  else if(surface==='logo UPDATE')assert.equal((await db.query("UPDATE storage.objects SET metadata=metadata WHERE bucket_id='logos' RETURNING id")).rows.length,0)
  else assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='logos' RETURNING id")).rows.length,0)
 }finally{await db.exec('ROLLBACK')}
})
for(const user of [1,5,7,9])test(`ADVERSARIAL 025 direct reactivation forbidden actor ${user}`,async()=>actor(db,user,async()=>{
 assert.equal((await db.query(`UPDATE colaboradores SET active=true,data_demissao=NULL WHERE id='${id(201)}' RETURNING id`)).rows.length,0)
 assert.equal((await db.query(`SELECT * FROM storage.objects WHERE bucket_id='documentos' AND name='${id(102)}/synthetic4.pdf'`)).rows.length,0)
}))
test('ADVERSARIAL 025 unknown feature and UUID B cannot open module A',async()=>actor(db,3,async()=>{
 for(const [company,key] of [[101,'unknown'],[102,'exames']])assert.equal((await db.query('SELECT engmarq_private.can_use_feature($1,$2) ok',[id(company),key])).rows[0].ok,false)
 assert.equal((await db.query(`SELECT * FROM documentos WHERE id='${id(904)}'`)).rows.length,0)
}))
test('ADVERSARIAL 025 materialized counter below real cannot authorize extra employee',async()=>{
 await db.exec('BEGIN')
 try{
  await db.exec(`UPDATE empresa_limites SET ilimitado=false,max_colaboradores_ativos=1 WHERE empresa_id='${id(101)}'; UPDATE empresa_uso SET colaboradores_ativos=0 WHERE empresa_id='${id(101)}'`)
  await assert.rejects(db.exec(employee()),e=>e.code==='P2502')
 }finally{await db.exec('ROLLBACK')}
})
test('ADVERSARIAL 025 divergent usage fails atomically even below ceiling',async()=>{
 await db.exec('BEGIN')
 try{
  await db.exec(`UPDATE empresa_uso SET colaboradores_ativos=0 WHERE empresa_id='${id(101)}'`)
  await assert.rejects(db.exec(employee()),e=>e.code==='P2506')
 }finally{await db.exec('ROLLBACK')}
})
test('ADVERSARIAL 025 ON CONFLICT DO NOTHING does not increment counter',async()=>{
 await db.exec('BEGIN')
 try{
  await db.exec(`INSERT INTO colaboradores SELECT * FROM colaboradores WHERE id='${id(201)}' ON CONFLICT DO NOTHING`)
  assert.equal((await db.query(`SELECT colaboradores_ativos::int n FROM empresa_uso WHERE empresa_id='${id(101)}'`)).rows[0].n,1)
 }finally{await db.exec('ROLLBACK')}
})
for(const type of ['INSERT','UPDATE'])test(`ADVERSARIAL 025 multi-row ${type} rejects crossing quota atomically`,async()=>{
 await db.exec('BEGIN')
 try{
  await db.exec(`UPDATE empresa_limites SET ilimitado=false,max_colaboradores_ativos=3 WHERE empresa_id='${id(101)}'`)
  if(type==='UPDATE')await db.exec(`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao,active,data_demissao) SELECT '${id(101)}','Attack',lpad(n::text,11,'0'),'${id(101)}','${id(101)}','2025-01-01'::date,false,'2026-01-01'::date FROM generate_series(9200,9202)n`)
  await db.exec('SAVEPOINT attack')
  const sql=type==='INSERT'?`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao) SELECT '${id(101)}','Attack',lpad(n::text,11,'0'),'${id(101)}','${id(101)}','2025-01-01'::date FROM generate_series(9300,9302)n`:`UPDATE colaboradores SET active=true,data_demissao=NULL WHERE empresa_id='${id(101)}' AND NOT active`
  await assert.rejects(db.exec(sql),e=>e.code==='P2502');await db.exec('ROLLBACK TO SAVEPOINT attack')
  assert.equal((await db.query(`SELECT count(*)::int n FROM colaboradores WHERE empresa_id='${id(101)}' AND active`)).rows[0].n,1)
  assert.equal((await db.query(`SELECT colaboradores_ativos::int n FROM empresa_uso WHERE empresa_id='${id(101)}'`)).rows[0].n,1)
 }finally{await db.exec('ROLLBACK')}
})
test('ADVERSARIAL 025 configured Free/partial tenants receive no missing paid grants or EPI records',async()=>{
 const local=await fundacaoFixture(true)
 try{
  await local.exec(`INSERT INTO empresa_comercial(empresa_id,origem) VALUES('${id(101)}','autocadastro'); INSERT INTO empresa_features VALUES('${id(101)}','colaboradores.gestao',true); INSERT INTO empresa_limites(empresa_id,max_colaboradores_ativos) VALUES('${id(101)}',100)`)
  await migrate(local,'025_entitlements_quota_hardening.sql')
  assert.deepEqual((await local.query(`SELECT feature_key FROM empresa_features WHERE empresa_id='${id(101)}'`)).rows.map(r=>r.feature_key),['colaboradores.gestao'])
  assert.equal((await local.query("SELECT count(*)::int n FROM empresa_features WHERE feature_key='epi'")).rows[0].n,0)
 }finally{await local.close()}
})

test('ADVERSARIAL 025 configured tenant without limit cannot inherit unlimited',async()=>{
 const local=await fundacaoFixture(true)
 try{
  await local.exec(`INSERT INTO empresa_features VALUES('${id(101)}','colaboradores.gestao',true)`)
  await assert.rejects(migrate(local,'025_entitlements_quota_hardening.sql'),/configured tenant has no explicit limit/)
  await local.exec('ROLLBACK')
 }finally{await local.close()}
})
import {load} from './fundacao-fixture.mjs'
import {withBaseline} from './025_postflight_baseline.mjs'
test('ADVERSARIAL 025 unexpected public SECURITY DEFINER blocks preflight',async()=>{
 const local=await fundacaoFixture(true)
 try{
  await local.exec(`CREATE FUNCTION public.unexpected_bypass() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`)
  const rows=(await local.exec(await load('025_fundacao_preflight_readonly.sql'))).flatMap(r=>r.rows??[])
  assert.ok(rows.some(r=>r.STATUS==='BLOQUEIO'&&r.CHECK.includes('unexpected_bypass')))
 }finally{await local.close()}
})
test('ADVERSARIAL 025 preflight blocks configured missing limit and lists proposed grants',async()=>{
 const local=await fundacaoFixture(true)
 try{
  await local.exec(`INSERT INTO empresa_features VALUES('${id(101)}','colaboradores.gestao',true)`)
  const rows=(await local.exec(await load('025_fundacao_preflight_readonly.sql'))).flatMap(r=>r.rows??[])
  assert.ok(rows.some(r=>r.STATUS==='BLOQUEIO'&&r.CHECK==='Empresa configurada sem limite explícito'))
  const details=rows.find(r=>r.CHECK===`Empresa afetada pelo backfill: ${id(101)}`).DETALHES
  assert.equal(details.elegivel_concessao_legada,false);assert.deepEqual(details.concessoes_propostas,[])
 }finally{await local.close()}
})
test('ADVERSARIAL 025 changed pre-migration fingerprint cannot pass postflight',async()=>{
 const local=await fundacaoFixture(true)
 try{
  const pre=(await local.exec(await load('025_baseline_pre025_export_readonly.sql'))).flatMap(r=>r.rows??[])
  await migrate(local,'025_entitlements_quota_hardening.sql')
  await local.exec(`UPDATE colaboradores SET nome='Unexpected drift' WHERE id='${id(201)}'`)
  const rows=(await local.exec(withBaseline(await load('025_fundacao_postflight_readonly.sql'),pre))).flatMap(r=>r.rows??[])
  assert.ok(rows.some(r=>r.STATUS==='BLOQUEIO'&&r.CHECK==='Preservação: colaboradores'))
 }finally{await local.close()}
})
