// Run only synthetic PGlite fixtures. Never loads app env, network or remote credentials.
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {fundacaoFixture,migrate,id,load} from './fundacao-fixture.mjs'
import {comparePreservation} from './024_compare_preservation.mjs'
import {withBaseline} from './024_postflight_baseline.mjs'
const audit={date:'2026-10-03',environment:'local synthetic PGlite; no remote execution',stages:{},negative_cases:{}}
const run=async(db,stage,baseline)=>{
 const sql=await load(`024_fundacao_${stage}_readonly.sql`)
 return (await db.exec(baseline?withBaseline(sql,baseline):sql)).flatMap(r=>r.rows??[])
}
const summarize=rows=>({results:rows.length,blocks:rows.filter(r=>r.STATUS==='BLOQUEIO').length,
 warnings:rows.filter(r=>r.STATUS==='ATENÇÃO').map(r=>({check:r.CHECK??'aggregate company/bucket inventory',result:r.RESULTADO??'aggregate inventory only'}))})
const db=await fundacaoFixture()
try {
 const pre=await run(db,'preflight');audit.stages.preflight=summarize(pre)
 assert.equal(audit.stages.preflight.blocks,0)
 await migrate(db,'024_fundacao_comercial.sql')
 const post=await run(db,'postflight',pre);audit.stages.postflight=summarize(post)
 assert.equal(audit.stages.postflight.blocks,0)
 assert.ok(comparePreservation(pre,post).every(r=>r.STATUS==='OK'))
 audit.preservation_fingerprints_equal=true
 audit.existing_company_assignments={}
 for(const table of ['empresa_comercial','empresa_features','empresa_limites','empresa_uso','empresa_diagnostico_sst','auditoria_comercial','engmarq_private.onboarding_solicitacoes'])
  audit.existing_company_assignments[table]=(await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n
}finally{await db.close()}
for(const [name,cnpj] of [['invalid','12.345.678/0001-90'],['unexpected','00-000-000/E08G-12'],['collision','11222333000181']]){
 const negative=await fundacaoFixture()
 try {
  await negative.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',[cnpj,id(102)])
  const rows=await run(negative,'preflight')
  audit.negative_cases[name]={blocks:rows.filter(r=>r.STATUS==='BLOQUEIO').length}
  assert.ok(audit.negative_cases[name].blocks>0)
 }finally{await negative.close()}
}
const absent=await fundacaoFixture(false,{legacyEpi:false})
try{
 const pre=await run(absent,'preflight')
 await migrate(absent,'024_fundacao_comercial.sql')
 const post=await run(absent,'postflight',pre)
 audit.optional_epi_absent={preflight:summarize(pre),postflight:summarize(post),comparison:comparePreservation(pre,post)}
 assert.equal(audit.optional_epi_absent.preflight.blocks,0)
 assert.equal(audit.optional_epi_absent.postflight.blocks,0)
 assert.ok(audit.optional_epi_absent.comparison.every(r=>r.STATUS==='OK'))
}finally{await absent.close()}
await writeFile(new URL('../../docs/audits/2026-10-03/fundacao-024-local-audit.json',import.meta.url),JSON.stringify(audit,null,2)+'\n')
console.log(JSON.stringify({stages:Object.fromEntries(Object.entries(audit.stages).map(([k,v])=>[k,{results:v.results,blocks:v.blocks,warnings:v.warnings.length}])),
 negative_cases:audit.negative_cases,preservation:true,existing_company_assignments:audit.existing_company_assignments},null,2))
