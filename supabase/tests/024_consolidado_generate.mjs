// Local text transformation only: does not open a database or load credentials.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
export function splitSql(sql) {
 const statements=[];let start=0,state='code'
 for(let i=0;i<sql.length;i++){
  const c=sql[i],next=sql[i+1]
  if(state==='comment'){if(c==='\n')state='code';continue}
  if(state==='string'){if(c==="'"&&next==="'"){i++;continue}if(c==="'")state='code';continue}
  if(state==='identifier'){if(c==='"'&&next==='"'){i++;continue}if(c==='"')state='code';continue}
  if(c==='-'&&next==='-'){state='comment';i++;continue}
  if(c==="'"){state='string';continue}
  if(c==='"'){state='identifier';continue}
  if(c===';'){statements.push(sql.slice(start,i).trim());start=i+1}
 }
 if(sql.slice(start).replace(/--[^\n]*/g,'').trim())throw new Error('Unterminated statement')
 return statements.filter(s=>s.replace(/--[^\n]*/g,'').trim())
}
export async function generateConsolidado() {
 const source=await readFile(new URL('024_fundacao_preflight_readonly.sql',import.meta.url),'utf8')
 const hash=createHash('sha256').update(source).digest('hex')
 const pieces=splitSql(source)
 assertStatement(pieces.shift(),/^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY$/)
 assertStatement(pieces.pop(),/^COMMIT$/)
 const ctes=[],parts=[]
 for(const [i,original] of pieces.entries()){
  assertStatement(original,/^(SELECT|WITH)\b/)
  // Keep original checks/status expressions; add expected/remote details to the catalog result only.
  let query=original
  if(i===0){
   const marker=/AS "STATUS"\s+FROM actual a FULL JOIN expected e USING\(identity\)/
   if(!marker.test(query))throw new Error('Unexpected catalog source shape; review generator')
   query=query.replace(marker,'AS "STATUS",a.detail AS "REMOTO",e.detail AS "ESPERADO"\n FROM actual a FULL JOIN expected e USING(identity)')
  }
  const category=i===0?null:original.includes('Colisão canônica')?'COLISOES_CNPJ':
   original.includes('canonical AS cnpj_canonico')?'CNPJ':original.includes('colaboradores_historicos')?'EMPRESAS_COLABORADORES':
   original.includes('WITH checks(label,n)')?'INTEGRIDADE_TENANT':original.includes("'Auditor integral'")?'AUDITOR':
   original.includes("'Papéis clientes não privilegiados'")?'PAPEIS':original.includes("'Auth sem perfil")?'AUTH':
   original.includes("'Ledger de migrations")?'MIGRATIONS':original.includes("'EPI/assinaturas:")?'EPI_ASSINATURAS':
   original.includes("'Signup e exposição")?'CONFIGURACAO_AUTH':original.includes("'Concessões/limites legados")?'BACKFILL_FREE':
   original.includes('SELECT id,name,public,file_size_limit')?'STORAGE':
   original.includes("'Preservação: catálogo opcional")||original.includes('WITH candidates AS')?'EPI_ASSINATURAS':
   original.includes("'Preservação:")?'PRESERVACAO':null
  if(i!==0&&!category)throw new Error('Unclassified original check; review generator')
  ctes.push(`source_${i} AS MATERIALIZED (${query}),rows_${i} AS (SELECT to_jsonb(r) raw FROM source_${i} r)`)
  const cat=category?`'${category}'`:catalogCategory
  parts.push(`SELECT ${i} section,${cat} AS category,
   coalesce(raw->>'CHECK',CASE WHEN raw ? 'empresa_id' THEN '${category==='CNPJ'?'CNPJ':'Empresa'}: '||(raw->>'empresa_id') ELSE 'Bucket: '||(raw->>'id') END) AS check_name,
   coalesce(raw->>'RESULTADO',(raw-'STATUS'-'CHECK')::text) AS result,
   raw->>'STATUS' AS status,raw-'CHECK'-'RESULTADO'-'STATUS' AS details FROM rows_${i}`)
  // The original collision SELECT has no rows when no collision exists. Preserve that fact visibly.
  if(category==='COLISOES_CNPJ')parts.push(`SELECT ${i},'COLISOES_CNPJ','Colisões canônicas encontradas','0','OK',
   jsonb_build_object('informativo_sem_linhas_no_original',true) WHERE NOT EXISTS(SELECT 1 FROM source_${i})`)
 }
 const sql=`-- Consolidated 024 preflight: ONE operational result set. Read-only, review only, no authorization to apply.
-- Reproduces each SELECT of the ORIGINAL preflight without changing its approval rules.
-- ORIGINAL_SHA256: ${hash}
-- Generated locally by 024_consolidado_generate.mjs; no database used during generation.
-- Execute this entire file. All checks below are intermediate CTEs, not output statements.
-- The only audit SELECT is FROM final; its last four rows are the summary.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH ${ctes.join(',\n')},
report AS (${parts.join('\nUNION ALL\n')}),
numbered AS (SELECT row_number() OVER(ORDER BY section,check_name,result,details::text) AS ordem,* FROM report),
totals AS (SELECT count(*) FILTER(WHERE status='OK') ok,count(*) FILTER(WHERE status='ATENÇÃO') warnings,
 count(*) FILTER(WHERE status='BLOQUEIO') blocks,count(*) n FROM report),
final AS (
 SELECT ordem,category,check_name,result,status,details FROM numbered
 UNION ALL SELECT n+1,'RESUMO','TOTAL_OK',ok::text,'OK',jsonb_build_object('exclui_resumo',true) FROM totals
 UNION ALL SELECT n+2,'RESUMO','TOTAL_ATENCOES',warnings::text,CASE WHEN warnings>0 THEN 'ATENÇÃO' ELSE 'OK' END,jsonb_build_object('exclui_resumo',true) FROM totals
 UNION ALL SELECT n+3,'RESUMO','TOTAL_BLOQUEIOS',blocks::text,CASE WHEN blocks>0 THEN 'BLOQUEIO' ELSE 'OK' END,jsonb_build_object('exclui_resumo',true) FROM totals
 UNION ALL SELECT n+4,'RESUMO','RESULTADO_FINAL',CASE WHEN blocks=0 THEN 'APROVADO PARA REVISÃO' ELSE 'REPROVADO — NÃO APLICAR 024' END,
 CASE WHEN blocks=0 THEN 'OK' ELSE 'BLOQUEIO' END,jsonb_build_object('nao_autoriza_aplicacao',true,'original_sha256','${hash}') FROM totals
)
SELECT ordem AS "ORDEM",category AS "CATEGORIA",check_name AS "CHECK",result AS "RESULTADO",status AS "STATUS",details AS "DETALHES"
FROM final ORDER BY ordem;
COMMIT;
`
 await writeFile(new URL('024_fundacao_preflight_consolidado_readonly.sql',import.meta.url),sql)
 return {hash,sourceQueries:pieces.length}
}
function assertStatement(sql,pattern){if(!pattern.test(sql.replace(/--[^\n]*/g,'').trim()))throw new Error('Unexpected source statement')}
const catalogCategory=`CASE split_part(raw->>'CHECK',':',1)
 WHEN 'relation' THEN 'CONTRATO' WHEN 'column' THEN 'SCHEMA' WHEN 'schema' THEN 'CONTRATO'
 WHEN 'policy' THEN 'POLICIES' WHEN 'grant' THEN 'GRANTS' WHEN 'function' THEN 'FUNCTIONS'
 WHEN 'trigger' THEN 'TRIGGERS' WHEN 'constraint' THEN 'CONSTRAINTS' WHEN 'index' THEN 'INDICES'
 WHEN 'view' THEN 'VIEWS' WHEN 'storage' THEN 'STORAGE' WHEN 'bucket' THEN 'STORAGE'
 WHEN 'optional-presence' THEN 'EPI_ASSINATURAS' ELSE 'CONTRATO' END`
if(process.argv[1]?.endsWith('024_consolidado_generate.mjs'))console.log(await generateConsolidado())
