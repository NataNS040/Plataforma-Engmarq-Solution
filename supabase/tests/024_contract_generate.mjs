// LOCAL SYNTHETIC GENERATOR ONLY. No env, secrets or network access.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fundacaoFixture,migrate} from './fundacao-fixture.mjs'
import {catalog,cnpjCTE,optionalIdentity,optionalPreservation} from './024-catalog.mjs'
const migrationURL=new URL('../migrations/024_fundacao_comercial.sql',import.meta.url)
const db=await fundacaoFixture()
const manifestSQL=rows=>JSON.stringify(rows).replaceAll("'","''")
const diff=manifest=>`WITH actual AS (${catalog}),expected AS
 (SELECT * FROM jsonb_to_recordset('${manifestSQL(manifest)}'::jsonb)e(identity text,detail jsonb))
 SELECT coalesce(a.identity,e.identity) AS "CHECK",
 CASE WHEN a.identity IS NULL THEN 'ausente' WHEN e.identity IS NULL THEN 'objeto adicional' WHEN a.detail IS DISTINCT FROM e.detail THEN 'contrato divergente' ELSE 'contrato conferido' END AS "RESULTADO",
 CASE WHEN coalesce(a.identity,e.identity) ~ '${optionalIdentity}' THEN 'ATENÇÃO'
 WHEN a.detail IS DISTINCT FROM e.detail THEN 'BLOQUEIO' ELSE 'OK' END AS "STATUS"
 FROM actual a FULL JOIN expected e USING(identity) ORDER BY 1`
try {
 const baseline=(await db.query(catalog)).rows
 // Embedded assertion closes preflight/application TOCTOU for all catalog objects examined.
 let migration=await readFile(migrationURL,'utf8')
 const assertion=`-- BEGIN GENERATED 024 BASELINE ASSERTION\nDO $contract$ BEGIN\n IF EXISTS(SELECT 1 FROM (${diff(baseline)}) report WHERE "STATUS"='BLOQUEIO') THEN\n RAISE EXCEPTION '024 baseline contract drift: rerun read-only preflight and review; no overwrite';\n END IF;\nEND $contract$;\n-- END GENERATED 024 BASELINE ASSERTION`
 if(migration.includes('-- BEGIN GENERATED 024 BASELINE ASSERTION'))migration=migration.replace(/-- BEGIN GENERATED 024 BASELINE ASSERTION[\s\S]*?-- END GENERATED 024 BASELINE ASSERTION/,()=>assertion)
 else migration=migration.replace('-- Accept only compact',()=>assertion+'\n\n-- Accept only compact')
 await writeFile(migrationURL,migration)
 for(const stage of ['preflight','postflight']) {
  if(stage==='postflight')await migrate(db,'024_fundacao_comercial.sql')
  const expected=(await db.query(catalog)).rows
  const post=stage==='postflight'
  const inventories=`
-- Explicit CNPJ inventory: public business identifier only; no contacts or individual employees.
WITH ${cnpjCTE}
SELECT id AS empresa_id,cnpj,canonical AS cnpj_canonico,
 CASE WHEN canonical IS NULL THEN 'formato inesperado' WHEN NOT valid THEN 'DV inválido/repetido' ELSE 'válido' END AS "RESULTADO",
 CASE WHEN valid THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS" FROM validated ORDER BY id;
WITH ${cnpjCTE}
SELECT 'Colisão canônica' AS "CHECK",canonical AS "RESULTADO",'BLOQUEIO' AS "STATUS",array_agg(id ORDER BY id) empresas
FROM validated WHERE canonical IS NOT NULL GROUP BY canonical HAVING count(*)>1;
SELECT e.id AS empresa_id,e.status,count(c.id) FILTER(WHERE c.active) AS colaboradores_ativos,
 count(c.id) AS colaboradores_historicos,'ATENÇÃO' AS "STATUS"
 FROM public.empresas e LEFT JOIN public.colaboradores c ON c.empresa_id=e.id GROUP BY e.id,e.status ORDER BY e.id;
WITH checks(label,n) AS (
 SELECT 'Status empresarial inválido',count(*) FROM public.empresas WHERE status IS NULL OR status NOT IN ('ativa','pendente','suspensa')
 UNION ALL SELECT 'Perfil sem Auth ou empresa',count(*) FROM public.user_profiles p LEFT JOIN auth.users u ON u.id=p.id
 LEFT JOIN public.empresas e ON e.id=p.empresa_id WHERE u.id IS NULL OR e.id IS NULL
 UNION ALL SELECT 'Colaborador sem tenant/catálogo coerente',count(*) FROM public.colaboradores c
 LEFT JOIN public.empresas e ON e.id=c.empresa_id LEFT JOIN public.funcoes f ON f.id=c.funcao_id AND f.empresa_id=c.empresa_id
 LEFT JOIN public.setores s ON s.id=c.setor_id AND s.empresa_id=c.empresa_id
 LEFT JOIN public.ambientes a ON a.id=c.ambiente_id AND a.empresa_id=c.empresa_id
 WHERE e.id IS NULL OR f.id IS NULL OR s.id IS NULL OR (c.ambiente_id IS NOT NULL AND a.id IS NULL)
 UNION ALL SELECT 'Documento vinculado a colaborador de outro tenant',count(*) FROM public.documentos d
 LEFT JOIN public.colaboradores c ON c.id=d.colaborador_id AND c.empresa_id=d.empresa_id WHERE d.colaborador_id IS NOT NULL AND c.id IS NULL
 UNION ALL SELECT 'Treinamento/matriz com vínculo incoerente',count(*) FROM (
 SELECT t.id FROM public.treinamentos t LEFT JOIN public.colaboradores c ON c.id=t.colaborador_id AND c.empresa_id=t.empresa_id WHERE c.id IS NULL
 UNION ALL SELECT m.id FROM public.matriz_treinamentos m LEFT JOIN public.funcoes f ON f.id=m.funcao_id AND f.empresa_id=m.empresa_id WHERE f.id IS NULL) invalid
)
SELECT label AS "CHECK",n::text AS "RESULTADO",CASE WHEN n=0 THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS" FROM checks;
SELECT 'Auditor integral' AS "CHECK",current_user AS "RESULTADO",CASE WHEN
 EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS";
SELECT 'Papéis clientes não privilegiados' AS "CHECK",'sem bypass/superuser/membership privilegiado' AS "RESULTADO",CASE WHEN NOT EXISTS(
 SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND (r.rolsuper OR r.rolbypassrls OR EXISTS(
 SELECT 1 FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolbypassrls) AND pg_has_role(r.oid,elevated.oid,'MEMBER')))) THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS";
SELECT 'Auth sem perfil (inventário técnico)' AS "CHECK",count(*)::text AS "RESULTADO",'ATENÇÃO' AS "STATUS"
 FROM auth.users u LEFT JOIN public.user_profiles p ON p.id=u.id WHERE p.id IS NULL;
SELECT 'Ledger de migrations: conferir 015–023 separadamente' AS "CHECK",coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'não disponível') AS "RESULTADO",'ATENÇÃO' AS "STATUS";
SELECT 'EPI/assinaturas: bloqueador do rollout público na 025' AS "CHECK",
 'Policies legadas preservadas; 024 não remedia Admin global nem gates operacionais' AS "RESULTADO",'ATENÇÃO' AS "STATUS";
SELECT 'Signup e exposição de schemas: configuração fora do catálogo SQL' AS "CHECK",
 'Confirmar dashboard Auth e engmarq_private não exposto; nenhum bootstrap criado na 024' AS "RESULTADO",'ATENÇÃO' AS "STATUS";
SELECT 'Concessões/limites legados não aprovados para backfill nesta migration' AS "CHECK",
 'Revisão comercial explícita posterior; nenhum legado recebe Free' AS "RESULTADO",'ATENÇÃO' AS "STATUS";
SELECT id,name,public,file_size_limit,allowed_mime_types,'ATENÇÃO' AS "STATUS" FROM storage.buckets ORDER BY id;
`
  const preservation=[['empresas',"to_jsonb(r)-ARRAY['cnpj_canonico','cep','logradouro','numero','complemento','bairro']"],
   ...['user_profiles','colaboradores','documentos','treinamentos','funcoes','setores','ambientes','matriz_treinamentos','documento_tipos','treinamento_tipos','exames_catalogo','storage.objects','storage.buckets'].map(t=>[t,'to_jsonb(r)'])]
   .map(([t,row])=>`SELECT 'Preservação: ${t}' AS "CHECK",md5(coalesce(jsonb_agg(${row} ORDER BY r.id)::text,'[]')) AS "RESULTADO",'ATENÇÃO' AS "STATUS" FROM ${t.includes('.')?t:'public.'+t} r`).join('\nUNION ALL ')
  const empties=post?`
SELECT 'Nenhum backfill de empresa/Free/uso/onboarding/diagnóstico' AS "CHECK",'esperado zero linhas' AS "RESULTADO",
CASE WHEN (SELECT count(*) FROM public.empresa_features)+(SELECT count(*) FROM public.empresa_limites)
 +(SELECT count(*) FROM public.empresa_uso)+(SELECT count(*) FROM public.empresa_comercial)
 +(SELECT count(*) FROM public.empresa_diagnostico_sst)+(SELECT count(*) FROM engmarq_private.onboarding_solicitacoes)
 +(SELECT count(*) FROM public.auditoria_comercial)=0 THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS";
SELECT 'Endereço novo NULL no legado' AS "CHECK",count(*)::text AS "RESULTADO",
 CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS" FROM public.empresas
 WHERE cep IS NOT NULL OR logradouro IS NOT NULL OR numero IS NOT NULL OR complemento IS NOT NULL OR bairro IS NOT NULL;
SELECT 'Derivação CNPJ consistente' AS "CHECK",count(*)::text AS "RESULTADO",
 CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS" FROM public.empresas
 WHERE cnpj_canonico IS DISTINCT FROM engmarq_private.cnpj_canonico(cnpj);
`:''
  await writeFile(new URL(`024_fundacao_${stage}_readonly.sql`,import.meta.url),`-- 024 ${stage}: execute COMPLETE file as trusted SQL Editor auditor.
-- Save ALL result sets; any BLOQUEIO prohibits application. ATENÇÃO requires explicit review.
-- No corrections or operational content. Postflight is immediate, before commercial writes.
-- Expected catalog generated locally from committed 015–023 (including known EPI legacy)${post?' + 024':''}.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
${diff(expected)};
${inventories}
${empties}
${preservation};
${optionalPreservation}
COMMIT;
`)
  await writeFile(new URL(`../../docs/audits/2026-10-03/expected-024-${stage}-catalog.json`,import.meta.url),JSON.stringify(expected,null,2)+'\n')
 }
 const hashes={}
 const {readdir}=await import('node:fs/promises')
 for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>/^0(1[5-9]|2[0-3])_/.test(n)).sort())
  hashes[name]=createHash('sha256').update(await readFile(new URL('../migrations/'+name,import.meta.url))).digest('hex')
 await writeFile(new URL('../../docs/audits/2026-10-03/fundacao-024-migrations-015-023-sha256.json',import.meta.url),JSON.stringify(hashes,null,2)+'\n')
 console.log('024 baseline assertion, read-only pre/post, manifests and hashes generated locally')
}finally{await db.close()}
