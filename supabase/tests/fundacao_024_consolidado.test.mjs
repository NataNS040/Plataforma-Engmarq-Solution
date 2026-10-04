import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {fundacaoFixture,load,id,dataSnapshot} from './fundacao-fixture.mjs'
import {splitSql} from './024_consolidado_generate.mjs'
const file='024_fundacao_preflight_consolidado_readonly.sql'
const run=async db=>{
 const results=await db.exec(await load(file))
 const operational=results.filter(r=>r.fields?.length)
 assert.equal(operational.length,1,'Only ONE operational result set, excluding BEGIN/COMMIT acknowledgements')
 assert.equal(results.filter(r=>r.fields?.length).at(-1),operational[0], 'The last visible result is the complete audit')
 assert.deepEqual(operational[0].fields.map(f=>f.name),['ORDEM','CATEGORIA','CHECK','RESULTADO','STATUS','DETALHES'])
 assert.ok(operational[0].rows.length>100,'The visible result must contain hundreds of checks, not only the optional EPI fingerprint')
 assert.equal(operational[0].rows.at(-1).CHECK,'RESULTADO_FINAL')
 return operational[0].rows
}
const summary=rows=>Object.fromEntries(rows.filter(r=>r.CATEGORIA==='RESUMO').map(r=>[r.CHECK,r.RESULTADO]))
function assertTotals(rows){
 const detail=rows.filter(r=>r.CATEGORIA!=='RESUMO'),s=summary(rows)
 for(const [key,status] of [['TOTAL_OK','OK'],['TOTAL_ATENCOES','ATENÇÃO'],['TOTAL_BLOQUEIOS','BLOQUEIO']])
  assert.equal(Number(s[key]),detail.filter(r=>r.STATUS===status).length)
 assert.deepEqual(rows.slice(-4).map(r=>r.CHECK),['TOTAL_OK','TOTAL_ATENCOES','TOTAL_BLOQUEIOS','RESULTADO_FINAL'])
 assert.deepEqual(rows.map(r=>Number(r.ORDEM)),Array.from({length:rows.length},(_,i)=>i+1))
 assert.equal(s.RESULTADO_FINAL,Number(s.TOTAL_BLOQUEIOS)===0?'APROVADO PARA REVISÃO':'REPROVADO — NÃO APLICAR 024')
}
for(const legacyEpi of [true,false])test(`consolidated EPI ${legacyEpi?'present':'absent'}: one result, original checks preserved, warnings never block`,async t=>{
 const db=await fundacaoFixture(false,{legacyEpi})
 try{
  const before=await dataSnapshot(db)
  const original=(await db.exec(await load('024_fundacao_preflight_readonly.sql'))).flatMap(r=>r.rows??[])
  const rows=await run(db)
  t.diagnostic(`Last and only visible audit: ${rows.length} rows (${rows.length-4} checks + 4 summaries); last row: ${rows.at(-1).CHECK}`)
  assert.deepEqual(await dataSnapshot(db),before)
  assertTotals(rows)
  const s=summary(rows);assert.equal(s.TOTAL_BLOQUEIOS,'0');assert.ok(Number(s.TOTAL_ATENCOES)>0)
  // Exact per-check rules/results match original; only presentation and summary are added.
  for(const row of original.filter(r=>r.CHECK))
   assert.ok(rows.some(r=>r.CHECK===row.CHECK&&r.RESULTADO===row.RESULTADO&&r.STATUS===row.STATUS),row.CHECK)
  for(const row of original.filter(r=>r.cnpj))assert.ok(rows.some(r=>r.CATEGORIA==='CNPJ'&&r.DETALHES.empresa_id===row.empresa_id&&r.DETALHES.cnpj===row.cnpj&&r.DETALHES.cnpj_canonico===row.cnpj_canonico&&r.STATUS===row.STATUS))
  for(const row of original.filter(r=>r.colaboradores_historicos!==undefined))assert.ok(rows.some(r=>r.CATEGORIA==='EMPRESAS_COLABORADORES'&&r.DETALHES.empresa_id===row.empresa_id&&r.DETALHES.colaboradores_ativos===row.colaboradores_ativos&&r.DETALHES.colaboradores_historicos===row.colaboradores_historicos))
  for(const category of ['CONTRATO','SCHEMA','POLICIES','GRANTS','FUNCTIONS','TRIGGERS','CONSTRAINTS','INDICES','VIEWS','STORAGE',
   'EPI_ASSINATURAS','CNPJ','COLISOES_CNPJ','EMPRESAS_COLABORADORES','INTEGRIDADE_TENANT','AUDITOR','PAPEIS','AUTH','MIGRATIONS','CONFIGURACAO_AUTH','BACKFILL_FREE','PRESERVACAO','RESUMO'])
   assert.ok(rows.some(r=>r.CATEGORIA===category),category)
  for(const name of ['empresas','user_profiles','colaboradores','documentos','treinamentos','funcoes','setores','ambientes',
   'matriz_treinamentos','documento_tipos','treinamento_tipos','exames_catalogo','storage.objects','storage.buckets','fichas_epi','fichas_epi_itens','catálogo opcional EPI/Assinaturas'])
   assert.ok(rows.some(r=>r.CHECK==='Preservação: '+name),name)
  if(!legacyEpi)assert.ok(rows.some(r=>r.CHECK==='Preservação: fichas_epi'&&r.STATUS==='ATENÇÃO'&&r.RESULTADO.includes('relation ausente')))
  const optionalCatalog=rows.filter(r=>r.CHECK==='Preservação: catálogo opcional EPI/Assinaturas')
  assert.equal(optionalCatalog.length,1)
  assert.equal(optionalCatalog[0].STATUS,'ATENÇÃO')
  assert.notEqual(rows.at(-1).CHECK,optionalCatalog[0].CHECK)
  // No personal employee/profile rows are disclosed, only catalog descriptions and fingerprints.
  const text=JSON.stringify(rows)
  assert.ok(!text.includes('12345678901'));assert.ok(!text.includes('Synthetic employee'));assert.ok(!text.includes('user3@example.com'))
 }finally{await db.close()}
})
for(const [label,change] of [
 ['invalid DV',async db=>db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',['12.345.678/0001-90',id(102)])],
 ['canonical collision',async db=>db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',['11222333000181',id(102)])],
 ['mandatory policy drift',async db=>db.exec('ALTER POLICY colaboradores_select ON colaboradores USING(true)')]
])test(`consolidated rejects ${label}, identifies exact blocker and counts it correctly`,async()=>{
 const db=await fundacaoFixture()
 try{
  await change(db)
  const rows=await run(db);assertTotals(rows)
  assert.equal(summary(rows).RESULTADO_FINAL,'REPROVADO — NÃO APLICAR 024')
  assert.ok(Number(summary(rows).TOTAL_BLOQUEIOS)>0)
  const blocks=rows.filter(r=>r.CATEGORIA!=='RESUMO'&&r.STATUS==='BLOQUEIO')
  if(label==='invalid DV')assert.ok(blocks.some(r=>r.CHECK===`CNPJ: ${id(102)}`))
  if(label==='canonical collision')assert.ok(blocks.some(r=>r.CATEGORIA==='COLISOES_CNPJ'&&r.CHECK==='Colisão canônica'))
  if(label==='mandatory policy drift'){
   const row=blocks.find(r=>r.CHECK==='policy:public.colaboradores.colaboradores_select')
   assert.ok(row);assert.ok(row.DETALHES.REMOTO);assert.ok(row.DETALHES.ESPERADO)
   assert.notDeepEqual(row.DETALHES.REMOTO,row.DETALHES.ESPERADO)
  }
 }finally{await db.close()}
})
test('consolidated is READ ONLY with three statements, no DDL/DML and source hash unchanged',async()=>{
 const sql=await load(file),source=await load('024_fundacao_preflight_readonly.sql')
 const digest=createHash('sha256').update(source).digest('hex')
 assert.match(sql,new RegExp('ORIGINAL_SHA256: '+digest))
 const pieces=splitSql(sql)
 assert.equal(pieces.length,3)
 assert.match(pieces[0],/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY$/)
 assert.match(pieces[1],/^WITH /);assert.equal(pieces[2],'COMMIT')
 const code=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'')
 assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i)
 assert.doesNotMatch(code,/FROM\s+public\.(fichas_epi|fichas_epi_itens|assinaturas)\b/i)
})

test('024 preserves legacy service EXECUTE; loss of grant and body drift still block',async()=>{
 const db=await fundacaoFixture()
 try {
  const baseline=await run(db)
  for(const helper of ['get_user_empresa_id','get_user_role']) {
   const row=baseline.find(r=>r.CHECK===`function:${helper}()`)
   assert.equal(row.STATUS,'OK')
   assert.equal(row.DETALHES.REMOTO.service,true)
   assert.equal(row.DETALHES.ESPERADO.service,true)
   assert.equal(row.DETALHES.REMOTO.anon,false)
   assert.equal(row.DETALHES.REMOTO.authenticated,true)
  }
  await db.exec('REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM service_role')
  let rows=await run(db)
  assert.equal(rows.find(r=>r.CHECK==='function:get_user_role()').STATUS,'BLOQUEIO')
  await db.exec(`GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;
   CREATE OR REPLACE FUNCTION public.get_user_empresa_id() RETURNS uuid
   LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::uuid $$;`)
  rows=await run(db)
  assert.equal(rows.find(r=>r.CHECK==='function:get_user_empresa_id()').STATUS,'BLOQUEIO')
 }finally{await db.close()}
})

test('pre-remediation inventory is read-only and discovers tenant and indirect FK rows',async()=>{
 const db=await fundacaoFixture()
 try {
  // Auth fixture deliberately has only id; provide synthetic email for evidence flags.
  await db.exec('ALTER TABLE auth.users ADD COLUMN email text')
  await db.exec(`CREATE TABLE public.inventory_indirect(id uuid PRIMARY KEY,
   documento_id uuid REFERENCES public.documentos(id));
   INSERT INTO inventory_indirect SELECT id,id FROM public.documentos LIMIT 1`)
  const before=await dataSnapshot(db)
  const sql=(await load('024_pre_remediation_empresa_readonly.sql'))
   .replaceAll('5c114b79-bbd1-4829-b6ac-42da9f7362c0',id(101))
  const results=(await db.exec(sql)).filter(r=>r.fields?.length)
  assert.equal(results.length,1)
  const rows=results[0].rows
  assert.ok(rows.some(r=>r.CATEGORIA==='TABELAS_EMPRESA_ID'&&r.DETALHES.tabela==='documentos'&&Number(r.RESULTADO)>0))
  assert.ok(rows.some(r=>r.CATEGORIA==='REFERENCIAS_FK'&&r.CHECK.includes('inventory_indirect')&&Number(r.RESULTADO)===1))
  assert.ok(rows.some(r=>r.CATEGORIA==='REFERENCIAS_FK'&&r.CHECK.includes('fichas_epi_itens')&&Number(r.RESULTADO)>0))
  assert.deepEqual(await dataSnapshot(db),before)
  const output=JSON.stringify(rows)
  assert.ok(!output.includes('12345678901'));assert.ok(!output.includes('Synthetic employee'))
 }finally{await db.close()}
})
