import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {fundacaoFixture,id} from './fundacao-fixture.mjs'
const sql=await readFile(new URL('025_preflight_remoto_manual.sql',import.meta.url),'utf8')
// Lexical parser: comments/literals are tokens, never mistaken for executable SQL.
export function parseReadonly(source){
 const tokens=[];let i=0
 while(i<source.length){
  const rest=source.slice(i);let m
  if(m=/^\s+|^--[^\n]*(?:\n|$)/.exec(rest)){i+=m[0].length;continue}
  if(rest.startsWith('/*')){const end=rest.indexOf('*/');assert.ok(end>=0);i+=end+2;continue}
  if(m=/^'(?:''|[^'])*'|^"(?:""|[^"])*"/.exec(rest)){tokens.push({type:'literal',value:m[0]});i+=m[0].length;continue}
  // Only this fixed read-only regex may be dollar quoted; never executable code.
  if(rest.startsWith('$tokens$')){const end=rest.indexOf('$tokens$',8);assert.ok(end>=0);tokens.push({type:'literal',value:rest.slice(0,end+8)});i+=end+8;continue}
  assert.ok(!rest.startsWith('$'),'Dollar quoted code/parameters prohibited')
  if(m=/^[A-Za-z_][\w$]*/.exec(rest)){tokens.push({type:'word',value:m[0].toUpperCase()});i+=m[0].length;continue}
  tokens.push({type:'symbol',value:rest[0]});i++
 }
 const statements=[];let current=[],depth=0
 for(const t of tokens){if(t.value==='(')depth++;if(t.value===')')depth--;assert.ok(depth>=0);if(t.value===';'){assert.equal(depth,0);statements.push(current);current=[]}else current.push(t)}
 assert.equal(depth,0);assert.equal(current.length,0);assert.equal(statements.length,3)
 assert.equal(statements[0].map(t=>t.value).join(' '),'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert.equal(statements[2].map(t=>t.value).join(' '),'COMMIT')
 assert.equal(statements[1][0].value,'WITH')
 const forbidden=new Set('INSERT UPDATE DELETE MERGE CREATE ALTER DROP TRUNCATE GRANT REVOKE SET RESET DO CALL COPY VACUUM ANALYZE LOCK INTO NEXTVAL SETVAL PG_ADVISORY_LOCK PG_SLEEP'.split(' '))
 for(const t of statements[1])if(t.type==='word')assert.ok(!forbidden.has(t.value),`Forbidden SQL: ${t.value}`)
 assert.ok(!/\bFOR\s+(UPDATE|SHARE|NO\s+KEY|KEY\s+SHARE)\b/i.test(statements[1].filter(t=>t.type!=='literal').map(t=>t.value).join(' ')))
 assert.ok(!/engmarq_private\s*\.\s*cnpj_\w+\s*\(/i.test(tokens.filter(t=>t.type!=='literal').map(t=>t.value).join(' ')),'No remote CNPJ execution')
 // Dynamic SQL literals used by query_to_xml must be SELECT-only fingerprints.
 for(let n=0;n<tokens.length;n++)if(tokens[n].value==='QUERY_TO_XML'){
  const literal=tokens[n+2];if(literal.value==='FORMAT'){assert.equal(tokens[n+3].value,'(');assert.equal(tokens[n+4].type,'literal');assert.ok(tokens[n+4].value.startsWith("'SELECT encode(convert_to(jsonb_build_object(''columns'',%L::jsonb,") || tokens[n+4].value.startsWith("'SELECT count(*) AS violacoes FROM %I.%I r WHERE %s AND NOT EXISTS (SELECT 1 FROM %I.%I p WHERE %s)'") || tokens[n+4].value.startsWith("'SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,''[]'')) fingerprint FROM %I.%I r'"));continue}assert.equal(literal.type,'literal');const query=literal.value.slice(1,-1).replaceAll("''", "'")
  assert.match(query,/^SELECT md5\(coalesce\(jsonb_agg\(to_jsonb\(r\) ORDER BY to_jsonb\(r\)::text\)::text,'\[\]'\)\) fingerprint FROM (public|storage|engmarq_private)\.\w+ r$/)
 }
 const allowed=new Set('BASELINE_INPUT BASELINE CONTRACT ACTUAL RELATIONS ENTRIES EXPECTED FINGERPRINTS STATE_CHECKS RAW NUMBERED TOTALS FINAL ELSE WHEN THEN SELECT JOIN WHERE NOT AND OR ON USING E R OPTIONAL WEIGHTS KEYS WITH AS IN EXISTS FROM LATERAL VALUES FILTER OVER CASE TEXT NUMERIC VARCHAR COUNT MIN COALESCE ROW_NUMBER JSONB_BUILD_OBJECT JSONB_AGG JSONB_ARRAY_ELEMENTS JSONB_TO_RECORDSET TO_JSONB MD5 REPLACE ARRAY UNNEST XPATH QUERY_TO_XML FORMAT FORMAT_TYPE PG_GET_USERBYID PG_HAS_ROLE PG_GET_EXPR PG_GET_TRIGGERDEF PG_GET_CONSTRAINTDEF PG_GET_VIEWDEF PG_GET_FUNCTIONDEF HAS_FUNCTION_PRIVILEGE HAS_TABLE_PRIVILEGE HAS_COLUMN_PRIVILEGE HAS_SCHEMA_PRIVILEGE TO_REGCLASS ACLEXPLODE ACLDEFAULT CARDINALITY STRING_AGG POSITION SPLIT_PART BTRIM SUBSTR REPEAT ASCII SUM'.split(' '))
 allowed.add('HAS_SEQUENCE_PRIVILEGE')
 allowed.add('REGEXP_MATCHES')
 allowed.add('TOKENS')
 for(const name of 'SNAPSHOTS EXPORT_PAYLOAD CURRENT_DATABASE CONVERT_FROM CONVERT_TO ENCODE DECODE JSONB_OBJECT_AGG JSONB_EACH JSONB_EACH_TEXT JSONB_ARRAY_ELEMENTS_TEXT JSONB_TYPEOF TO_REGPROCEDURE KEY LOWER'.split(' '))allowed.add(name)
 for(let n=0;n<statements[1].length-1;n++)if(statements[1][n].type==='word'&&statements[1][n+1].value==='(')assert.ok(allowed.has(statements[1][n].value),`Unreviewed function/construct: ${statements[1][n].value}`)
 return statements
}
test('manual SQL parses as exactly three read-only statements; rejects mutations',()=>{
 parseReadonly(sql)
 for(const mutation of ['DELETE FROM empresas','SELECT nextval(\'x\')','SELECT public.unknown_mutator()','SELECT 1 INTO temp_table','CALL public.rpc()','SELECT 1 FOR UPDATE','CREATE TEMP TABLE t(a int)'])assert.throws(()=>parseReadonly(sql.replace('WITH baseline_input',`${mutation}; WITH baseline_input`)))
 assert.throws(()=>parseReadonly(sql.replace('raw AS (','raw AS (DELETE FROM empresas RETURNING *), other AS (')))
 assert.throws(()=>parseReadonly(sql.replace('raw AS (', 'raw AS (SELECT public.unknown_mutator() UNION ALL ')))
})
for(const legacyEpi of [true,false])test(`manual preflight local execution and adversarial coverage; EPI=${legacyEpi}`,async()=>{
 const db=await fundacaoFixture(true,{legacyEpi})
 try{
  const result=await db.exec(sql),rows=result.flatMap(r=>r.rows??[])
  assert.equal(result.filter(r=>r.rows?.length).length,1)
  assert.deepEqual(Object.keys(rows[0]),['ORDEM','CATEGORIA','CHECK','RESULTADO','STATUS','DETALHES'])
  assert.deepEqual(rows.slice(-4).map(r=>r.CHECK),['TOTAL_OK','TOTAL_ATENCOES','TOTAL_BLOQUEIOS','RESULTADO_FINAL'])
  assert.deepEqual(rows.filter(r=>r.STATUS==='BLOQUEIO'),[])
  assert.equal(rows.at(-1).RESULTADO,'APROVADO PARA REVISÃO — NÃO AUTORIZA APLICAÇÃO')
  await db.exec(`INSERT INTO storage.buckets(id,name,public) VALUES('unknown','unknown',true); GRANT EXECUTE ON FUNCTION public.get_user_empresa_id() TO PUBLIC; UPDATE colaboradores SET active=false WHERE id='${id(201)}'`)
  const bad=(await db.exec(sql)).flatMap(r=>r.rows??[])
  assert.ok(bad.some(r=>r.CHECK==='Inventário bucket: unknown'&&r.STATUS==='BLOQUEIO'))
  assert.ok(bad.some(r=>r.CHECK.startsWith('EXECUTE:')&&r.STATUS==='BLOQUEIO'))
  assert.equal(bad.at(-1).RESULTADO,'REPROVADO — NÃO APLICAR 025')
  assert.ok(bad.find(r=>r.CHECK==='Colaboradores ativos/inativos/total').DETALHES.inativos>0)
  await db.exec(`CREATE OR REPLACE FUNCTION engmarq_private.cnpj_valido(raw text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'unknown remote body must never execute'; END $$`)
  const drift=(await db.exec(sql)).flatMap(r=>r.rows??[])
  assert.ok(drift.some(r=>r.CHECK.includes('cnpj_valido')&&r.STATUS==='BLOQUEIO'))
  await db.exec(`ALTER TABLE documentos DISABLE TRIGGER USER; ALTER TABLE documentos DROP CONSTRAINT documentos_arquivo_path_check; ALTER TABLE documentos DROP CONSTRAINT documentos_colaborador_tenant_fkey; UPDATE documentos SET colaborador_id='${id(201)}',empresa_id='${id(102)}' WHERE empresa_id='${id(101)}'`)
  const cross=(await db.exec(sql)).flatMap(r=>r.rows??[])
  assert.ok(cross.some(r=>r.CHECK==='Tenant documentos.colaborador_id'&&r.STATUS==='BLOQUEIO'))
 }finally{await db.close()}
})

