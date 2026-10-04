import assert from 'node:assert/strict'
import {describe,test,before,after} from 'node:test'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fundacaoFixture,migrate,id,load,actor,dataSnapshot} from './fundacao-fixture.mjs'
import {comparePreservation,requiredPreservationChecks} from './024_compare_preservation.mjs'
const report=async(db,stage)=>(await db.exec(await load(`024_fundacao_${stage}_readonly.sql`))).flatMap(r=>r.rows??[])
const denied=e=>e.code==='42501'
const invalid=e=>e.code==='23514'

test('024 pre/post are read-only, preserve all legacy data/Storage and grant no legacy Free',async()=>{
 const db=await fundacaoFixture()
 try {
  const before=await dataSnapshot(db)
  const pre=await report(db,'preflight')
  assert.deepEqual(pre.filter(r=>r.STATUS==='BLOQUEIO'),[])
  await migrate(db,'024_fundacao_comercial.sql')
  const after=await dataSnapshot(db)
  after[0]=after[0].map(({cnpj_canonico,cep,logradouro,numero,complemento,bairro,...row})=>{
   for(const address of [cep,logradouro,numero,complemento,bairro])assert.equal(address,null)
   assert.ok(cnpj_canonico);return row
  })
  assert.deepEqual(after,before)
  const post=await report(db,'postflight')
  assert.deepEqual(post.filter(r=>r.STATUS==='BLOQUEIO'),[])
  const fingerprints=rows=>rows.filter(r=>r.CHECK?.startsWith('Preservação:')).map(({CHECK,RESULTADO,STATUS})=>({CHECK,RESULTADO,STATUS})).sort((a,b)=>a.CHECK.localeCompare(b.CHECK))
  assert.deepEqual(fingerprints(post),fingerprints(pre))
  for(const table of ['empresa_comercial','empresa_features','empresa_limites','empresa_uso','empresa_diagnostico_sst','auditoria_comercial','engmarq_private.onboarding_solicitacoes'])
   assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*)::int n FROM features')).rows[0].n,8)
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='colaboradores'::regclass AND NOT tgisinternal")).rows[0].n,1)
 }finally{await db.close()}
})

describe('024 SQL/RLS foundation contracts',()=>{
 let db
 before(async()=>{
  db=await fundacaoFixture(true)
  // Explicit synthetic assignments, never migration backfill.
  for(const company of [101,102,103]){
   await db.query("INSERT INTO empresa_comercial(empresa_id,origem) VALUES($1,'legado')",[id(company)])
   await db.query("INSERT INTO empresa_features VALUES($1,'colaboradores.gestao',true)",[id(company)])
   await db.query('INSERT INTO empresa_limites(empresa_id,max_colaboradores_ativos) VALUES($1,100)',[id(company)])
   await db.query('INSERT INTO empresa_uso VALUES($1,1,clock_timestamp())',[id(company)])
  }
 })
 after(async()=>{await db?.close()})
 for(const user of [3,4,5])test(`active tenant ${user}: explicit ON, missing/unknown/OFF deny and other tenant hidden`,async()=>{
  await actor(db,user,async()=>{
   for(const [key,expected] of [['colaboradores.gestao',true],['exames',false],['future.unknown',false],[null,false]])
    assert.equal((await db.query('SELECT engmarq_private.has_empresa_feature($1,$2) enabled',[id(101),key])).rows[0].enabled,expected)
   assert.equal((await db.query('SELECT engmarq_private.has_empresa_feature($1,$2) enabled',[id(102),'colaboradores.gestao'])).rows[0].enabled,false)
   for(const table of ['empresa_comercial','empresa_features','empresa_limites','empresa_uso']) {
    const rows=(await db.query(`SELECT empresa_id FROM ${table}`)).rows
    assert.equal(rows.length,1);assert.equal(rows[0].empresa_id,id(101))
   }
  })
 })
 for(const user of [1,7,9])test(`Admin/inactive/suspended ${user} receives no operational feature capability`,async()=>{
  await actor(db,user,async()=>{
   assert.equal((await db.query('SELECT engmarq_private.has_empresa_feature($1,$2) enabled',[id(user===9?103:101),'colaboradores.gestao'])).rows[0].enabled,false)
   assert.equal((await db.query('SELECT * FROM empresa_features')).rows.length,user===1?3:0)
  })
 })
 test('Admin reads commercial aggregates without gaining operational access to remediated modules',async()=>{
  await actor(db,1,async()=>{
   assert.equal((await db.query('SELECT * FROM empresa_uso')).rows.length,3)
   for(const table of ['colaboradores','treinamentos','documentos','user_profiles']){
    const rows=(await db.query(`SELECT * FROM ${table}`)).rows
    if(table==='user_profiles')assert.deepEqual(rows.map(r=>r.id),[id(1)])
    else assert.equal(rows.length,0)
   }
   assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id IN ('documentos','logos')")).rows.length,0)
  })
 })
 test('024 preserves EPI/assinaturas legacy gap explicitly reserved for 025',async()=>{
  await actor(db,1,async()=>{
   assert.equal((await db.query('SELECT * FROM fichas_epi')).rows.length,3)
   assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='assinaturas'")).rows.length,3)
  })
 })
 for(const [label,sql] of [
  ['feature catalog',"INSERT INTO features VALUES('future.module','Malicious')"],
  ['feature entitlement',`INSERT INTO empresa_features VALUES('${id(101)}','exames',true)`],
  ['feature update',`UPDATE empresa_features SET enabled=false WHERE empresa_id='${id(101)}' RETURNING *`],
  ['limit insert',`INSERT INTO empresa_limites(empresa_id,max_colaboradores_ativos) VALUES('${id(104)}',999999)`],
  ['limit update',`UPDATE empresa_limites SET max_colaboradores_ativos=999999 WHERE empresa_id='${id(101)}' RETURNING *`],
  ['commercial origin',`UPDATE empresa_comercial SET origem='autocadastro' WHERE empresa_id='${id(101)}'`],
  ['commercial plan',`UPDATE empresa_comercial SET plano_comercial_id='${id(999)}' WHERE empresa_id='${id(101)}' RETURNING *`],
  ['usage update',`UPDATE empresa_uso SET colaboradores_ativos=0 WHERE empresa_id='${id(101)}'`],
  ['usage insert',`INSERT INTO empresa_uso VALUES('${id(104)}',0,clock_timestamp())`],
  ['usage delete','DELETE FROM empresa_uso'],['usage truncate','TRUNCATE empresa_uso'],
  ['audit insert',`INSERT INTO auditoria_comercial(empresa_id,objeto,operacao,executor) VALUES('${id(101)}','empresa_status','INSERT','spoof')`],
  ['private onboarding','SELECT * FROM engmarq_private.onboarding_solicitacoes']
 ])test(`tenant cannot write ${label}`,async()=>{
  await actor(db,3,async()=>{
   if(sql.includes('RETURNING'))assert.equal((await db.query(sql)).rows.length,0)
   else await assert.rejects(db.query(sql),denied)
  })
 })
 test('anonymous cannot read/write foundation or call entitlement/provision helpers',async()=>{
  await actor(db,1,async()=>assert.rejects(db.query('SELECT * FROM empresa_features'),denied),'anon')
  await actor(db,1,async()=>assert.rejects(db.query("SELECT engmarq_private.has_empresa_feature(NULL,'exames')"),denied),'anon')
  await actor(db,3,async()=>assert.rejects(db.query('SELECT engmarq_private.guard_commercial_write()'),denied))
 })
 test('Admin explicit feature changes audited; unknown features cannot be granted',async()=>{
  await actor(db,1,async()=>{
   await db.query("INSERT INTO empresa_features VALUES($1,'exames',true)",[id(101)])
   await db.query("UPDATE empresa_features SET enabled=false WHERE empresa_id=$1 AND feature_key='exames'",[id(101)])
   const rows=(await db.query("SELECT * FROM auditoria_comercial WHERE feature_key='exames' ORDER BY registrado_em")).rows
   assert.equal(rows.length,2);assert.equal(rows[1].anterior.enabled,true);assert.equal(rows[1].novo.enabled,false)
   assert.equal(rows[0].ator_id,id(1));assert.equal(rows[0].executor,'authenticated')
  })
  await actor(db,1,async()=>assert.rejects(db.query("INSERT INTO empresa_features VALUES($1,'future.unknown',true)",[id(101)]),e=>e.code==='23503'))
 })
 test('explicit OFF denies; plan and verification do not grant any feature',async()=>{
  await actor(db,1,async()=>{
   await db.query("UPDATE empresa_features SET enabled=false WHERE empresa_id=$1",[id(101)])
   // Verify scoped helper using a second identity in same transaction without changing commercial state.
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(3)])
   assert.equal((await db.query("SELECT engmarq_private.has_empresa_feature($1,'colaboradores.gestao') enabled",[id(101)])).rows[0].enabled,false)
  })
  await actor(db,1,async()=>{
   await db.query("UPDATE empresa_comercial SET plano_comercial_id=$1,titularidade='verificado',verificado_por=$2,verificado_em=clock_timestamp() WHERE empresa_id=$3",[id(999),id(1),id(101)])
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(3)])
   assert.equal((await db.query("SELECT engmarq_private.has_empresa_feature($1,'exames') enabled",[id(101)])).rows[0].enabled,false)
  })
 })
 test('limit reduction below actual use fails even if stored usage understates it',async()=>{
  await actor(db,1,async()=>assert.rejects(db.query('UPDATE empresa_limites SET max_colaboradores_ativos=0 WHERE empresa_id=$1',[id(101)]),invalid))
  await actor(db,1,async()=>{
   const row=(await db.query('UPDATE empresa_limites SET max_colaboradores_ativos=1 WHERE empresa_id=$1 RETURNING *',[id(101)])).rows[0]
   assert.equal(row.max_colaboradores_ativos,1)
  })
  await actor(db,1,async()=>{
   await db.query('UPDATE empresa_limites SET max_colaboradores_ativos=NULL,ilimitado=true WHERE empresa_id=$1',[id(101)])
   assert.equal((await db.query('SELECT max_colaboradores_ativos FROM empresa_limites WHERE empresa_id=$1',[id(101)])).rows[0].max_colaboradores_ativos,null)
  })
  await actor(db,1,async()=>assert.rejects(db.query('UPDATE empresa_limites SET max_colaboradores_ativos=NULL WHERE empresa_id=$1',[id(101)]),invalid))
  await actor(db,1,async()=>assert.rejects(db.query('INSERT INTO empresa_limites(empresa_id) VALUES($1)',[id(103)]),invalid))
 })
 test('limit rejects a positive reduction below current employees, not declared diagnosis',async()=>{
  await db.exec('BEGIN')
  try {
   await db.query(`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao)
    VALUES($1,'Synthetic second','98765432100',$1,$1,'2026-01-01')`,[id(101)])
   await db.query('UPDATE empresa_uso SET colaboradores_ativos=0 WHERE empresa_id=$1',[id(101)])
   await assert.rejects(db.query('UPDATE empresa_limites SET max_colaboradores_ativos=1 WHERE empresa_id=$1',[id(101)]),invalid)
  }finally{await db.exec('ROLLBACK')}
 })
 test('inactive employees do not consume limit; 024 deliberately adds no employee quota gate',async()=>{
  await db.exec('BEGIN')
  try {
   await db.query(`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao,active,data_demissao)
    VALUES($1,'Historical synthetic','98765432100',$1,$1,'2026-01-01',false,'2026-02-01')`,[id(101)])
   await db.query('UPDATE empresa_limites SET max_colaboradores_ativos=1 WHERE empresa_id=$1',[id(101)])
   await db.exec('SET LOCAL ROLE authenticated')
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(3)])
   await db.query(`INSERT INTO colaboradores(empresa_id,nome,cpf,funcao_id,setor_id,data_admissao)
    VALUES($1,'Above foundation limit','98765432101',$1,$1,'2026-01-01')`,[id(101)])
   assert.equal((await db.query('SELECT count(*)::int n FROM colaboradores WHERE active')).rows[0].n,2)
  }finally{await db.exec('ROLLBACK')}
 })
 test('diagnostic remains autodeclared; preserves quota, no documents and only own tenant author',async()=>{
  await actor(db,3,async()=>{
   const previous=(await db.query('SELECT * FROM empresa_uso')).rows
   const docs=(await db.query('SELECT count(*) FROM documentos')).rows
   await db.query(`INSERT INTO empresa_diagnostico_sst(empresa_id,possui_pgr,possui_pcmso,possui_treinamentos,
    programas_documentos_em_dia,treinamentos_em_dia,quantidade_aproximada_colaboradores,conhece_grau_risco,grau_risco_informado,informado_por)
    VALUES($1,'sim','nao','nao_sei','nao_sei','nao',500,true,3,$2)`,[id(101),id(3)])
   assert.deepEqual((await db.query('SELECT * FROM empresa_uso')).rows,previous)
   assert.deepEqual((await db.query('SELECT count(*) FROM documentos')).rows,docs)
   assert.equal((await db.query('SELECT * FROM empresa_diagnostico_sst')).rows[0].schema_version,1)
  })
 })
 for(const [label,values] of [['missing grade','true,NULL'],['grade while unknown','false,2'],['grade out of range','true,5']])
 test(`diagnostic rejects ${label}`,async()=>actor(db,3,async()=>assert.rejects(db.query(
  `INSERT INTO empresa_diagnostico_sst(empresa_id,conhece_grau_risco,grau_risco_informado,informado_por) VALUES($1,${values},$2)`,[id(101),id(3)]),invalid)))
 test('diagnostic rejects foreign author, invalid tri-state, operational/Admin writes and future schema',async()=>{
  await actor(db,3,async()=>assert.rejects(db.query('INSERT INTO empresa_diagnostico_sst(empresa_id,informado_por) VALUES($1,$2)',[id(101),id(8)]),invalid))
  for(const values of ["possui_pgr='verified'","schema_version=2","quantidade_aproximada_colaboradores=-1"])
   await actor(db,3,async()=>assert.rejects(db.query(`INSERT INTO empresa_diagnostico_sst(empresa_id,informado_por,${values.split('=')[0]}) VALUES($1,$2,${values.split('=')[1]})`,[id(101),id(3)]),invalid))
  for(const user of [1,5,7,9])await actor(db,user,async()=>assert.rejects(db.query('INSERT INTO empresa_diagnostico_sst(empresa_id,informado_por) VALUES($1,$2)',[id(user===9?103:101),id(user)]),e=>['42501','23514'].includes(e.code)))
 })
 test('commercial Admin can read self-declared diagnostic without employee access',async()=>{
  await db.query('INSERT INTO empresa_diagnostico_sst(empresa_id,informado_por) VALUES($1,$2)',[id(101),id(3)])
  try {
   await actor(db,1,async()=>assert.equal((await db.query('SELECT * FROM empresa_diagnostico_sst')).rows.length,1))
   await actor(db,8,async()=>assert.equal((await db.query('SELECT * FROM empresa_diagnostico_sst')).rows.length,0))
  }finally{await db.query('DELETE FROM empresa_diagnostico_sst')}
 })
 test('audit append-only: authenticated, service and owner cannot mutate or truncate',async()=>{
  for(const role of ['authenticated','service_role','postgres'])for(const sql of ["UPDATE auditoria_comercial SET executor='spoof'",'DELETE FROM auditoria_comercial','TRUNCATE auditoria_comercial'])
   await actor(db,1,async()=>assert.rejects(db.query(sql),denied),role)
 })
 test('status and commercial plan changes audited with no operational payload',async()=>{
  await actor(db,1,async()=>{
   await db.query("UPDATE empresas SET status='pendente' WHERE id=$1",[id(102)])
   const row=(await db.query("SELECT * FROM auditoria_comercial WHERE objeto='empresa_status'")).rows[0]
   assert.deepEqual(row.anterior,{status:'ativa'});assert.deepEqual(row.novo,{status:'pendente'})
   assert.equal(row.ator_id,id(1));assert.equal(row.empresa_id,id(102))
  })
 })
 test('structured address writable only by existing authorized actors and CNPJ immutable to all clients',async()=>{
  await actor(db,3,async()=>{
   const row=(await db.query("UPDATE empresas SET cep='01234567',logradouro='Rua sintética',numero='10',bairro='Centro',complemento=NULL WHERE id=$1 RETURNING *",[id(101)])).rows[0]
   assert.equal(row.cep,'01234567');assert.equal(row.cidade,null)
   await db.query('UPDATE empresas SET cnpj=cnpj WHERE id=$1',[id(101)])
  })
  for(const user of [1,3,4])await actor(db,user,async()=>assert.rejects(db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',['00.000.000/E08G-12',id(101)]),denied))
  await actor(db,8,async()=>assert.equal((await db.query("UPDATE empresas SET logradouro='other' WHERE id=$1 RETURNING id",[id(101)])).rows.length,0))
  await actor(db,5,async()=>assert.equal((await db.query("UPDATE empresas SET logradouro='unauthorized' WHERE id=$1 RETURNING id",[id(101)])).rows.length,0))
 })
 test('service counter infrastructure does not grant client provisioning; idempotency structure protects results',async()=>{
  await actor(db,1,async()=>{
   await db.query('UPDATE empresa_uso SET colaboradores_ativos=2 WHERE empresa_id=$1',[id(101)])
   assert.equal((await db.query('SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id=$1',[id(101)])).rows[0].colaboradores_ativos,2)
  },'service_role')
  await actor(db,1,async()=>assert.rejects(db.query('SELECT * FROM engmarq_private.onboarding_solicitacoes'),denied),'service_role')
  await db.exec('BEGIN')
  try {
   await db.query(`INSERT INTO engmarq_private.onboarding_solicitacoes(auth_user_id,chave_idempotencia,payload_hash,estado,expira_em)
    VALUES($1,$2,repeat('a',64),'onboarding',clock_timestamp()+interval '1 hour')`,[id(3),id(900)])
   await assert.rejects(db.query(`INSERT INTO engmarq_private.onboarding_solicitacoes(auth_user_id,chave_idempotencia,payload_hash,estado,expira_em)
    VALUES($1,$2,repeat('b',64),'onboarding',clock_timestamp()+interval '1 hour')`,[id(3),id(900)]),e=>e.code==='23505')
  }finally{await db.exec('ROLLBACK')}
 })
})

test('CNPJ algorithm: numeric/alphanumeric/masked/compact/lowercase/zeros; malformed/DV/repeated reject',async()=>{
 const db=await fundacaoFixture(true)
 try {
  for(const [raw,canonical] of [['11.222.333/0001-81','11222333000181'],['04252011000110','04252011000110'],
   [' 00.000.000/e08g-12 ','00000000E08G12'],['12.ABC.345/01DE-35','12ABC34501DE35']]) {
   const row=(await db.query('SELECT engmarq_private.cnpj_canonico($1) c,engmarq_private.cnpj_valido($1) valid',[raw])).rows[0]
   assert.equal(row.c,canonical);assert.equal(row.valid,true)
  }
  for(const raw of [null,'','00000000000000','11111111111111','12.345.678/0001-90','00.000.000/E08G-13',
   '00.000.000/É08G-12','00-000-000/E08G-12','00.000.000/E08G-1A','00.000.000/E08G-12x','00 000000E08G12'])
   assert.equal((await db.query('SELECT engmarq_private.cnpj_valido($1) valid',[raw])).rows[0].valid,false,raw)
  await actor(db,1,async()=>assert.rejects(db.query('INSERT INTO empresas(razao_social,cnpj) VALUES($1,$2)',['Collision','11222333000181']),e=>e.code==='23505'))
  await actor(db,1,async()=>assert.rejects(db.query('INSERT INTO empresas(razao_social,cnpj) VALUES($1,$2)',['Invalid','12.345.678/0001-90']),invalid))
  await actor(db,1,async()=>{
   const row=(await db.query("INSERT INTO empresas(razao_social,cnpj) VALUES('New alphanumeric','12.ABC.345/01DE-35') RETURNING *")).rows[0]
   assert.equal(row.cnpj_canonico,'12ABC34501DE35')
   assert.equal((await db.query('SELECT * FROM empresa_features WHERE empresa_id=$1',[row.id])).rows.length,0)
   assert.equal((await db.query('SELECT * FROM empresa_limites WHERE empresa_id=$1',[row.id])).rows.length,0)
  })
 }finally{await db.close()}
})

for(const [label,change] of [
 ['invalid',"UPDATE empresas SET cnpj='12.345.678/0001-90' WHERE id=$1"],
 ['unexpected format',"UPDATE empresas SET cnpj='000-000-000/E08G-12' WHERE id=$1"],
 ['canonical collision',"UPDATE empresas SET cnpj='11222333000181' WHERE id=$1"]
])test(`preflight blocks ${label}; migration fails atomically without repair`,async()=>{
 const db=await fundacaoFixture()
 try {
  await db.query(change,[id(102)])
  const before=await dataSnapshot(db)
  const pre=await report(db,'preflight')
  assert.ok(pre.some(r=>r.STATUS==='BLOQUEIO'))
  await assert.rejects(migrate(db,'024_fundacao_comercial.sql'),invalid)
  await db.exec('ROLLBACK')
  assert.deepEqual(await dataSnapshot(db),before)
  assert.equal((await db.query("SELECT to_regclass('empresa_features') table_name")).rows[0].table_name,null)
  assert.equal((await db.query("SELECT to_regprocedure('engmarq_private.cnpj_valido(text)') fn")).rows[0].fn,null)
 }finally{await db.close()}
})
test('catalog drift/new object collision blocks preflight and migration; postflight catches permissive policy',async()=>{
 const db=await fundacaoFixture()
 try {
  await db.exec('ALTER POLICY colaboradores_select ON colaboradores USING(true)')
  assert.ok((await report(db,'preflight')).some(r=>r.STATUS==='BLOQUEIO'&&r.CHECK?.includes('colaboradores_select')))
  await assert.rejects(migrate(db,'024_fundacao_comercial.sql'),e=>e.message.includes('contract drift'))
  await db.exec('ROLLBACK')
 }finally{await db.close()}
 const post=await fundacaoFixture(true)
 try {
  await post.exec('CREATE POLICY accidental_open ON empresa_features USING(true)')
  assert.ok((await report(post,'postflight')).some(r=>r.STATUS==='BLOQUEIO'&&r.CHECK?.includes('accidental_open')))
 }finally{await post.close()}
})
test('unexpected 024 relation, Storage publicity and RLS drift block read-only preflight',async()=>{
 const db=await fundacaoFixture()
 try {
  await db.exec("CREATE TABLE public.features(unexpected text); UPDATE storage.buckets SET public=true WHERE id='logos'; ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;")
  const rows=await report(db,'preflight')
  for(const key of ['relation:public.features','bucket:logos','storage:objects_rls'])
   assert.ok(rows.some(r=>r.CHECK===key&&r.STATUS==='BLOQUEIO'),key)
  await assert.rejects(migrate(db,'024_fundacao_comercial.sql'),e=>e.message.includes('contract drift'))
  await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT count(*)::int n FROM features')).rows[0].n,0)
 }finally{await db.close()}
})
for(const legacyEpi of [true,false])test(`optional EPI ${legacyEpi?'present':'absent'}: pre/post complete read-only; 024 preserves presence and catalog`,async()=>{
 const db=await fundacaoFixture(false,{legacyEpi})
 try{
  const before=await dataSnapshot(db)
  const pre=await report(db,'preflight')
  assert.deepEqual(pre.filter(r=>r.STATUS==='BLOQUEIO'),[])
  assert.deepEqual(await dataSnapshot(db),before)
  for(const table of ['fichas_epi','fichas_epi_itens']){
   const row=pre.find(r=>r.CHECK===`Preservação: ${table}`)
   assert.equal(row.STATUS,'ATENÇÃO')
   if(legacyEpi)assert.match(row.RESULTADO,/^[0-9a-f]{32}$/)
   else assert.match(row.RESULTADO,/relation ausente.*fora do escopo.*025/)
  }
  await migrate(db,'024_fundacao_comercial.sql')
  const snapshot=await dataSnapshot(db)
  const post=await report(db,'postflight')
  assert.deepEqual(post.filter(r=>r.STATUS==='BLOQUEIO'),[])
  assert.deepEqual(await dataSnapshot(db),snapshot)
  assert.ok(comparePreservation(pre,post).every(r=>r.STATUS==='OK'))
  for(const table of ['fichas_epi','fichas_epi_itens'])assert.equal(Boolean((await db.query('SELECT to_regclass($1) rel',[`public.${table}`])).rows[0].rel),legacyEpi)
 }finally{await db.close()}
})
test('partial EPI and missing function/policies/bucket are warnings, not 024 prerequisites',async()=>{
 const db=await fundacaoFixture()
 try{
  await db.exec(`DROP TABLE fichas_epi_itens; DROP FUNCTION public.update_ficha_epi_item_status();
   DROP POLICY assinaturas_storage_select ON storage.objects;
   DROP POLICY assinaturas_storage_insert ON storage.objects;
   DELETE FROM storage.objects WHERE bucket_id='assinaturas'; DELETE FROM storage.buckets WHERE id='assinaturas';`)
  const pre=await report(db,'preflight')
  assert.deepEqual(pre.filter(r=>r.STATUS==='BLOQUEIO'),[])
  assert.ok(pre.some(r=>r.CHECK==='bucket:assinaturas'&&r.STATUS==='ATENÇÃO'))
  await migrate(db,'024_fundacao_comercial.sql')
  const post=await report(db,'postflight')
  assert.deepEqual(post.filter(r=>r.STATUS==='BLOQUEIO'),[])
  assert.ok(comparePreservation(pre,post).every(r=>r.STATUS==='OK'))
 }finally{await db.close()}
})
for(const change of ['appear','disappear','policy','view','signature table'])test(`pre/post comparison detects optional EPI ${change}`,async()=>{
 const db=await fundacaoFixture(false,{legacyEpi:change!=='appear'})
 try{
  const pre=await report(db,'preflight')
  await migrate(db,'024_fundacao_comercial.sql')
  if(change==='appear')await db.exec('CREATE TABLE public.fichas_epi(id uuid)')
  if(change==='disappear')await db.exec('DROP TABLE public.fichas_epi_itens; DROP TABLE public.fichas_epi')
  if(change==='policy')await db.exec('ALTER POLICY assinaturas_storage_select ON storage.objects USING(false)')
  if(change==='view')await db.exec('CREATE VIEW public.vw_epi_audit AS SELECT 1 value')
  if(change==='signature table')await db.exec('CREATE TABLE public.assinaturas(id uuid,metadata text); INSERT INTO public.assinaturas VALUES(gen_random_uuid(),\'synthetic\')')
  const post=await report(db,'postflight')
  assert.deepEqual(post.filter(r=>r.STATUS==='BLOQUEIO'),[])
  assert.ok(comparePreservation(pre,post).some(r=>r.STATUS==='BLOQUEIO'&&r.CHECK.includes('Preservação:')))
 }finally{await db.close()}
})
test('offline comparison rejects incomplete exports and optional fingerprint mutation',()=>{
 assert.equal(comparePreservation([],[])[0].STATUS,'BLOQUEIO')
 const absent=requiredPreservationChecks.map(CHECK=>({CHECK,RESULTADO:'ausente'}))
 assert.equal(comparePreservation(absent,absent)[0].STATUS,'OK')
 assert.ok(comparePreservation(absent,absent.map(r=>r.CHECK==='Preservação: fichas_epi'?{...r,RESULTADO:'present hash'}:r)).some(r=>r.STATUS==='BLOQUEIO'))
 assert.equal(comparePreservation([absent[0]],[absent[0]])[0].STATUS,'BLOQUEIO')
 assert.equal(comparePreservation(absent,[{CHECK:'Preservação: other',RESULTADO:'ausente'}])[0].STATUS,'BLOQUEIO')
})
test('015–023 byte-identical to approved Git base; scripts contain only read-only SQL and no signup/storage mutation',async()=>{
 const hashes=JSON.parse(await readFile(new URL('../../docs/audits/2026-10-03/fundacao-024-migrations-015-023-sha256.json',import.meta.url),'utf8'))
 assert.equal(Object.keys(hashes).length,9)
 for(const [name,hash] of Object.entries(hashes)){
  const current=await readFile(new URL('../migrations/'+name,import.meta.url))
  assert.equal(createHash('sha256').update(current).digest('hex'),hash)
  const committed=execFileSync('git',['show',`ba7e645af7887995b442edd3fc3b3b1bd9cf3717:supabase/migrations/${name}`],{cwd:new URL('../../',import.meta.url),windowsHide:true})
  // Compare normalized newlines for checkout portability; hashes above preserve exact local bytes.
  assert.equal(current.toString().replaceAll('\r\n','\n'),committed.toString().replaceAll('\r\n','\n'))
 }
 for(const stage of ['preflight','postflight']){
  const sql=await load(`024_fundacao_${stage}_readonly.sql`)
  // Strip SQL string literals before checking tokens; catalog definitions are data, not execution.
  const code=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'')
  assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i)
  assert.match(sql,/REPEATABLE READ READ ONLY/)
 }
 const sql=await load('../migrations/024_fundacao_comercial.sql')
 const code=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'')
 assert.doesNotMatch(code,/(ALTER|INSERT INTO|UPDATE|DELETE FROM|CREATE TRIGGER)[^;]*storage\./i)
 assert.doesNotMatch(code,/CREATE (?:OR REPLACE )?FUNCTION (?:public\.)?[^\s(]*bootstrap/i)
})
