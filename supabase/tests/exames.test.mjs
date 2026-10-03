import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {examesFixture,migrate,id} from './exames-fixture.mjs'
import {actor,dataSnapshot,load} from './remediation-fixture.mjs'
const report=async(db,name)=>(await db.exec(await load(name))).flatMap(r=>r.rows??[])

test('023 preserves every legacy field/object and read-only pre/post prove contract',async()=>{
 const db=await examesFixture()
 try{
 const before=await dataSnapshot(db)
 const pre=await report(db,'023_exames_aso_preflight_readonly.sql')
 assert.deepEqual(pre.filter(r=>r.STATUS==='BLOQUEIO'),[])
 await migrate(db,'023_exames_aso.sql')
 const after=await dataSnapshot(db)
 after[3]=after[3].map(({resultado_aso,...r})=>{assert.equal(resultado_aso,null);return r})
 assert.deepEqual(after,before)
 const post=await report(db,'023_exames_aso_postflight_readonly.sql')
 assert.deepEqual(post.filter(r=>r.STATUS==='BLOQUEIO'),[])
 assert.deepEqual(post.filter(r=>r.CHECK.startsWith('Preservação:')),pre.filter(r=>r.CHECK.startsWith('Preservação:')))
 const snapshot=await dataSnapshot(db)
 await report(db,'023_exames_aso_postflight_readonly.sql')
 assert.deepEqual(await dataSnapshot(db),snapshot)
 }finally{await db.close()}
})

for(const [user,read,write] of [[1,false,false],[3,true,true],[4,true,true],[5,true,false],[7,false,false],[8,true,false],[9,false,false]]) {
 test(`ASO and catalog authorization actor ${user}`,async()=>{
 const db=await examesFixture(true)
 try {await actor(db,user,async()=>{
  const rows=(await db.query(`SELECT d.* FROM documentos d JOIN documento_tipos t ON t.id=d.tipo_id WHERE t.nome='ASO'`)).rows
  assert.equal(rows.length>0,read)
  assert.equal((await db.query('SELECT * FROM exames_catalogo')).rows.length,read?27:0)
  if(user!==8) {
   const updated=await db.query('UPDATE documentos SET resultado_aso=$1 WHERE id=$2 RETURNING id',['apto',id(901)])
   assert.equal(updated.rows.length,write?1:0)
   const deleted=await db.query('DELETE FROM documentos WHERE id=$1 RETURNING id',[id(902)])
   assert.equal(deleted.rows.length,write?1:0)
  }
 })}finally{await db.close()}
 })
}

test('new ASOs require subtype/employee; legacy nulls remain editable and unknown',async()=>{
 const db=await examesFixture()
 try {
 await db.query('UPDATE documentos SET colaborador_id=NULL,subtipo_exame=NULL WHERE id=$1',[id(901)])
 await migrate(db,'023_exames_aso.sql')
 await actor(db,3,async()=>{
  await db.query('UPDATE documentos SET observacoes=$1 WHERE id=$2',['unchanged legacy',id(901)])
  assert.equal((await db.query('SELECT resultado_aso FROM documentos WHERE id=$1',[id(901)])).rows[0].resultado_aso,null)
 })
 for(const values of [[null,'admissional'],[id(201),null]]) await actor(db,3,async()=>{
  await assert.rejects(db.query(`INSERT INTO documentos(empresa_id,tipo_id,titulo,colaborador_id,subtipo_exame)
   VALUES($1,(SELECT id FROM documento_tipos WHERE nome='ASO'),'New',$2,$3)`,[id(101),...values]),e=>e.code==='23514')
 })
 }finally{await db.close()}
})

test('new ASOs support five subtypes, optional dates/file and legitimate procedure grants',async()=>{
 const db=await examesFixture(true)
 try {
 for(const subtype of ['admissional','periodico','retorno_trabalho','mudanca_risco','demissional'])await actor(db,3,async()=>{
  const row=(await db.query(`INSERT INTO documentos(empresa_id,tipo_id,titulo,colaborador_id,subtipo_exame,exames_realizados)
   VALUES($1,(SELECT id FROM documento_tipos WHERE nome='ASO'),'New',$2,$3,ARRAY['Audiometria']) RETURNING *`,[id(101),id(201),subtype])).rows[0]
  assert.equal(row.vencimento,null);assert.equal(row.arquivo_path,null);assert.equal(row.resultado_aso,null)
  await db.query('UPDATE documentos SET exames_realizados=$1 WHERE id=$2',[['Hemograma'],row.id])
 })
 }finally{await db.close()}
})

for(const [label,payload,code] of [
 ['foreign employee',`colaborador_id='${id(202)}'`,'23503'],['clear subtype','subtipo_exame=NULL','23514'],
 ['bad result',"resultado_aso='unknown'",'23514'],['bad subtype',"subtipo_exame='unknown'",'23514'],
 ['unknown procedure',"exames_realizados=ARRAY['Unknown']",'23514'],['null procedure','exames_realizados=ARRAY[NULL]::text[]','23514'],
 ['duplicate procedure',"exames_realizados=ARRAY['Audiometria','Audiometria']",'23514'],
 ['wrong dates',"emissao='2027-01-01',vencimento='2026-01-01'",'23514'],
 ['swap type',"tipo_id=(SELECT id FROM documento_tipos WHERE nome='PGR')",'23514'],
 ['foreign path',`arquivo_path='${id(102)}/synthetic4.pdf'`,'42501'],
 ['signed URL',"arquivo_url='https://synthetic.test/sign?token=x'",'42501'],
])test(`023 rejects ${label}`,async()=>{
 const db=await examesFixture(true)
 try{await actor(db,3,async()=>assert.rejects(db.query(`UPDATE documentos SET ${payload} WHERE id=$1`,[id(901)]),e=>e.code===code))}
 finally{await db.close()}
})

test('non-ASO employee documents never become exams; 30/60 live status remains type-specific',async()=>{
 const db=await examesFixture(true)
 try{
 await db.query(`UPDATE documentos SET vencimento=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date+45 WHERE id IN ($1,$2)`,[id(901),id(908)])
 await actor(db,3,async()=>{
  const asos=(await db.query(`SELECT d.id FROM documentos d JOIN documento_tipos t ON t.id=d.tipo_id WHERE t.nome='ASO'`)).rows
  assert.equal(asos.length,3);assert.ok(!asos.some(r=>r.id===id(908)))
  const rows=(await db.query(`SELECT tipo_nome,status_calculado FROM vw_dashboard_documentos WHERE titulo='Synthetic'`)).rows
  assert.ok(rows.some(r=>r.tipo_nome==='ASO'&&r.status_calculado==='vigente'))
  assert.ok(rows.some(r=>r.tipo_nome==='PGR'&&r.status_calculado==='vencendo'))
 })
 }finally{await db.close()}
})

test('anon denied and pre/post detects catalog drift without changing data',async()=>{
 const db=await examesFixture(true)
 try{
 await actor(db,1,async()=>assert.rejects(db.query('SELECT * FROM exames_catalogo'),e=>e.code==='42501'),'anon')
 await db.exec('ALTER POLICY exames_catalogo_read ON exames_catalogo USING(true)')
 const before=await dataSnapshot(db)
 const rows=await report(db,'023_exames_aso_postflight_readonly.sql')
 assert.ok(rows.some(r=>r.STATUS==='BLOQUEIO'&&r.CHECK.includes('exames_catalogo_read')))
 assert.deepEqual(await dataSnapshot(db),before)
 }finally{await db.close()}
})

test('preflight/postflight contain no write statements or side-effect calls',async()=>{
 for(const name of ['023_exames_aso_preflight_readonly.sql','023_exames_aso_postflight_readonly.sql']) {
 const sql=await load(name)
 const code=sql.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''")
 assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i)
 assert.match(sql,/REPEATABLE READ READ ONLY/)
 }
})
