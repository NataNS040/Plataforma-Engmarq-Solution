// Local-only generation of fingerprints/auditors. No env, credentials or HTTP.
import {readFile,writeFile} from 'node:fs/promises'
import {logosFixture} from './logos-fixture.mjs'
const db=await logosFixture()
try {
 const functions=(await db.query(`SELECT p.oid::regprocedure::text signature,
 md5(replace(p.prosrc,E'\\r\\n',E'\\n')) source_hash
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='engmarq_private' AND p.proname IN ('can_access_logo','logo_update_identity') ORDER BY signature`)).rows
 const policies=(await db.query(`SELECT policyname,md5(permissive||roles::text||cmd||coalesce(qual,'')||coalesce(with_check,'')) fingerprint
 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'logos_%' ORDER BY policyname`)).rows
 const fvalues=functions.map(f=>`('${f.signature}','${f.source_hash}')`).join(',\n ')
 const pvalues=policies.map(p=>`('${p.policyname}','${p.fingerprint}')`).join(',\n ')
 const fnCheck=`NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
 WHERE p.oid=to_regprocedure(e.signature) AND p.prosecdef AND p.provolatile='s'
 AND p.prorettype='boolean'::regtype AND p.prokind='f'
 AND NOT p.proisstrict AND NOT p.proleakproof
 AND CASE WHEN e.signature LIKE '%can_access_logo%' THEN
   p.pronargdefaults=1 AND pg_get_expr(p.proargdefaults,0)='NULL::jsonb'
   ELSE p.pronargdefaults=0 END
 AND p.prolang=(SELECT oid FROM pg_language WHERE lanname=CASE WHEN e.signature LIKE '%can_access_logo%' THEN 'plpgsql' ELSE 'sql' END)
 AND p.proconfig=ARRAY['search_path=""'] AND (owner.rolsuper OR owner.rolbypassrls)
 AND NOT pg_has_role('authenticated',p.proowner,'MEMBER') AND NOT pg_has_role('anon',p.proowner,'MEMBER')
 AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))=e.source_hash
 AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE a.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='anon'),
 (SELECT oid FROM pg_roles WHERE rolname='authenticated')) OR (a.grantee<>p.proowner AND a.is_grantable)))`
 const policyCheck=`NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='storage' AND p.tablename='objects'
 AND p.policyname=e.policyname AND md5(p.permissive||p.roles::text||p.cmd||coalesce(p.qual,'')||coalesce(p.with_check,''))=e.fingerprint)`
 const contract=`IF EXISTS (SELECT 1 FROM (VALUES ${fvalues}) e(signature,source_hash) WHERE ${fnCheck})
 OR EXISTS (SELECT 1 FROM (VALUES ${pvalues}) e(policyname,fingerprint) WHERE ${policyCheck})
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND policyname LIKE 'logos_%' AND policyname NOT IN (${policies.map(p=>`'${p.policyname}'`).join(',')}))
 OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='engmarq_private' AND p.proname IN ('can_access_logo','logo_update_identity'))<>2 THEN
 RAISE EXCEPTION '022 known contract drift: review helpers, ACLs and policies before rerun';
 END IF;`
 const file=new URL('../migrations/022_logos_tenant_storage.sql',import.meta.url)
 let migration=await readFile(file,'utf8')
 migration=migration.replace(/-- GENERATED_CONTRACT_CHECK[\s\S]*?\n ELSE/,`-- GENERATED_CONTRACT_CHECK\n   ${contract}\n ELSE`)
 await writeFile(file,migration)
 const reportHeader=`-- Strict read-only: catalog proof, not impersonation or write/HTTP probes.
-- Execute whole file as trusted SQL Editor admin. Review every BLOQUEIO.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH ef(signature,source_hash) AS (VALUES ${fvalues}),
 ep(policyname,fingerprint) AS (VALUES ${pvalues}),
 report AS (
 SELECT 'Executor com inventario completo' AS "CHECK",
 current_user::text AS "RESULTADO", CASE WHEN EXISTS (SELECT 1 FROM pg_roles
 WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN 'OK' ELSE 'BLOQUEIO' END AS "STATUS"
 UNION ALL SELECT 'Storage RLS',c.relrowsecurity::text,CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'BLOQUEIO' END
 FROM pg_class c WHERE c.oid='storage.objects'::regclass
 UNION ALL SELECT 'Roles clientes sem bypass/ownership','anon/authenticated',CASE WHEN NOT EXISTS
 (SELECT 1 FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname IN ('anon','authenticated')
 AND c.oid='storage.objects'::regclass AND (r.rolsuper OR r.rolbypassrls OR pg_has_role(r.oid,c.relowner,'MEMBER')))
 THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT 'ACLs Storage (nenhum grant e alterado por 022)',
 (SELECT jsonb_build_object('relation',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
 'table_acl',c.relacl,'column_acl',(SELECT jsonb_agg(jsonb_build_object('column',a.attname,'acl',a.attacl))
 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))::text
 FROM pg_class c WHERE c.oid='storage.objects'::regclass),'OK'
 UNION ALL SELECT 'Clientes sem membership privilegiado','anon/authenticated',CASE WHEN NOT EXISTS
 (SELECT 1 FROM pg_roles client CROSS JOIN pg_roles privileged WHERE client.rolname IN ('anon','authenticated')
 AND (privileged.rolsuper OR privileged.rolbypassrls) AND pg_has_role(client.oid,privileged.oid,'MEMBER'))
 THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT 'Grants Storage existentes','USAGE + SELECT/INSERT/UPDATE',CASE WHEN
 has_schema_privilege('authenticated','storage','USAGE') AND
 has_table_privilege('authenticated','storage.objects','SELECT') AND
 has_table_privilege('authenticated','storage.objects','INSERT') AND
 has_table_privilege('authenticated','storage.objects','UPDATE') THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT 'Schema privado sem CREATE clientes','engmarq_private',CASE WHEN
 NOT has_schema_privilege('authenticated','engmarq_private','CREATE') AND
 NOT has_schema_privilege('anon','engmarq_private','CREATE') AND
 has_schema_privilege('authenticated','engmarq_private','USAGE') THEN 'OK' ELSE 'BLOQUEIO' END
`
 const footer=`), totals AS (SELECT count(*) FILTER(WHERE "STATUS"='BLOQUEIO') blocks,
 count(*) FILTER(WHERE "STATUS"='ATENÇÃO') warnings FROM report)
SELECT * FROM report UNION ALL
SELECT 'TOTAL_BLOQUEIOS',blocks::text,CASE WHEN blocks=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM totals UNION ALL
SELECT 'TOTAL_ATENCOES',warnings::text,CASE WHEN warnings=0 THEN 'OK' ELSE 'ATENÇÃO' END FROM totals;
COMMIT;
`
 const pre=reportHeader+` UNION ALL SELECT '021 prerequisite','can_access_empresa',CASE WHEN
 to_regprocedure('engmarq_private.can_access_empresa(uuid,boolean,boolean)') IS NOT NULL THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT 'Inventario confirmado antes de 022',jsonb_build_object(
 'buckets',(SELECT count(*) FROM storage.buckets WHERE id='logos' OR name='logos'),
 'objetos',(SELECT count(*) FROM storage.objects WHERE bucket_id='logos'),
 'referencias',(SELECT count(*) FROM public.empresas WHERE logo_url IS NOT NULL),
 'empresas',(SELECT count(*) FROM public.empresas))::text,
 CASE WHEN NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='logos' OR name='logos')
 AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='logos')
 AND NOT EXISTS (SELECT 1 FROM public.empresas WHERE logo_url IS NOT NULL)
 AND (SELECT count(*) FROM public.empresas)=3 THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT '022 ausente antes da primeira execucao','policies/helpers',CASE WHEN
 NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'logos_%')
 AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='engmarq_private' AND p.proname IN ('can_access_logo','logo_update_identity')) THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT 'Todas as policies Storage: revisar compatibilidade',
 coalesce((SELECT jsonb_agg(to_jsonb(p))::text FROM pg_policies p WHERE schemaname='storage' AND tablename='objects'),'[]'),'ATENÇÃO'
`+footer
 const post=reportHeader+` UNION ALL SELECT 'Bucket logos privado 2MB PNG/JPEG/WebP',coalesce(
 (SELECT to_jsonb(b)::text FROM storage.buckets b WHERE id='logos'),'ausente'),
 CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='logos' AND name='logos' AND NOT public
 AND file_size_limit=2097152 AND allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp'])
 THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT 'Helper seguro: '||e.signature,'source_hash='||e.source_hash,
 CASE WHEN ${fnCheck} THEN 'BLOQUEIO' ELSE 'OK' END FROM ef e
 UNION ALL SELECT 'Policy exata: '||e.policyname,'fingerprint='||e.fingerprint,
 CASE WHEN ${policyCheck} THEN 'BLOQUEIO' ELSE 'OK' END FROM ep e
 UNION ALL SELECT 'Policies logos inesperadas',p.policyname,'BLOQUEIO' FROM pg_policies p
 WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'logos_%'
 AND NOT EXISTS (SELECT 1 FROM ep e WHERE e.policyname=p.policyname)
 UNION ALL SELECT 'Prova estatica: '||scenario,
 'Definicoes e guards exatos do contrato validado em testes locais; nao e probe remoto de escrita.',
 CASE WHEN NOT EXISTS (SELECT 1 FROM ef e WHERE ${fnCheck})
 AND NOT EXISTS (SELECT 1 FROM ep e WHERE ${policyCheck}) THEN 'OK' ELSE 'BLOQUEIO' END
 FROM (VALUES ('anon sem escrita'),('operacional sem escrita'),('admin sem acesso operacional'),
 ('empresa/gestor somente proprio tenant'),('cross-tenant bloqueado'),('inativo/empresa suspensa bloqueados'),
 ('UUID/path invalidos bloqueados'),('UPDATE/upsert preserva identidade'),('MIME/size declarados protegidos')) s(scenario)
 UNION ALL SELECT 'Dados logos validos','tenant/path/referencia',CASE WHEN
 NOT EXISTS (SELECT 1 FROM storage.objects o WHERE bucket_id='logos' AND
 (name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo\\.(png|jpg|webp)$'
 OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(o.name,'/',1))))
 AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE logo_url IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM storage.objects o WHERE o.bucket_id='logos' AND e.logo_url='logos/'||o.name
 AND split_part(o.name,'/',1)=e.id::text)) THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL SELECT 'Todas as policies Storage',coalesce((SELECT jsonb_agg(to_jsonb(p))::text
 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects'),'[]'),'OK'
 UNION ALL SELECT 'Limite de prova read-only',
 'Hashes e guards comprovam contrato SQL testado localmente: anon/operacional/admin/inativo/cross-tenant sem escrita; empresa/gestor own-tenant; path/identidade/MIME protegidos. Fluxo HTTP real e bytes exigem homologacao manual autenticada; nao executada por este SQL.', 'ATENÇÃO'
`+footer
 await writeFile(new URL('022_logos_preflight_readonly.sql',import.meta.url),pre)
 await writeFile(new URL('022_logos_postflight_readonly.sql',import.meta.url),post)
 console.log('Local 022 catalog/auditors generated')
} finally {await db.close()}
