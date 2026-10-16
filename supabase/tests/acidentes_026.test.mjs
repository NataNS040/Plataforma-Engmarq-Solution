import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import {readFile} from 'node:fs/promises'
import {fundacaoFixture,migrate,id,actor,load} from './fundacao-fixture.mjs'

// Production-shaped baseline: no legacy EPI objects, 025-A applied, then 026.
let db
const denied=e=>e.code==='42501'
const fk=e=>e.code==='23503'
const checkViolation=e=>e.code==='23514'
const parte='753030000',agente14='302010200',situacao='200004300',lesao='702000000'
const accident=(company,extra='')=>`INSERT INTO acidentes(empresa_id,colaborador_id,tipo,data_acidente,gravidade${extra?','+extra.split('=')[0]:''})
 VALUES('${id(company)}','${id(company+100)}','tipico','2026-03-10','leve'${extra?','+extra.split('=')[1]:''}) RETURNING *`

before(async()=>{
 db=await fundacaoFixture(true,{legacyEpi:false})
 await migrate(db,'025_entitlements_quota_hardening.sql')
 await migrate(db,'026_acidentes.sql')
 // Technical seed (not authenticated): one accident per tenant, authorship set explicitly.
 for(const company of [101,102,103])await db.query(`INSERT INTO acidentes(id,empresa_id,colaborador_id,tipo,data_acidente,gravidade,criado_por)
  VALUES($1,$2,$3,'tipico','2026-01-15','leve',$4)`,[id(company+600),id(company),id(company+100),id(4)])
})
after(async()=>await db?.close())

test('026 seeds exactly the official S-1.3 catalogs (13, 14, 15, 17)',async()=>{
 const rows=(await db.query('SELECT tabela,count(*)::int n FROM esocial_codigos GROUP BY tabela ORDER BY tabela')).rows
 assert.deepEqual(rows,[{tabela:13,n:45},{tabela:14,n:248},{tabela:15,n:60},{tabela:17,n:29}])
 for(const n of [13,14,15,17]){
  const tsv=(await readFile(new URL(`../data/esocial/tabela${n}.tsv`,import.meta.url),'utf8')).split('\n').filter(l=>/^[0-9]{9}\t/.test(l))
  const db_rows=(await db.query('SELECT codigo,descricao FROM esocial_codigos WHERE tabela=$1 ORDER BY codigo',[n])).rows
  assert.deepEqual(db_rows.map(r=>`${r.codigo}\t${r.descricao}`),tsv.map(l=>l.split('\t').slice(0,2).join('\t')).sort())
 }
})

test('026 grants the feature only to legacy tenants and keeps the 7-feature free tier contract',async()=>{
 const enabled=(await db.query("SELECT empresa_id FROM empresa_features WHERE feature_key='acidentes' AND enabled ORDER BY empresa_id")).rows
 assert.deepEqual(enabled.map(r=>r.empresa_id),[id(101),id(102),id(103)])
 const free=(await db.query(`SELECT count(*)::int n FROM features WHERE feature_key IN
  ('empresa.cadastro','usuarios.gestao','colaboradores.gestao','treinamentos','exames','documentos','relatorios.sst')`)).rows[0].n
 assert.equal(free,7)
})

// Actors from the shared fixture: 1 admin, 3 gestor, 4 empresa, 5 operacional (101),
// 7 inactive gestor (101), 8 operacional (102), 9 gestor of suspended company 103.
for(const [user,company,read,write] of [[1,101,false,false],[3,101,true,true],[4,101,true,true],[5,101,true,false],[7,101,false,false],[8,102,true,false],[9,103,false,false]]){
 test(`026 actor ${user}: read=${read} write=${write}, only own tenant`,async()=>actor(db,user,async()=>{
  const rows=(await db.query('SELECT empresa_id FROM acidentes')).rows
  assert.equal(rows.length>0,read)
  assert.ok(rows.every(r=>r.empresa_id===id(company)))
  assert.equal((await db.query('SELECT count(*)::int n FROM esocial_codigos')).rows[0].n>0,read)
  if(write){
   const row=(await db.query(accident(company))).rows[0]
   assert.equal(row.criado_por,id(user))
   assert.equal(row.anulado_em,null)
  }else{
   await assert.rejects(db.query(accident(company)),denied)
  }
 }))
}

test('026 commercial admin has no operational access to accidents or the summary',async()=>actor(db,1,async()=>{
 assert.equal((await db.query('SELECT count(*)::int n FROM acidentes')).rows[0].n,0)
 assert.equal((await db.query('SELECT count(*)::int n FROM vw_acidentes_resumo')).rows[0].n,0)
}))

test('026 tenant comes from the actor: foreign tenant and foreign employee are rejected',async()=>actor(db,3,async()=>{
 await db.exec('SAVEPOINT s')
 await assert.rejects(db.query(accident(102)),denied)
 await db.exec('ROLLBACK TO SAVEPOINT s')
 await assert.rejects(db.query(`INSERT INTO acidentes(empresa_id,colaborador_id,tipo,data_acidente,gravidade)
  VALUES('${id(101)}','${id(202)}','tipico','2026-03-10','leve')`),fk)
 await db.exec('ROLLBACK TO SAVEPOINT s')
 assert.equal((await db.query(`UPDATE acidentes SET gravidade='grave' WHERE id='${id(702)}' RETURNING id`)).rows.length,0)
}))

test('026 authorship columns are not writable by clients',async()=>actor(db,3,async()=>{
 for(const sql of [
  `INSERT INTO acidentes(empresa_id,colaborador_id,tipo,data_acidente,gravidade,criado_por) VALUES('${id(101)}','${id(201)}','tipico','2026-03-10','leve','${id(4)}')`,
  `UPDATE acidentes SET anulado_por='${id(4)}' WHERE id='${id(701)}'`,
  `UPDATE acidentes SET empresa_id='${id(102)}' WHERE id='${id(701)}'`,
  `UPDATE acidentes SET created_at=now() WHERE id='${id(701)}'`])
  await assert.rejects(db.exec('SAVEPOINT s; '+sql).finally(()=>db.exec('ROLLBACK TO SAVEPOINT s')),denied)
}))

test('026 eSocial codes are validated by FK and by the S-2210 table rules',async()=>actor(db,3,async()=>{
 const ok=(await db.query(accident(101,`codigo_parte_atingida,lateralidade,agente_tabela,codigo_agente_causador,codigo_situacao_geradora,codigo_natureza_lesao=
  '${parte}',0,14,'${agente14}','${situacao}','${lesao}'`))).rows[0]
 assert.equal(ok.parte_tabela,13);assert.equal(ok.lesao_tabela,17)
 const tries=[
  [`codigo_parte_atingida='999999999'`,fk],
  [`codigo_natureza_lesao='${parte}'`,fk],        // table 13 code used as table 17
  [`agente_tabela=15, codigo_agente_causador='${situacao}'`,checkViolation], // table 15 agent only for doença
  [`codigo_agente_causador=NULL`,checkViolation],  // table without code
  [`codigo_parte_atingida=NULL`,checkViolation]]   // laterality without body part
 for(const [set,expected] of tries){
  await db.exec('SAVEPOINT s')
  await assert.rejects(db.query(`UPDATE acidentes SET ${set} WHERE id='${ok.id}'`),expected)
  await db.exec('ROLLBACK TO SAVEPOINT s')
 }
 const doenca=(await db.query(`INSERT INTO acidentes(empresa_id,colaborador_id,tipo,data_acidente,gravidade,agente_tabela,codigo_agente_causador)
  VALUES('${id(101)}','${id(201)}','doenca','2026-03-10','leve',15,'${situacao}') RETURNING agente_tabela`)).rows[0]
 assert.equal(doenca.agente_tabela,15)
}))

test('026 business rules: future date, return date, death and leave consistency',async()=>actor(db,3,async()=>{
 for(const [cols,vals,code] of [
  ['data_acidente',"(now()+interval '3 days')::date",'23514'],
  ['houve_afastamento,data_retorno',"false,'2026-03-20'",'23514'],
  ['houve_afastamento,data_retorno',"true,'2026-03-01'",'23514'],
  ['houve_obito',"true",'23514']]){
  await db.exec('SAVEPOINT s')
  const base={empresa_id:`'${id(101)}'`,colaborador_id:`'${id(201)}'`,tipo:"'tipico'",data_acidente:"'2026-03-10'",gravidade:"'leve'"}
  cols.split(',').forEach((c,i)=>base[c]=vals.split(',')[i])
  await assert.rejects(db.query(`INSERT INTO acidentes(${Object.keys(base)}) VALUES(${Object.values(base)})`),e=>e.code===code)
  await db.exec('ROLLBACK TO SAVEPOINT s')
 }
}))

test('026 annulment is server-stamped, single-field and makes the record immutable',async()=>actor(db,4,async()=>{
 const row=(await db.query(accident(101))).rows[0]
 await db.exec('SAVEPOINT s')
 await assert.rejects(db.query(`UPDATE acidentes SET motivo_anulacao='Registro duplicado',gravidade='grave' WHERE id='${row.id}'`),denied)
 await db.exec('ROLLBACK TO SAVEPOINT s')
 const annulled=(await db.query(`UPDATE acidentes SET motivo_anulacao='Registro duplicado' WHERE id='${row.id}' RETURNING *`)).rows[0]
 assert.equal(annulled.anulado_por,id(4));assert.ok(annulled.anulado_em)
 assert.equal((await db.query(`UPDATE acidentes SET gravidade='grave' WHERE id='${row.id}' RETURNING id`)).rows.length,0)
 const updated=(await db.query(`UPDATE acidentes SET status='em_investigacao' WHERE id='${id(701)}' RETURNING atualizado_por`)).rows[0]
 assert.equal(updated.atualizado_por,id(4))
}))

test('026 accidents cannot be deleted by any client role',async()=>{
 for(const user of [3,4])await actor(db,user,async()=>{
  await assert.rejects(db.query(`DELETE FROM acidentes WHERE id='${id(701)}'`),denied)
 })
})

test('026 OFF entitlement hides accidents and catalogs even through direct SQL',async()=>{
 await db.exec('BEGIN')
 try{
  await db.query("UPDATE empresa_features SET enabled=false WHERE empresa_id=$1 AND feature_key='acidentes'",[id(101)])
  await db.exec('SET LOCAL ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(3)])
  assert.equal((await db.query('SELECT count(*)::int n FROM acidentes')).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*)::int n FROM esocial_codigos')).rows[0].n,0)
  assert.equal((await db.query('SELECT count(*)::int n FROM vw_acidentes_resumo')).rows[0].n,0)
  await assert.rejects(db.query(accident(101)),denied)
 }finally{await db.exec('ROLLBACK')}
})

test('026 monthly summary obeys tenant RLS and ignores annulled records',async()=>actor(db,3,async()=>{
 const a=(await db.query(accident(101,`piramide_bird='lesao_leve'`))).rows[0]
 await db.query(`UPDATE acidentes SET motivo_anulacao='Teste de anulação' WHERE id='${a.id}'`)
 const rows=(await db.query('SELECT empresa_id,sum(total)::int total FROM vw_acidentes_resumo GROUP BY empresa_id')).rows
 assert.deepEqual(rows,[{empresa_id:id(101),total:1}])
}))

test('026 catalog stays read-only for clients',async()=>actor(db,3,async()=>{
 await assert.rejects(db.query(`INSERT INTO esocial_codigos(tabela,codigo,descricao) VALUES(13,'000000001','x')`),denied)
}))

test('026 adds exactly one private function (the guard) and keeps it non-executable by clients',async()=>{
 const fns=(await db.query(`SELECT p.oid::regprocedure::text f,has_function_privilege('authenticated',p.oid,'EXECUTE') auth,
  has_function_privilege('anon',p.oid,'EXECUTE') anon,p.prosecdef definer,p.proconfig cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private' AND p.proname LIKE '%acidente%'`)).rows
 assert.deepEqual(fns,[{f:'engmarq_private.guard_acidente_write()',auth:false,anon:false,definer:true,cfg:['search_path=""']}])
})

test('026 is atomic and refuses to run twice',async()=>{
 await assert.rejects(migrate(db,'026_acidentes.sql'),/026 objects already present/)
 await db.exec('ROLLBACK').catch(()=>{})
 assert.equal((await db.query("SELECT count(*)::int n FROM features WHERE feature_key='acidentes'")).rows[0].n,1)
})

test('026 preflight and postflight audits are read-only and report OK',async()=>{
 for(const stage of ['preflight','postflight']){
  const sql=await load(`026_acidentes_${stage}_readonly.sql`)
  const code=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'')
  assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|LOCK)\b/i)
  assert.match(sql,/REPEATABLE READ READ ONLY/)
 }
 const result=(await db.exec(await load('026_acidentes_postflight_readonly.sql'))).find(r=>r.fields.some(f=>f.name==='status'))
 assert.equal(result.rows.length,14)
 assert.deepEqual(result.rows.filter(r=>r.status!=='OK'),[])
})

test('026 preflight blocks a database where 026 is already applied',async()=>{
 const result=(await db.exec(await load('026_acidentes_preflight_readonly.sql'))).find(r=>r.fields.some(f=>f.name==='status'))
 assert.deepEqual(result.rows.filter(r=>r.status==='BLOQUEIO').map(r=>r.check).sort(),
  ['026 ainda não aplicada: feature acidentes ausente','026 ainda não aplicada: guard ausente','026 ainda não aplicada: tabelas e view ausentes'])
})

test('026 preflight passes on a clean 025-A database',async()=>{
 const clean=await fundacaoFixture(true,{legacyEpi:false})
 try{
  await migrate(clean,'025_entitlements_quota_hardening.sql')
  const result=(await clean.exec(await load('026_acidentes_preflight_readonly.sql'))).find(r=>r.fields.some(f=>f.name==='status'))
  assert.deepEqual(result.rows.filter(r=>r.status!=='OK'),[])
 }finally{await clean.close()}
})
