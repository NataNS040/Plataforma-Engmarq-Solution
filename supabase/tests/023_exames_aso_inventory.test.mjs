import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,migrate,load,id,dataSnapshot} from './remediation-fixture.mjs'

const sql=await load('023_exames_aso_inventory_readonly.sql')
const run=async db=>(await db.exec(sql)).flatMap(r=>r.rows??[])
const check=(rows,name)=>rows.find(r=>r.CHECK===name)
async function setup(){const db=await fixture();await migrate(db,'021_documentos_empresas_security.sql');return db}

test('inventory has only read-only statements, including embedded aggregate query',()=>{
 const executable=sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''")
 assert.doesNotMatch(executable,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i)
 const dynamic=sql.match(/\$inventory\$([\s\S]*?)\$inventory\$/)[1]
 assert.doesNotMatch(dynamic,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i)
 assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/)
 assert.doesNotMatch(sql,/set_config|createSignedUrl|http_get|dblink|pg_sleep/i)
})

test('inventory preserves all data and catalog and reveals known grants/catalog gaps',async()=>{
 const db=await setup()
 try{
 const before=await dataSnapshot(db)
 const catalog=await db.query('SELECT oid,relacl,relrowsecurity FROM pg_class ORDER BY oid')
 const rows=await run(db)
 assert.deepEqual(await dataSnapshot(db),before)
 assert.deepEqual(await db.query('SELECT oid,relacl,relrowsecurity FROM pg_class ORDER BY oid'),catalog)
 assert.equal(check(rows,'Inventário completo disponível').STATUS,'OK')
 assert.equal(check(rows,'IDENTIFICAÇÃO: total_documentos').RESULTADO,'12')
 assert.equal(check(rows,'FK composta validada').STATUS,'OK')
 assert.equal(check(rows,'Catálogo authenticated USING true').STATUS,'ATENÇÃO')
 assert.equal(rows.filter(r=>r.BLOCO&&r.STATUS!=='OK').length,0)
 const output=JSON.stringify(rows)
 assert.ok(!output.includes('synthetic1.pdf'))
 assert.ok(!output.includes('User 3'))
 }finally{await db.close()}
})

test('ASOs are identified by type and free medical text never appears',async()=>{
 const db=await setup()
 try{
 await db.query(`INSERT INTO documentos(empresa_id,tipo_id,titulo,colaborador_id,subtipo_exame,observacoes,emissao,vencimento,exames_realizados)
 VALUES($1,(SELECT id FROM documento_tipos WHERE nome='ASO'),'PRIVATE_TITLE',$2,NULL,'PRIVATE_MEDICAL_CONTENT',CURRENT_DATE,CURRENT_DATE+45,ARRAY['PRIVATE_PROCEDURE'])`,[id(101),id(201)])
 const rows=await run(db)
 assert.equal(check(rows,'IDENTIFICAÇÃO: total_asos').RESULTADO,'1')
 assert.equal(check(rows,'STATUS_ASO: impacto30_60').RESULTADO,'1')
 assert.equal(check(rows,'OBSERVAÇÕES: outro_texto_nao_exposto').RESULTADO,'1')
 assert.equal(check(rows,'PROCEDIMENTOS: elementos_fora_catalogo').RESULTADO,'1')
 assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_TITLE|PRIVATE_MEDICAL_CONTENT|PRIVATE_PROCEDURE/)
 }finally{await db.close()}
})

test('missing column disables metrics rather than reporting false zero',async()=>{
 const db=await setup()
 try{
 await db.exec('ALTER TABLE documentos DROP COLUMN exames_realizados')
 const rows=await run(db)
 assert.equal(check(rows,'Inventário completo disponível').STATUS,'BLOQUEIO')
 assert.equal(check(rows,'IDENTIFICAÇÃO: total_documentos'),undefined)
 }finally{await db.close()}
})

test('missing FK and altered policy are detected without corrections',async()=>{
 const db=await setup()
 try{
 await db.exec('ALTER TABLE documentos DROP CONSTRAINT documentos_colaborador_tenant_fkey; ALTER POLICY documentos_select ON documentos USING(true)')
 const rows=await run(db)
 assert.equal(check(rows,'FK composta validada').STATUS,'BLOQUEIO')
 assert.equal(rows.find(r=>r.OBJETO==='documentos.documentos_select'||r.OBJETO==='public.documentos.documentos_select').STATUS,'BLOQUEIO')
 }finally{await db.close()}
})

test('missing bucket is a measured block and limited auditor cannot report partial counts',async()=>{
 const db=await setup()
 try{
 await db.exec("DELETE FROM storage.buckets WHERE id='documentos'")
 let rows=await run(db)
 assert.equal(check(rows,'STORAGE: bucket_config_invalida_ou_ausente').STATUS,'BLOQUEIO')
 await db.exec('SET ROLE authenticated')
 rows=await run(db)
 assert.equal(check(rows,'Inventário completo disponível').STATUS,'BLOQUEIO')
 assert.equal(check(rows,'IDENTIFICAÇÃO: total_documentos'),undefined)
 await db.exec('RESET ROLE')
 }finally{await db.close()}
})
