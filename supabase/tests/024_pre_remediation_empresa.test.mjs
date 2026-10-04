import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fundacaoFixture,load,id,dataSnapshot} from './fundacao-fixture.mjs'
import {splitSql} from './024_consolidado_generate.mjs'
const file='024_pre_remediation_empresa_readonly.sql'
const target='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
const endings=['TOTAL_REFERENCIAS_EMPRESA','TEM_PERFIL','TEM_COLABORADORES','TEM_DOCUMENTOS',
 'TEM_TREINAMENTOS','TEM_STORAGE','COINCIDE_COM_SEED','CLASSIFICACAO']
async function run(db,company=id(101)) {
 const results=await db.exec((await load(file)).replaceAll(target,company))
 const operational=results.filter(r=>r.fields?.length)
 assert.equal(operational.length,1,'Only one operational result set')
 assert.equal(results.filter(r=>r.fields?.length).at(-1),operational[0])
 assert.deepEqual(operational[0].fields.map(f=>f.name),['ORDEM','CATEGORIA','CHECK','RESULTADO','STATUS','DETALHES'])
 const rows=operational[0].rows
 assert.deepEqual(rows.slice(-8).map(r=>r.CHECK),endings)
 assert.deepEqual(rows.map(r=>Number(r.ORDEM)),rows.map((_,i)=>i+1))
 return rows
}
const conclusion=rows=>Object.fromEntries(rows.filter(r=>r.CATEGORIA==='CONCLUSAO').map(r=>[r.CHECK,r.RESULTADO]))

test('empresa auditor: three statements, SELECT-only dynamic SQL, no DML/DDL or Auth/Storage mutation',async()=>{
 const sql=await load(file),statements=splitSql(sql)
 assert.equal(statements.length,3)
 assert.match(statements[0],/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY$/)
 assert.match(statements[1],/^WITH RECURSIVE\b/)
 assert.equal(statements[2],'COMMIT')
 const withoutComments=sql.replace(/--[^\n]*/g,'')
 const code=withoutComments.replace(/'(?:''|[^'])*'/g,"''")
 assert.doesNotMatch(code,/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|COPY|SET|LOCK)\b/i)
 // Also inspect strings: dynamic commands may not hide mutations in literals.
 const literals=[...withoutComments.matchAll(/'((?:''|[^'])*)'/g)].map(m=>m[1].replaceAll("''","'"))
 for(const literal of literals)assert.doesNotMatch(literal,/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY)\b/i)
 assert.doesNotMatch(code,/\b(dblink|http|pg_read_file|lo_export|set_config)\s*\(/i)
 assert.match(sql,/query_to_xml\(/)
})

for(const legacyEpi of [true,false])test(`empresa auditor: all inventory blocks, no PII/mutation, EPI ${legacyEpi}`,async()=>{
 const db=await fundacaoFixture(false,{legacyEpi})
 try {
  await db.exec('ALTER TABLE auth.users ADD COLUMN email text')
  await db.exec(`CREATE TABLE public.unexpected_tenant(id uuid PRIMARY KEY,empresa_id uuid REFERENCES empresas(id));
   CREATE TABLE public.unexpected_indirect(id uuid PRIMARY KEY,documento_id uuid REFERENCES documentos(id));`)
  await db.query('INSERT INTO unexpected_tenant VALUES($1,$2)',[id(4001),id(101)])
  await db.exec('INSERT INTO unexpected_indirect SELECT id,id FROM documentos LIMIT 1')
  await db.query(`INSERT INTO treinamentos(id,empresa_id,colaborador_id,treinamento_tipo_id,data_realizacao)
   VALUES($1,$2,$3,(SELECT id FROM treinamento_tipos LIMIT 1),'2026-01-01')`,[id(4002),id(101),id(201)])
  const before=await dataSnapshot(db)
  const authBefore=(await db.query('SELECT * FROM auth.users ORDER BY id')).rows
  const unexpectedBefore=(await db.query('SELECT * FROM unexpected_indirect')).rows
  const rows=await run(db)
  for(const category of ['AUDITOR','EMPRESA','PERFIS','COLABORADORES','TABELAS_EMPRESA_ID',
   'REFERENCIAS_FK','FK_INVENTARIO','RESUMO_DOMINIO','STORAGE','CATÁLOGO_GLOBAL','CONCLUSAO'])
   assert.ok(rows.some(r=>r.CATEGORIA===category),category)
  for(const table of ['colaboradores','funcoes','setores','ambientes','documentos','treinamentos','matriz_treinamentos','user_profiles','unexpected_tenant','unexpected_indirect'])
   assert.ok(rows.some(r=>r.CATEGORIA==='RESUMO_DOMINIO'&&r.DETALHES.tabela===table),table)
  assert.ok(rows.some(r=>r.CHECK==='ASOs'))
  assert.equal(rows.some(r=>r.CATEGORIA==='RESUMO_DOMINIO'&&r.DETALHES.tabela==='fichas_epi'),legacyEpi)
  assert.ok(rows.filter(r=>r.CATEGORIA==='CATÁLOGO_GLOBAL').every(r=>r.DETALHES.pertence_a_empresa===false))
  const facts=conclusion(rows)
  assert.equal(facts.CLASSIFICACAO,'EMPRESA_COM_USO_OPERACIONAL')
  for(const flag of ['TEM_PERFIL','TEM_COLABORADORES','TEM_DOCUMENTOS','TEM_TREINAMENTOS','TEM_STORAGE'])assert.equal(facts[flag],'true')
  // Exact deduplicated total from direct tenant rows plus one indirect-only row.
  const direct=(await db.query(`SELECT sum(n)::int total FROM (
   SELECT count(*) n FROM user_profiles WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM colaboradores WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM funcoes WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM setores WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM ambientes WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM documentos WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM treinamentos WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM matriz_treinamentos WHERE empresa_id=$1 UNION ALL
   SELECT count(*) FROM unexpected_tenant WHERE empresa_id=$1) counts`,[id(101)])).rows[0].total
  assert.equal(Number(facts.TOTAL_REFERENCIAS_EMPRESA),direct+1+(legacyEpi?2:0))
  assert.deepEqual(await dataSnapshot(db),before)
  assert.deepEqual((await db.query('SELECT * FROM auth.users ORDER BY id')).rows,authBefore)
  assert.deepEqual((await db.query('SELECT * FROM unexpected_indirect')).rows,unexpectedBefore)
  const output=JSON.stringify(rows)
  for(const pii of ['12345678901','Synthetic employee','user3@example.com','signature.jpg','synthetic1.pdf'])assert.ok(!output.includes(pii),pii)
  for(const r of rows.filter(r=>r.CATEGORIA==='STORAGE'&&r.DETALHES.bucket))assert.deepEqual(Object.keys(r.DETALHES).sort(),['bucket','quantidade'])
  assert.equal(rows.at(-1).DETALHES.nao_autoriza_exclusao,true)
 }finally{await db.close()}
})

test('empresa auditor: classification reflects seed/data evidence, absent company stays indeterminate',async()=>{
 const db=await fundacaoFixture(false,{legacyEpi:false})
 try {
  await db.exec('ALTER TABLE auth.users ADD COLUMN email text')
  await db.query('UPDATE empresas SET razao_social=$1,cnpj=$2 WHERE id=$3',
   ['Norveo Tecnologia e Gestão Ltda','12.345.678/0001-99',id(101)])
  assert.equal(conclusion(await run(db)).CLASSIFICACAO,'POSSIVEL_BOOTSTRAP_COM_DADOS')
  // Separate synthetic bootstrap with no operational rows; never a remote write.
  await db.query('INSERT INTO empresas(id,razao_social,cnpj,status) VALUES($1,$2,$3,$4)',
   [id(4999),'Norveo Tecnologia e Gestão Ltda','bootstrap-synthetic','ativa'])
  let rows=await run(db,id(4999))
  assert.equal(conclusion(rows).CLASSIFICACAO,'INDETERMINADO')
  await db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',['other-synthetic',id(101)])
  await db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',['12.345.678/0001-99',id(4999)])
  rows=await run(db,id(4999))
  const facts=conclusion(rows)
  assert.equal(facts.CLASSIFICACAO,'POSSIVEL_BOOTSTRAP_SEM_DADOS_OPERACIONAIS')
  assert.equal(facts.TOTAL_REFERENCIAS_EMPRESA,'0')
  for(const key of endings.filter(k=>k.startsWith('TEM_')))assert.equal(facts[key],'false')
  rows=await run(db,id(4998))
  assert.equal(conclusion(rows).CLASSIFICACAO,'INDETERMINADO')
  assert.equal(rows.at(-1).STATUS,'BLOQUEIO')
  assert.ok(rows.some(r=>r.CATEGORIA==='EMPRESA'&&r.STATUS==='BLOQUEIO'))
 }finally{await db.close()}
})

test('empresa auditor: non-integral auditor blocks and classification stays indeterminate',async()=>{
 const db=await fundacaoFixture(false,{legacyEpi:false})
 try {
  await db.exec(`ALTER TABLE auth.users ADD COLUMN email text;
   GRANT SELECT ON ALL TABLES IN SCHEMA public,auth,storage TO authenticated;
   GRANT USAGE ON SCHEMA storage,auth TO authenticated;
   SET ROLE authenticated;`)
  const rows=await run(db)
  assert.equal(rows.find(r=>r.CATEGORIA==='AUDITOR').STATUS,'BLOQUEIO')
  assert.equal(rows.find(r=>r.CATEGORIA==='AUDITOR').RESULTADO,'authenticated')
  assert.equal(conclusion(rows).CLASSIFICACAO,'INDETERMINADO')
  assert.ok(rows.every(r=>r.STATUS==='BLOQUEIO'))
 }finally{await db.exec('ROLLBACK');await db.close()}
})
