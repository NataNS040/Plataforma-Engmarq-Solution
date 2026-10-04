// Local text generation only; validation uses disposable PGlite, never 024 migration.
import {writeFile} from 'node:fs/promises'
import {cnpjCTE} from './024-catalog.mjs'
import {validateNewCnpj,target,oldCnpj,newCnpj,canonical,inputCTE} from './024_cnpj_remediation_validate.mjs'
export const countsCTE=`counts(label,n,expected) AS (
 SELECT 'PERFIS',count(*),1 FROM public.user_profiles WHERE empresa_id='${target}'
 UNION ALL SELECT 'COLABORADORES',count(*),1 FROM public.colaboradores WHERE empresa_id='${target}'
 UNION ALL SELECT 'COLABORADORES_ATIVOS',count(*),1 FROM public.colaboradores WHERE empresa_id='${target}' AND active
 UNION ALL SELECT 'FUNCOES',count(*),1 FROM public.funcoes WHERE empresa_id='${target}'
 UNION ALL SELECT 'SETORES',count(*),1 FROM public.setores WHERE empresa_id='${target}'
 UNION ALL SELECT 'DOCUMENTOS',count(*),1 FROM public.documentos WHERE empresa_id='${target}'
 UNION ALL SELECT 'ASOS',count(*),1 FROM public.documentos d JOIN public.documento_tipos t ON t.id=d.tipo_id
 WHERE d.empresa_id='${target}' AND t.nome='ASO'
 UNION ALL SELECT 'STORAGE',count(*),1 FROM storage.objects WHERE split_part(name,'/',1)='${target}'
 UNION ALL SELECT 'STORAGE_DOCUMENTOS',count(*),1 FROM storage.objects
 WHERE split_part(name,'/',1)='${target}' AND bucket_id='documentos'
)`
// All business/Auth/Storage rows, including unexpected tables, are fingerprinted.
// Exclude ONLY this target's cnpj; other companies' CNPJs remain protected.
export const fingerprintCTE=`protected AS (
 SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','engmarq_private','auth','storage') AND c.relkind IN ('r','p')
),fingerprints AS MATERIALIZED (
 SELECT nspname,relname,(xpath('/table/row/hash/text()',query_to_xml(format(
 'SELECT md5(coalesce(jsonb_agg(payload ORDER BY payload::text)::text,''[]'')) AS hash FROM (SELECT %s AS payload FROM %I.%I r) q',
 CASE WHEN nspname='public' AND relname='empresas' THEN
 'CASE WHEN r.id=''${target}''::uuid THEN to_jsonb(r)-''cnpj'' ELSE to_jsonb(r) END' ELSE 'to_jsonb(r)' END,
 nspname,relname),true,false,'')))[1]::text AS hash FROM protected
)`
// Checks declared FKs without relying on the enforcement trigger being enabled.
// MATCH SIMPLE / MATCH FULL null semantics are both accounted for.
export const fkCTE=`fk_queries AS (
 SELECT k.oid,k.conname,k.conrelid::regclass::text AS child,k.confrelid::regclass::text AS parent,k.convalidated,
 format('SELECT count(*) AS n FROM %I.%I c WHERE ',cn.nspname,c.relname)||
 CASE WHEN k.confmatchtype='f' THEN '('||string_agg(format('c.%I IS NOT NULL',ca.attname),' OR ' ORDER BY keys.ord)||')'
 ELSE '('||string_agg(format('c.%I IS NOT NULL',ca.attname),' AND ' ORDER BY keys.ord)||')' END||
 format(' AND NOT EXISTS(SELECT 1 FROM %I.%I p WHERE ',pn.nspname,p.relname)||
 string_agg(format('c.%I=p.%I',ca.attname,pa.attname),' AND ' ORDER BY keys.ord)||')' AS query
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
 JOIN pg_class p ON p.oid=k.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace
 CROSS JOIN LATERAL unnest(k.conkey,k.confkey) WITH ORDINALITY keys(ca,pa,ord)
 JOIN pg_attribute ca ON ca.attrelid=k.conrelid AND ca.attnum=keys.ca
 JOIN pg_attribute pa ON pa.attrelid=k.confrelid AND pa.attnum=keys.pa
 WHERE k.contype='f' AND cn.nspname IN ('public','engmarq_private','auth','storage')
 GROUP BY k.oid,k.conname,k.conrelid,k.confrelid,k.convalidated,k.confmatchtype,cn.nspname,c.relname,pn.nspname,p.relname
),fk_checks AS MATERIALIZED (
 SELECT *,((xpath('/table/row/n/text()',query_to_xml(query,true,false,'')))[1]::text)::bigint AS invalid FROM fk_queries
)`
const audit=post=>{
 const expected=post?newCnpj:oldCnpj
 return `-- PRE-024 ${post?'postflight':'preflight'} CNPJ correction ONLY. Save the complete result.
-- One operational result, no personal rows, paths, contacts or file contents.
-- Counts are the owner-reported baseline; abort/review any discrepancy.
-- Compare PRESERVACAO fingerprints across pre/post; hashes alone are not counts.
${post?"-- REQUIRED: replace NULL::jsonb /* BASELINE_PREFLIGHT */ below with the DETALHES\n-- from preflight CHECK=BASELINE_POSTFLIGHT, as a SQL-quoted JSON literal ::jsonb.\n-- Without that baseline the postflight MUST reject; no silent approval.":''}
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH ${cnpjCTE},${inputCTE.replaceAll('normalized','new_normalized').replaceAll('digits','new_digits').replaceAll('validated','new_validated')},
${countsCTE},${fingerprintCTE},${fkCTE},
baseline_current AS MATERIALIZED (SELECT jsonb_object_agg(nspname||'.'||relname,hash) AS hashes FROM fingerprints),
${post?'baseline_expected AS (SELECT NULL::jsonb /* BASELINE_PREFLIGHT */ AS hashes),':''}
checks(category,label,passed,result,details) AS (
 SELECT 'AUDITOR','Auditor privilegiado',EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)),
 current_user,jsonb_build_object('current_user',current_user)
 UNION ALL SELECT 'ESCOPO','PRE_024',to_regprocedure('engmarq_private.cnpj_canonico(text)') IS NULL
 AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empresas'::regclass AND attname='cnpj_canonico' AND NOT attisdropped),
 'helpers/coluna da 024 devem estar ausentes','{}'::jsonb
 UNION ALL SELECT 'EMPRESA','EMPRESA_CORRETA',count(*)=1,count(*)::text,
 jsonb_build_object('empresa_id','${target}','razao_social_esperada','EngMarq Solucoes em Engenharia')
 FROM public.empresas WHERE id='${target}' AND razao_social='EngMarq Solucoes em Engenharia'
 UNION ALL SELECT 'CNPJ','CNPJ_${post?'CORRIGIDO':'ATUAL_ESPERADO'}',count(*)=1,count(*)::text,
 jsonb_build_object('esperado','${expected}') FROM public.empresas WHERE id='${target}' AND cnpj='${expected}'
 UNION ALL SELECT 'CNPJ','NOVO_CNPJ_VALIDO',valid,cnpj,jsonb_build_object('canonical',canonical) FROM new_validated
 UNION ALL SELECT 'CNPJ','CANONICAL_ESPERADO',canonical='${canonical}',canonical,'{}'::jsonb FROM new_validated
 ${post?`UNION ALL SELECT 'CNPJ','CNPJ_EMPRESA_VALIDO',coalesce(bool_and(valid AND canonical='${canonical}'),false),
 coalesce(max(canonical),'ausente'),'{}'::jsonb FROM validated WHERE id='${target}'`:''}
 UNION ALL SELECT 'COLISAO','AUSENCIA_COLISAO_NOVO_CNPJ',count(*)=0,count(*)::text,
 jsonb_build_object('canonical','${canonical}') FROM validated WHERE id<>'${target}' AND canonical='${canonical}'
 UNION ALL SELECT 'COLISAO','NENHUM_CANONICO_DUPLICADO',count(*)=0,count(*)::text,'{}'::jsonb
 FROM (SELECT canonical FROM validated WHERE canonical IS NOT NULL GROUP BY canonical HAVING count(*)>1) duplicates
 UNION ALL SELECT 'CONTAGENS',label,n=expected,n::text,jsonb_build_object('esperado',expected) FROM counts
 UNION ALL SELECT 'INTEGRIDADE_FK',child||'.'||conname,invalid=0 AND convalidated,invalid::text,
 jsonb_build_object('origem',child,'destino',parent,'constraint_validada',convalidated) FROM fk_checks
 ${post?`UNION ALL SELECT 'PRESERVACAO','FINGERPRINTS_PRESERVADOS',
 b.hashes IS NOT NULL AND b.hashes=c.hashes,
 CASE WHEN b.hashes IS NULL THEN 'baseline preflight não informado' WHEN b.hashes=c.hashes THEN 'todos preservados' ELSE 'divergência' END,
 jsonb_build_object('baseline_informado',b.hashes IS NOT NULL) FROM baseline_expected b CROSS JOIN baseline_current c`:''}
),report AS (
 SELECT 1 AS section,category,label,result,CASE WHEN passed THEN 'OK' ELSE 'BLOQUEIO' END AS status,details FROM checks
 UNION ALL SELECT 2,'PRESERVACAO',nspname||'.'||relname,hash,'ATENÇÃO',
 jsonb_build_object('comparar_pre_pos',true,'exclusao_do_hash','somente cnpj da empresa alvo') FROM fingerprints
 ${post?'':"UNION ALL SELECT 2,'PRESERVACAO','BASELINE_POSTFLIGHT','Copiar DETALHES integralmente para o postflight','ATENÇÃO',hashes FROM baseline_current"}
 UNION ALL SELECT 3,'CONCLUSAO','RESULTADO_FINAL',
 CASE WHEN bool_and(passed) THEN '${post?'REMEDIACAO_OK':'APROVADO_PARA_REMEDIACAO'}' ELSE '${post?'REMEDIACAO_REPROVADA':'REPROVADO'}' END,
 CASE WHEN bool_and(passed) THEN 'OK' ELSE 'BLOQUEIO' END,
 jsonb_build_object('nao_autoriza_024',true,'comparacao_fingerprints_obrigatoria',true) FROM checks
)
SELECT row_number() OVER(ORDER BY section,category,label) AS "ORDEM",category AS "CATEGORIA",
 label AS "CHECK",result AS "RESULTADO",status AS "STATUS",details AS "DETALHES" FROM report ORDER BY "ORDEM";
COMMIT;
`
}
const remediation=`-- PRE-024: privileged, non-idempotent correction of ONE company CNPJ.
-- Run only after the separate preflight is approved. No 024 application.
-- Entire file is atomic. On error ROLLBACK before any subsequent command.
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
DO $remediation$
DECLARE affected bigint; before_company jsonb; after_company jsonb; before_data jsonb; after_data jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Privileged auditor required' USING ERRCODE='42501';
 END IF;
 -- Exclusive against competing writers to empresas: canonical collision check
 -- remains protected through COMMIT even before 024 creates its unique key.
 LOCK TABLE public.empresas IN SHARE ROW EXCLUSIVE MODE;
 IF to_regprocedure('engmarq_private.cnpj_canonico(text)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.empresas'::regclass AND attname='cnpj_canonico' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'This correction is PRE-024 only';
 END IF;
 IF (SELECT count(*) FROM public.empresas WHERE id='${target}' AND cnpj='${oldCnpj}'
  AND razao_social='EngMarq Solucoes em Engenharia')<>1 THEN
  RAISE EXCEPTION 'Target ID, old CNPJ or company name does not match exactly one row';
 END IF;
 IF NOT (WITH ${inputCTE} SELECT valid AND canonical='${canonical}' FROM validated) THEN
  RAISE EXCEPTION 'New CNPJ invalid or unexpected canonical';
 END IF;
 IF EXISTS(WITH ${cnpjCTE} SELECT 1 FROM validated WHERE id<>'${target}' AND canonical='${canonical}') THEN
  RAISE EXCEPTION 'Canonical CNPJ collision';
 END IF;
 IF EXISTS(WITH ${countsCTE} SELECT 1 FROM counts WHERE n<>expected) THEN
  RAISE EXCEPTION 'Operational baseline counts changed; rerun inventory';
 END IF;
 IF EXISTS(WITH ${fkCTE} SELECT 1 FROM fk_checks WHERE invalid<>0 OR NOT convalidated) THEN
  RAISE EXCEPTION 'FK integrity requires review';
 END IF;
 SELECT to_jsonb(e)-'cnpj' INTO before_company FROM public.empresas e WHERE id='${target}';
 WITH ${fingerprintCTE}
 SELECT jsonb_agg(jsonb_build_object('schema',nspname,'table',relname,'hash',hash) ORDER BY nspname,relname) INTO before_data FROM fingerprints;

 UPDATE public.empresas SET cnpj='${newCnpj}'
 WHERE id='${target}' AND cnpj='${oldCnpj}' AND razao_social='EngMarq Solucoes em Engenharia';
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Expected exactly one affected row, got %',affected; END IF;

 SELECT to_jsonb(e)-'cnpj' INTO after_company FROM public.empresas e WHERE id='${target}';
 IF after_company IS DISTINCT FROM before_company
 OR NOT EXISTS(SELECT 1 FROM public.empresas WHERE id='${target}' AND cnpj='${newCnpj}') THEN
  RAISE EXCEPTION 'Company preservation or final CNPJ failed';
 END IF;
 WITH ${fingerprintCTE}
 SELECT jsonb_agg(jsonb_build_object('schema',nspname,'table',relname,'hash',hash) ORDER BY nspname,relname) INTO after_data FROM fingerprints;
 IF after_data IS DISTINCT FROM before_data THEN
  RAISE EXCEPTION 'Non-CNPJ data changed: rollback correction';
 END IF;
 IF EXISTS(WITH ${countsCTE} SELECT 1 FROM counts WHERE n<>expected)
 OR EXISTS(WITH ${fkCTE} SELECT 1 FROM fk_checks WHERE invalid<>0 OR NOT convalidated) THEN
  RAISE EXCEPTION 'Post-update counts/FK check failed';
 END IF;
END;
$remediation$;
COMMIT;
`
export async function generate() {
 // MUST pass before any file containing UPDATE is written.
 console.log('024-equivalent local validation:',await validateNewCnpj())
 for(const [name,sql] of [
  ['024_cnpj_remediation_preflight_readonly.sql',audit(false)],
  ['024_cnpj_remediation.sql',remediation],
  ['024_cnpj_remediation_postflight_readonly.sql',audit(true)]])
  await writeFile(new URL(name,import.meta.url),sql)
}
if(process.argv[1]?.endsWith('024_cnpj_remediation_generate.mjs'))await generate()
