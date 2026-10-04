// Offline text transformation. No credentials, network or database access.
import {splitSql} from './024_consolidado_generate.mjs'
import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export function consolidatePostflight(source) {
 const queries=splitSql(source)
 if(!queries.shift().endsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')||queries.pop()!=='COMMIT')throw Error('Unexpected transaction')
 const ctes=[],parts=[]
 for(const [i,original] of queries.entries()) {
  let query=original
  if(i===0)query=query.replace('AS "STATUS"\n FROM actual', 'AS "STATUS",a.detail AS "REMOTO",e.detail AS "ESPERADO"\n FROM actual')
  const category=i===0?"CASE WHEN raw->>'CHECK' ~ '(fichas_epi|assinatur|(^|[._:])epi([._:(]|$))' THEN 'EPI_ASSINATURAS' ELSE 'CONTRATO_024' END":
   `'${original.includes('canonical')||original.includes('Derivação CNPJ')?'CNPJ':
   original.includes('colaboradores_historicos')||original.includes('WITH checks(label,n)')?'INTEGRIDADE':
   original.includes('Auditor integral')||original.includes('Papéis clientes')?'SEGURANCA':
   original.includes('Auth sem perfil')||original.includes('Signup e exposição')?'AUTH':
   original.includes('Ledger de migrations')?'MIGRATIONS':
   original.includes('EPI/assinaturas:')?'EPI_ASSINATURAS':
   original.includes('backfill')?'FREE_TIER':
   original.includes('SELECT id,name,public')?'STORAGE':
   original.includes('Preservação:')||original.includes('WITH candidates AS')||original.includes('Endereço novo')?'PRESERVACAO':'UNCLASSIFIED'}'`
  if(category.includes('UNCLASSIFIED'))throw Error('Unclassified check')
  ctes.push(`source_${i} AS MATERIALIZED (${query}),rows_${i} AS (SELECT to_jsonb(r) raw FROM source_${i} r)`)
  parts.push(`SELECT ${i} section,${category} category,
   coalesce(raw->>'CHECK',CASE WHEN raw ? 'empresa_id' THEN 'Empresa: '||(raw->>'empresa_id') ELSE 'Bucket: '||(raw->>'id') END) check_name,
   coalesce(raw->>'RESULTADO',(raw-'STATUS'-'CHECK')::text) result,
   raw->>'STATUS' status,raw-'CHECK'-'RESULTADO'-'STATUS' details FROM rows_${i}`)
  if(original.includes("SELECT 'Colisão canônica'"))parts.push(`SELECT ${i},'CNPJ','Colisões canônicas encontradas','0','OK','{}'::jsonb WHERE NOT EXISTS(SELECT 1 FROM source_${i})`)
 }
 return `-- Postflight 024 consolidado: exatamente UM result set operacional; execução manual imediata após 024.
-- Nenhuma escrita, correção ou autorização para executar migrations.
-- BASELINE: substitua SOMENTE o JSON entre os marcadores pelos rows exportados do preflight
-- correspondente (original ou consolidado), ou use 024_postflight_baseline.mjs offline.
-- Use a captura real pré-024 deste mesmo banco; nunca fingerprints de fixtures locais.
-- [] = baseline indisponível: ATENÇÃO explícita, sem afirmar preservação comprovada.
-- Baseline fornecido incompleto, duplicado, divergente ou objeto desaparecido = BLOQUEIO.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH baseline_input AS (SELECT
-- BEGIN PREFLIGHT BASELINE JSON
'[]'::jsonb
-- END PREFLIGHT BASELINE JSON
 AS payload),baseline AS (
 SELECT item->>'CHECK' check_name,item->>'RESULTADO' result
 FROM baseline_input CROSS JOIN LATERAL jsonb_array_elements(payload) item
 WHERE item->>'CHECK' LIKE 'Preservação: %'
),${ctes.join(',\n')},
raw_report AS (${parts.join('\nUNION ALL\n')}),
report AS (
 SELECT r.section,r.category,r.check_name,r.result,
 CASE WHEN r.check_name LIKE 'Preservação: %' AND (SELECT payload FROM baseline_input)<>'[]'::jsonb
 THEN CASE WHEN (SELECT count(*) FROM baseline b WHERE b.check_name=r.check_name)=1
 AND r.result IS NOT DISTINCT FROM (SELECT min(b.result) FROM baseline b WHERE b.check_name=r.check_name)
 THEN 'OK' ELSE 'BLOQUEIO' END ELSE r.status END status,
 CASE WHEN r.check_name LIKE 'Preservação: %' THEN r.details||jsonb_build_object(
 'baseline_disponivel',(SELECT payload FROM baseline_input)<>'[]'::jsonb,
 'fingerprint_preflight',(SELECT min(b.result) FROM baseline b WHERE b.check_name=r.check_name),
 'fingerprint_postflight',r.result,'criterio','igualdade exata de fingerprint/presença pré e pós-024') ELSE r.details END details
 FROM raw_report r
 UNION ALL SELECT 999,'PRESERVACAO',b.check_name,'objeto/result set desapareceu','BLOQUEIO',
 jsonb_build_object('fingerprint_preflight',b.result,'fingerprint_postflight',NULL)
 FROM baseline b WHERE NOT EXISTS(SELECT 1 FROM raw_report r WHERE r.check_name=b.check_name)
),numbered AS (SELECT row_number() OVER(ORDER BY section,check_name,result,details::text) ordem,* FROM report),
totals AS (SELECT count(*) FILTER(WHERE status='OK') ok,count(*) FILTER(WHERE status='ATENÇÃO') warnings,
 count(*) FILTER(WHERE status='BLOQUEIO') blocks,count(*) n FROM report),
final AS (
 SELECT ordem,category,check_name,result,status,details FROM numbered
 UNION ALL SELECT n+1,'RESUMO','TOTAL_OK',ok::text,'OK','{}'::jsonb FROM totals
 UNION ALL SELECT n+2,'RESUMO','TOTAL_ATENCOES',warnings::text,CASE WHEN warnings>0 THEN 'ATENÇÃO' ELSE 'OK' END,'{}'::jsonb FROM totals
 UNION ALL SELECT n+3,'RESUMO','TOTAL_BLOQUEIOS',blocks::text,CASE WHEN blocks>0 THEN 'BLOQUEIO' ELSE 'OK' END,'{}'::jsonb FROM totals
 UNION ALL SELECT n+4,'RESUMO','RESULTADO_FINAL',CASE WHEN blocks>0 THEN 'REPROVADO — 024 NÃO VALIDADA'
 ELSE '024 VALIDADA — APROVADO PARA REVISÃO FINAL' END,CASE WHEN blocks>0 THEN 'BLOQUEIO' ELSE 'OK' END,
 jsonb_build_object('baseline_disponivel',(SELECT payload FROM baseline_input)<>'[]'::jsonb,'atencoes_exigem_revisao',true) FROM totals
)
SELECT ordem AS "ORDEM",category AS "CATEGORIA",check_name AS "CHECK",result AS "RESULTADO",status AS "STATUS",details AS "DETALHES"
FROM final ORDER BY ordem;
COMMIT;
`
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=new URL('024_fundacao_postflight_readonly.sql',import.meta.url)
 const source=await readFile(file,'utf8')
 if(source.includes('raw_report AS'))throw Error('Already consolidated; refusing to overwrite')
 await writeFile(file,consolidatePostflight(source))
}
