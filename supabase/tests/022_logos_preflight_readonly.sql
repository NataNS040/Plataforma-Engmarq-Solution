-- Strict read-only: catalog proof, not impersonation or write/HTTP probes.
-- Execute whole file as trusted SQL Editor admin. Review every BLOQUEIO.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH ef(signature,source_hash) AS (VALUES ('engmarq_private.can_access_logo(text,text,jsonb)','caa03ead77e4f7dde459d656f4905be8'),
 ('engmarq_private.logo_update_identity(uuid,text,text)','928ef86c18f5def4f9ad6aa2632736ae')),
 ep(policyname,fingerprint) AS (VALUES ('logos_storage_insert','b168e90187e03a16a869edb13bf3485d'),
 ('logos_storage_select','493597c9c67e68c0c631ce09e649831e'),
 ('logos_storage_update','3dd115c4b8e1ed18aef1f2d0172f69b0'),
 ('logos_tenant_delete_guard','f3a9dd28a5a72e2cd7772d60f0a838a8'),
 ('logos_tenant_insert_guard','7c8e2951e0aeb30c5943dff9a60543dc'),
 ('logos_tenant_select_guard','bb0cbbbdc39d5fe97e171311035238cc'),
 ('logos_tenant_update_guard','9612dca2ef655cb8c3f52f04fc6fa308')),
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
 UNION ALL SELECT '021 prerequisite','can_access_empresa',CASE WHEN
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
), totals AS (SELECT count(*) FILTER(WHERE "STATUS"='BLOQUEIO') blocks,
 count(*) FILTER(WHERE "STATUS"='ATENÇÃO') warnings FROM report)
SELECT * FROM report UNION ALL
SELECT 'TOTAL_BLOQUEIOS',blocks::text,CASE WHEN blocks=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM totals UNION ALL
SELECT 'TOTAL_ATENCOES',warnings::text,CASE WHEN warnings=0 THEN 'OK' ELSE 'ATENÇÃO' END FROM totals;
COMMIT;
