import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import {fundacaoFixture,migrate,id,actor,load} from './fundacao-fixture.mjs'
let db,pgr
before(async()=>{
 db=await fundacaoFixture(true);await migrate(db,'025_entitlements_quota_hardening.sql')
 for(const company of [101,102,103])await db.exec(`
 INSERT INTO treinamentos(id,empresa_id,colaborador_id,treinamento_tipo_id,data_realizacao)
 VALUES('${id(company+200)}','${id(company)}','${id(company+100)}',(SELECT id FROM treinamento_tipos LIMIT 1),'2025-01-01');
 INSERT INTO documentos(id,empresa_id,tipo_id,titulo,colaborador_id,subtipo_exame)
 VALUES('${id(company+300)}','${id(company)}',(SELECT id FROM documento_tipos WHERE nome='ASO'),'Synthetic ASO','${id(company+100)}','admissional');`)
 pgr=(await db.query("SELECT id FROM documento_tipos WHERE nome='PGR'")).rows[0].id
 await db.exec(`ALTER TABLE auth.users ADD COLUMN email text;
 INSERT INTO auth.users(id,email) VALUES('${id(4100)}','synthetic-new@example.com')`)
})
after(async()=>await db?.close())
const denied=e=>e.code==='42501'
for(const [user,company,read,write] of [[1,101,false,false],[3,101,true,true],[4,101,true,true],[5,101,true,false],[7,101,false,false],[8,102,true,false],[9,103,false,false]]){
 test(`025 explicit legacy access, tenant and role ${user}`,async()=>actor(db,user,async()=>{
  for(const table of ['colaboradores','treinamentos','documentos']){
   const rows=(await db.query(`SELECT empresa_id FROM ${table}`)).rows
   assert.equal(rows.length>0,read)
   assert.ok(rows.every(r=>r.empresa_id===id(company)))
  }
  const rows=(await db.query(`UPDATE colaboradores SET nome='Authorized' WHERE empresa_id='${id(company)}' RETURNING id`)).rows
  assert.equal(rows.length>0,write)
 }))
}
for(const [feature,table] of [['colaboradores.gestao','colaboradores'],['colaboradores.gestao','funcoes'],['treinamentos','treinamentos'],['exames','exames_catalogo'],['documentos','documentos'],['relatorios.sst','vw_dashboard_treinamentos']]){
 test(`025 OFF entitlement hides ${table} even through direct SQL`,async()=>{
  await db.exec('BEGIN')
  try{
   await db.query('UPDATE empresa_features SET enabled=false WHERE empresa_id=$1 AND feature_key=$2',[id(101),feature])
   await db.exec('SET LOCAL ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(3)])
   const rows=(await db.query(`SELECT * FROM ${table}${table==='documentos'?` WHERE tipo_id='${pgr}'`:''}`)).rows
   assert.equal(rows.length,0)
  }finally{await db.exec('ROLLBACK')}
 })
}
test('025 altered employee tenant cannot move quota or read foreign rows',async()=>actor(db,3,async()=>{
 assert.equal((await db.query(`UPDATE colaboradores SET nome='Foreign' WHERE id='${id(202)}' RETURNING id`)).rows.length,0)
 await assert.rejects(db.query(`UPDATE colaboradores SET empresa_id='${id(102)}' WHERE id='${id(201)}'`),denied)
}))
test('025 technical tenant mutation also rejected by quota trigger',async()=>{
 await assert.rejects(db.exec(`UPDATE colaboradores SET empresa_id='${id(102)}' WHERE id='${id(201)}'`),e=>e.code==='P2503')
})
test('025 technical counter mutation and truncation are protected',async()=>{
 for(const role of ['anon','authenticated','service_role'])await actor(db,3,async()=>{
  await assert.rejects(db.exec(`UPDATE empresa_uso SET colaboradores_ativos=0`),denied)
 },role)
 await assert.rejects(db.exec('TRUNCATE colaboradores CASCADE'),denied)
})
test('025 owner-only reconciliation verifies authoritative employee count',async()=>{
 assert.equal((await db.query(`SELECT engmarq_private.reconciliar_uso('${id(101)}') n`)).rows[0].n,1)
})
for(const role of ['anon','authenticated'])test(`025 internal provisioning RPC unavailable to ${role}`,async()=>actor(db,3,async()=>{
 await assert.rejects(db.exec(`SELECT public.provisionar_perfil_interno('${id(3)}','${id(4100)}','New','gestor')`),denied)
},role))
test('025 internal service RPC rechecks real actor, derives tenant and preserves internal-user flow',async()=>actor(db,3,async()=>{
 await db.exec(`SELECT public.provisionar_perfil_interno('${id(3)}','${id(4100)}','New','gestor')`)
 const row=(await db.query(`SELECT * FROM user_profiles WHERE id='${id(4100)}'`)).rows[0]
 assert.equal(row.empresa_id,id(101));assert.equal(row.active,true);assert.equal(row.role,'gestor')
},'service_role'))
for(const user of [1,5,7,9])test(`025 service RPC rejects ineligible actor ${user}`,async()=>actor(db,3,async()=>{
 await assert.rejects(db.exec(`SELECT public.provisionar_perfil_interno('${id(user)}','${id(4100)}','New','gestor')`),denied)
},'service_role'))
test('025 ASO reservation cannot bind a general SST document even with both grants ON',async()=>actor(db,3,async()=>{
 const path=(await db.query("SELECT reservar_arquivo_sst('exames','pdf') path")).rows[0].path
 await db.query(`INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES($1,'documentos',$2,'{"mimetype":"application/pdf","size":9}')`,[id(4200),path])
 await assert.rejects(db.query(`INSERT INTO documentos(empresa_id,tipo_id,titulo,arquivo_path) VALUES($1,(SELECT id FROM documento_tipos WHERE nome='PGR'),'Wrong module',$2)`,[id(101),path]),denied)
}))
test('025 signature objects and EPI grants cannot be used by authenticated or anonymous',async()=>{
 for(const role of ['authenticated','anon'])await actor(db,3,async()=>{
  assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='assinaturas'")).rows.length,0)
  await assert.rejects(db.query('SELECT * FROM fichas_epi'),denied)
 },role)
})
test('025 reactivation records original dismissal history transactionally',async()=>actor(db,3,async()=>{
 await db.exec(`UPDATE colaboradores SET active=false,data_demissao='2026-01-01' WHERE id='${id(201)}';
 UPDATE colaboradores SET active=true,data_demissao=NULL WHERE id='${id(201)}'`)
 await db.exec('RESET ROLE')
 const rows=(await db.query(`SELECT * FROM engmarq_private.colaborador_transicoes WHERE colaborador_id='${id(201)}' ORDER BY id`)).rows
 assert.equal(rows.length,2);assert.equal(rows[1].demissao_antes.toISOString().slice(0,10),'2026-01-01');assert.equal(rows[1].demissao_depois,null)
}))
