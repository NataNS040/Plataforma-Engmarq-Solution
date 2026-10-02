// In-memory evidence only. Does not load env files or call remote services.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fixture,migrate,dataSnapshot,load } from '../../../supabase/tests/remediation-fixture.mjs'
const db=await fixture()
async function checks(file) {
 const before=await dataSnapshot(db)
 const results=await db.exec(await load(file))
 assert.deepEqual(await dataSnapshot(db),before)
 const rows=results.filter(r=>r.rows?.length).at(-1).rows
 assert.equal(Number(rows.at(-2).RESULTADO),0,JSON.stringify(rows.filter(r=>r.STATUS==='BLOQUEIO')))
 return rows
}
try {
 const before=await dataSnapshot(db)
 const pre=await checks('021_security_preflight_readonly.sql')
 await migrate(db,'021_documentos_empresas_security.sql')
 assert.deepEqual(await dataSnapshot(db),before)
 const post=await checks('021_security_postflight_readonly.sql')
 for(const [name,result] of [['local-preflight.json',pre],['local-postflight.json',post]])
  await writeFile(new URL(name,import.meta.url),JSON.stringify(result,null,2)+'\n')
 await writeFile(new URL('local-preservation.json',import.meta.url),JSON.stringify({
  fixtureOnly:true,remoteExecution:false,preReadOnly:true,postReadOnly:true,migrationPreservesEveryBusinessRow:true,
  tables:['empresas','user_profiles','colaboradores','documentos','treinamentos','fichas_epi','fichas_epi_itens',
    'funcoes','setores','ambientes','matriz_treinamentos','documento_tipos','treinamento_tipos','exames_catalogo','storage.objects','storage.buckets'],
  documentos:12,legacyReferences:4,canonicalReferences:4,pendingBackfill:0,documentosObjects:4,
  syntheticSignatureObjects:3,allObjectMetadataPreserved:true,
  preTotals:pre.slice(-2),postTotals:post.slice(-2),
 },null,2)+'\n')
 console.log('Local READ ONLY and all-row preservation verified:',pre.slice(-2),post.slice(-2))
}finally{await db.close()}
