import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fundacaoFixture,migrate,load,dataSnapshot} from './fundacao-fixture.mjs'
import {catalog} from './024-catalog.mjs'
import {splitSql} from './024_consolidado_generate.mjs'
import {withBaseline} from './024_postflight_baseline.mjs'
import {requiredPreservationChecks} from './024_compare_preservation.mjs'
const file='024_fundacao_postflight_readonly.sql'
async function run(db,sql) {
 const output=(await db.exec(sql)).filter(r=>r.fields?.length)
 assert.equal(output.length,1)
 assert.deepEqual(output[0].fields.map(f=>f.name),['ORDEM','CATEGORIA','CHECK','RESULTADO','STATUS','DETALHES'])
 const rows=output[0].rows,checks=rows.filter(r=>r.CATEGORIA!=='RESUMO')
 assert.deepEqual(rows.slice(-4).map(r=>r.CHECK),['TOTAL_OK','TOTAL_ATENCOES','TOTAL_BLOQUEIOS','RESULTADO_FINAL'])
 assert.deepEqual(rows.map(r=>Number(r.ORDEM)),rows.map((_,i)=>i+1))
 for(const [name,status] of [['TOTAL_OK','OK'],['TOTAL_ATENCOES','ATENÇÃO'],['TOTAL_BLOQUEIOS','BLOQUEIO']])
  assert.equal(Number(rows.find(r=>r.CHECK===name).RESULTADO),checks.filter(r=>r.STATUS===status).length)
 assert.equal(rows.at(-1).RESULTADO,checks.some(r=>r.STATUS==='BLOQUEIO')?'REPROVADO — 024 NÃO VALIDADA':'024 VALIDADA — APROVADO PARA REVISÃO FINAL')
 return rows
}
for(const legacyEpi of [true,false])test(`postflight consolidated: EPI ${legacyEpi}, complete immutable audit and real preflight baseline`,async()=>{
 const db=await fundacaoFixture(false,{legacyEpi})
 try {
  const pre=(await db.exec(await load('024_fundacao_preflight_consolidado_readonly.sql'))).flatMap(r=>r.rows??[])
  await migrate(db,'024_fundacao_comercial.sql') // Local in-memory synthetic fixture ONLY.
  const sql=await load(file),before=await dataSnapshot(db),catalogBefore=(await db.query(catalog)).rows,rows=await run(db,sql)
  assert.deepEqual(await dataSnapshot(db),before)
  for(const category of ['CONTRATO_024','CNPJ','INTEGRIDADE','SEGURANCA','AUTH','MIGRATIONS','STORAGE','FREE_TIER','PRESERVACAO','EPI_ASSINATURAS'])assert.ok(rows.some(r=>r.CATEGORIA===category),category)
  for(const check of requiredPreservationChecks)assert.ok(rows.some(r=>r.CHECK===check&&r.STATUS==='ATENÇÃO'),check)
  // Every original source row is represented with its result/status, including inventories.
  const rawSql=sql.replace(/SELECT ordem AS "ORDEM"[\s\S]*?FROM final ORDER BY ordem;/,'SELECT * FROM raw_report;')
  const raw=(await db.exec(rawSql)).flatMap(r=>r.rows??[])
  for(const row of raw)assert.ok(rows.some(r=>r.CHECK===row.check_name&&r.RESULTADO===row.result&&r.STATUS===row.status),row.check_name)
  for(const label of ['Perfil sem Auth ou empresa','Colaborador sem tenant/catálogo coerente','Documento vinculado a colaborador de outro tenant','Treinamento/matriz com vínculo incoerente','Auditor integral','Papéis clientes não privilegiados','Auth sem perfil (inventário técnico)','Nenhum backfill de empresa/Free/uso/onboarding/diagnóstico','Endereço novo NULL no legado','Derivação CNPJ consistente'])assert.ok(rows.some(r=>r.CHECK===label),label)
  const compared=await run(db,withBaseline(sql,pre))
  assert.ok(compared.filter(r=>r.CHECK.startsWith('Preservação:')).every(r=>r.STATUS==='OK'))
  assert.equal(compared.find(r=>r.CHECK.startsWith('EPI/assinaturas:')).STATUS,'ATENÇÃO')
  assert.ok(compared.filter(r=>r.CATEGORIA==='EPI_ASSINATURAS').every(r=>r.STATUS==='ATENÇÃO'))
  assert.deepEqual(await dataSnapshot(db),before)
  assert.deepEqual((await db.query(catalog)).rows,catalogBefore)
  const fingerprint=pre.find(r=>r.CHECK==='Preservação: documentos')
  assert.throws(()=>withBaseline(sql,[...pre,fingerprint]),/duplicate/)
  const entry=JSON.stringify({CHECK:fingerprint.CHECK,RESULTADO:fingerprint.RESULTADO})
  const duplicate=withBaseline(sql,pre).replace(entry,entry+','+entry)
  const duplicated=await run(db,duplicate)
  assert.equal(duplicated.find(r=>r.CHECK===fingerprint.CHECK).STATUS,'BLOQUEIO')
  // Alter a known row independently of fixture IDs.
  await db.exec("UPDATE public.documentos SET titulo='changed locally'")
  const drift=await run(db,withBaseline(sql,pre))
  assert.equal(drift.find(r=>r.CHECK==='Preservação: documentos').STATUS,'BLOQUEIO')
  const incomplete=withBaseline(sql,pre).replace(JSON.stringify({CHECK:'Preservação: documentos',RESULTADO:pre.find(r=>r.CHECK==='Preservação: documentos').RESULTADO}),JSON.stringify({CHECK:'Preservação: disappeared',RESULTADO:'old'}))
  const missing=await run(db,incomplete)
  assert.equal(missing.find(r=>r.CHECK==='Preservação: disappeared').STATUS,'BLOQUEIO')
  assert.equal(missing.find(r=>r.CHECK==='Preservação: documentos').STATUS,'BLOQUEIO')
 }finally{await db.close()}
})
test('postflight: SQL is strictly read-only and only three statements',async()=>{
 const sql=await load(file),statements=splitSql(sql)
 assert.equal(statements.length,3)
 assert.match(statements[0],/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY$/)
 assert.match(statements[1],/^WITH /);assert.equal(statements[2],'COMMIT')
 const code=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'')
 assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i)
 assert.throws(()=>withBaseline(sql,[]),/Missing/)
})
test('postflight: optional catalog drift warns, actual preservation drift blocks, no masking',async()=>{
 const db=await fundacaoFixture()
 try {
  const pre=(await db.exec(await load('024_fundacao_preflight_readonly.sql'))).flatMap(r=>r.rows??[])
  await migrate(db,'024_fundacao_comercial.sql')
  await db.exec('ALTER POLICY fichas_epi_select ON public.fichas_epi USING(true)')
  const sql=await load(file),rows=await run(db,withBaseline(sql,pre))
  assert.equal(rows.find(r=>r.CHECK==='policy:public.fichas_epi.fichas_epi_select').STATUS,'ATENÇÃO')
  assert.equal(rows.find(r=>r.CHECK==='Preservação: catálogo opcional EPI/Assinaturas').STATUS,'BLOQUEIO')
  await db.exec('ALTER POLICY colaboradores_select ON public.colaboradores USING(true)')
  assert.equal((await run(db,sql)).find(r=>r.CHECK==='policy:public.colaboradores.colaboradores_select').STATUS,'BLOQUEIO')
 }finally{await db.close()}
})
