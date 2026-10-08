// Local PGlite contract generation ONLY. No env, network, credentials or remote baseline.
import {readFile,writeFile} from 'node:fs/promises'
import {fundacaoFixture,migrate} from './fundacao-fixture.mjs'
import {catalog,contractDiff,preservation} from './025-catalog.mjs'
import {assertReviewedInfrastructure} from './025-reviewed-infrastructure.mjs'
const url=new URL('../migrations/025_entitlements_quota_hardening.sql',import.meta.url)
// Investigation can regenerate auditors without editing the pending migration.
const auditorsOnly=process.argv.includes('--auditors-only')
const db=await fundacaoFixture(true)
try{
 const pre=(await db.query(catalog)).rows
 assertReviewedInfrastructure(pre)
 let sql=await readFile(url,'utf8')
 const diff=contractDiff(pre,{pre:true})
 const assertion=`-- BEGIN GENERATED 025 BASELINE ASSERTION
DO $contract$ BEGIN
 IF EXISTS(SELECT 1 FROM (${diff}) report WHERE status='BLOQUEIO') THEN
 RAISE EXCEPTION '025 baseline contract drift: review read-only preflight; no overwrite'; END IF;
END $contract$;
-- END GENERATED 025 BASELINE ASSERTION`
 sql=sql.replace(/-- BEGIN GENERATED 025 BASELINE ASSERTION[\s\S]*?-- END GENERATED 025 BASELINE ASSERTION/,()=>assertion)
 if(!auditorsOnly)await writeFile(url,sql)
 await migrate(db,'025_entitlements_quota_hardening.sql')
 const post=(await db.query(catalog)).rows
 assertReviewedInfrastructure(post,{post:true})
 for(const [stage,expected] of [['preflight',pre],['postflight',post]]){
  const after=stage==='postflight'
  const checks=after?`
 SELECT 'Contador exato: '||e.id check_name,coalesce(u.colaboradores_ativos::text,'ausente') result,
 CASE WHEN u.colaboradores_ativos=(SELECT count(*) FROM public.colaboradores c WHERE c.empresa_id=e.id AND c.active) THEN 'OK' ELSE 'BLOQUEIO' END status,
 jsonb_build_object('empresa_id',e.id) details FROM public.empresas e LEFT JOIN public.empresa_uso u ON u.empresa_id=e.id
 UNION ALL SELECT 'Legado: '||l.empresa_id,coalesce(c.origem,'ausente'),
 CASE WHEN c.empresa_id IS NOT NULL AND z.empresa_id IS NOT NULL AND
 (l.comercial_antes IS NOT NULL OR l.features_antes<>'[]'::jsonb OR NOT EXISTS(SELECT 1 FROM public.features f WHERE f.feature_key<>'epi' AND NOT EXISTS(SELECT 1 FROM public.empresa_features x WHERE x.empresa_id=l.empresa_id AND x.feature_key=f.feature_key)))
 AND (l.comercial_antes IS NULL OR to_jsonb(c)=l.comercial_antes)
 AND (l.limite_antes IS NULL OR to_jsonb(z)=l.limite_antes)
 AND (l.limite_antes IS NOT NULL OR (z.ilimitado AND z.max_colaboradores_ativos IS NULL))
 AND (l.comercial_antes IS NOT NULL OR c.origem='legado')
 AND NOT EXISTS(SELECT 1 FROM public.features f JOIN public.empresa_features x ON x.feature_key=f.feature_key AND x.empresa_id=l.empresa_id
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(l.features_antes) prior WHERE prior->>'feature_key'=f.feature_key) AND (l.comercial_antes IS NOT NULL OR l.features_antes<>'[]'::jsonb OR f.feature_key='epi' OR x.enabled IS DISTINCT FROM true))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(l.features_antes) f WHERE NOT EXISTS(SELECT 1 FROM public.empresa_features x WHERE x.empresa_id=l.empresa_id AND to_jsonb(x)=f))
 THEN 'OK' ELSE 'BLOQUEIO' END,jsonb_build_object('origem_concessoes',l.origem)
 FROM engmarq_private.fundacao_025_legado l LEFT JOIN public.empresa_comercial c ON c.empresa_id=l.empresa_id LEFT JOIN public.empresa_limites z ON z.empresa_id=l.empresa_id
 UNION ALL SELECT 'Manifesto de corte completo',count(*)::text,CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.empresas e WHERE NOT EXISTS(SELECT 1 FROM engmarq_private.fundacao_025_legado l WHERE l.empresa_id=e.id)
 UNION ALL SELECT 'Mapeamento estável de tipos',count(*)::text,CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.documento_tipos t LEFT JOIN engmarq_private.documento_tipo_features m ON m.tipo_id=t.id WHERE m.feature_key IS DISTINCT FROM CASE lower(btrim(t.nome)) WHEN 'aso' THEN 'exames' WHEN 'ficha de epi' THEN 'epi' WHEN 'certificado de treinamento' THEN 'treinamentos' ELSE 'documentos' END
 UNION ALL SELECT 'Transições operacionais durante aplicação',count(*)::text,CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM engmarq_private.colaborador_transicoes
 `:`SELECT 'Empresa afetada pelo backfill: '||e.id check_name,count(c.id) FILTER(WHERE c.active)::text result,'ATENÇÃO' status,
 jsonb_build_object('status_empresa',e.status,'origem_atual',x.origem,'limite_atual',l.max_colaboradores_ativos,'ilimitado_atual',l.ilimitado,'features_atuais',(SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') FROM public.empresa_features f WHERE f.empresa_id=e.id),'uso_atual',(SELECT to_jsonb(u) FROM public.empresa_uso u WHERE u.empresa_id=e.id),'ativos_reais',count(c.id) FILTER(WHERE c.active),'elegivel_concessao_legada',x.empresa_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.empresa_features f WHERE f.empresa_id=e.id),'concessoes_propostas',CASE WHEN x.empresa_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.empresa_features f WHERE f.empresa_id=e.id) THEN to_jsonb(ARRAY['empresa.cadastro','usuarios.gestao','colaboradores.gestao','treinamentos','exames','documentos','relatorios.sst']) ELSE '[]'::jsonb END) details
 FROM public.empresas e LEFT JOIN public.colaboradores c ON c.empresa_id=e.id LEFT JOIN public.empresa_comercial x ON x.empresa_id=e.id
 LEFT JOIN public.empresa_limites l ON l.empresa_id=e.id GROUP BY e.id,e.status,x.empresa_id,x.origem,l.max_colaboradores_ativos,l.ilimitado`
  const audit=`-- 025-A ${stage}. Execute COMPLETE file as trusted auditor. ONE result set, no writes.
-- Contract fixture is synthetic structural evidence, NEVER a remote preservation baseline.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH baseline_input AS (SELECT
-- BEGIN 025 BASELINE JSON
'[]'::jsonb
-- END 025 BASELINE JSON
 payload),baseline AS(SELECT x->>'CHECK' check_name,x->>'RESULTADO' result FROM baseline_input CROSS JOIN LATERAL jsonb_array_elements(payload)x),
contract AS (${contractDiff(expected)}),fingerprints AS (${preservation}),state_checks AS(${checks}),
raw AS (
 SELECT 'CONTRATO_025' category,* FROM contract
 UNION ALL SELECT 'ESTADO',* FROM state_checks
 UNION ALL SELECT 'INTEGRIDADE','Limite inferior ao uso: '||l.empresa_id,l.max_colaboradores_ativos::text,
 CASE WHEN l.ilimitado OR l.max_colaboradores_ativos>=(SELECT count(*) FROM public.colaboradores c WHERE c.empresa_id=l.empresa_id AND c.active) THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.empresa_limites l
 UNION ALL SELECT 'INTEGRIDADE','Uso existente divergente: '||u.empresa_id,u.colaboradores_ativos::text,
 CASE WHEN u.colaboradores_ativos=(SELECT count(*) FROM public.colaboradores c WHERE c.empresa_id=u.empresa_id AND c.active) THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.empresa_uso u
 UNION ALL SELECT 'INTEGRIDADE','Empresa configurada sem limite explícito',count(*)::text,CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.empresas e WHERE (EXISTS(SELECT 1 FROM public.empresa_comercial c WHERE c.empresa_id=e.id) OR EXISTS(SELECT 1 FROM public.empresa_features f WHERE f.empresa_id=e.id)) AND NOT EXISTS(SELECT 1 FROM public.empresa_limites l WHERE l.empresa_id=e.id)
 UNION ALL SELECT 'INTEGRIDADE','CNPJ válido',count(*)::text,CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.empresas WHERE NOT engmarq_private.cnpj_valido(cnpj)
 UNION ALL SELECT 'INTEGRIDADE','Referências tenant de colaboradores',count(*)::text,CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM public.colaboradores c LEFT JOIN public.funcoes f ON f.id=c.funcao_id LEFT JOIN public.setores s ON s.id=c.setor_id LEFT JOIN public.ambientes a ON a.id=c.ambiente_id WHERE f.empresa_id IS DISTINCT FROM c.empresa_id OR s.empresa_id IS DISTINCT FROM c.empresa_id OR (c.ambiente_id IS NOT NULL AND a.empresa_id IS DISTINCT FROM c.empresa_id)
 UNION ALL SELECT 'SEGURANCA','Auditor integral',current_user,CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb
 UNION ALL SELECT 'SEGURANCA','Clientes sem bypass/owner/schema CREATE','verificação',CASE WHEN NOT EXISTS(
 SELECT 1 FROM pg_roles c CROSS JOIN pg_roles p WHERE c.rolname IN ('anon','authenticated') AND
 (c.rolsuper OR c.rolbypassrls OR ((p.rolsuper OR p.rolbypassrls) AND pg_has_role(c.oid,p.oid,'MEMBER'))))
 AND NOT has_schema_privilege('anon','engmarq_private','CREATE') AND NOT has_schema_privilege('authenticated','engmarq_private','CREATE') THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb
 UNION ALL SELECT 'STORAGE','Bucket privado: '||id,public::text,CASE WHEN NOT public THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM storage.buckets WHERE id IN ('documentos','logos','assinaturas')
 UNION ALL SELECT 'ATENCOES','Concorrência PostgreSQL real','Exigir evidência separada do harness; SQL estático não homologa concorrência','ATENÇÃO','{}'::jsonb
 UNION ALL SELECT 'ATENCOES','Auth e schemas expostos','025-A não abre signup; conferir configuração externa antes da 025-B','ATENÇÃO','{}'::jsonb
 UNION ALL SELECT 'PRESERVACAO',f.check_name,f.result,${after?`CASE WHEN (SELECT count(*) FROM baseline b WHERE b.check_name=f.check_name)=1 AND f.result=(SELECT min(result) FROM baseline b WHERE b.check_name=f.check_name) THEN 'OK' ELSE 'BLOQUEIO' END`:`'OK'`},
 jsonb_build_object('baseline_pre025',(SELECT min(result) FROM baseline b WHERE b.check_name=f.check_name)) FROM fingerprints f
 ${after?`UNION ALL SELECT 'PRESERVACAO',b.check_name,'baseline inesperado','BLOQUEIO','{}'::jsonb FROM baseline b WHERE NOT EXISTS(SELECT 1 FROM fingerprints f WHERE f.check_name=b.check_name)`:''}
),numbered AS (SELECT row_number() OVER(ORDER BY category,check_name) ordem,* FROM raw),
totals AS (SELECT count(*) n,count(*) FILTER(WHERE status='OK') ok,count(*) FILTER(WHERE status='ATENÇÃO') warnings,count(*) FILTER(WHERE status='BLOQUEIO') blocks FROM numbered),
final AS (SELECT * FROM numbered
 UNION ALL SELECT n+1,'RESUMO','TOTAL_OK',ok::text,'OK','{}'::jsonb FROM totals
 UNION ALL SELECT n+2,'RESUMO','TOTAL_ATENCOES',warnings::text,'ATENÇÃO','{}'::jsonb FROM totals
 UNION ALL SELECT n+3,'RESUMO','TOTAL_BLOQUEIOS',blocks::text,CASE WHEN blocks=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM totals
 UNION ALL SELECT n+4,'RESUMO','RESULTADO_FINAL',CASE WHEN blocks=0 THEN 'APROVADO PARA REVISÃO — NÃO AUTORIZA EXPOSIÇÃO PÚBLICA' ELSE 'REPROVADO — 025 NÃO VALIDADA' END,CASE WHEN blocks=0 THEN 'OK' ELSE 'BLOQUEIO' END,'{}'::jsonb FROM totals)
SELECT ordem "ORDEM",category "CATEGORIA",check_name "CHECK",result "RESULTADO",status "STATUS",details "DETALHES" FROM final ORDER BY ordem;
COMMIT;
`
  await writeFile(new URL(`025_fundacao_${stage}_readonly.sql`,import.meta.url),audit)
  await writeFile(new URL(`../../docs/audits/2026-10-04/expected-025-${stage}-catalog.json`,import.meta.url),JSON.stringify(expected,null,2)+'\n')
 }
 console.log('025 local structural contracts/auditors generated; no remote baseline embedded.')
}finally{await db.close()}
