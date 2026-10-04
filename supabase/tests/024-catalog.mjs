// Catalog evidence only. No credentials, network, Auth content or operational row content.
const tables=['empresas','user_profiles','colaboradores','funcoes','setores','ambientes','documentos',
 'documento_tipos','treinamentos','treinamento_tipos','matriz_treinamentos','exames_catalogo','fichas_epi','fichas_epi_itens',
 'vw_dashboard_documentos','vw_dashboard_treinamentos','features','empresa_comercial','empresa_features','empresa_limites',
 'empresa_uso','empresa_diagnostico_sst','auditoria_comercial']
const names=tables.map(t=>`'${t}'`).join(',')
// EPI/assinaturas are audited but never prerequisites or remediated in 024.
export const optionalIdentity = "(fichas_epi|assinatur|(^|[._:])epi([._:(]|$))"
export const catalog=`WITH relations AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN (${names}))
 OR (n.nspname IN ('public','engmarq_private','storage') AND c.relname ~ '${optionalIdentity}')
 OR (n.nspname='engmarq_private' AND c.relname='onboarding_solicitacoes')
),entries AS (
 SELECT 'relation:'||nspname||'.'||relname identity,jsonb_build_object('rls',relrowsecurity,'force',relforcerowsecurity,
 'kind',relkind,'options',reloptions,'owner',pg_get_userbyid(relowner),
 'client_owner_member',pg_has_role('authenticated',relowner,'MEMBER') OR pg_has_role('anon',relowner,'MEMBER')) detail FROM relations
 UNION ALL SELECT 'column:'||c.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),
 'nullable',NOT a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid))
 FROM relations c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||'.'||policyname,
 jsonb_build_object('permissive',permissive,'roles',roles::text,'command',cmd,'using',qual,'check',with_check)
 FROM pg_policies WHERE (schemaname='public' AND tablename IN (${names}))
 OR (schemaname IN ('public','engmarq_private','storage') AND tablename ~ '${optionalIdentity}')
 OR (schemaname='engmarq_private' AND tablename='onboarding_solicitacoes') OR (schemaname='storage' AND tablename='objects')
 UNION ALL SELECT 'function:'||p.oid::regprocedure::text,jsonb_build_object('hash',md5(replace(p.prosrc,E'\\r\\n',E'\\n')),
 'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'type',p.prorettype::regtype::text,
 'owner',pg_get_userbyid(p.proowner),'client_owner_member',pg_has_role('authenticated',p.proowner,'MEMBER') OR pg_has_role('anon',p.proowner,'MEMBER'),
 'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
 'service',has_function_privilege('service_role',p.oid,'EXECUTE'))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private'
 OR (n.nspname='public' AND p.proname IN ('get_user_empresa_id','get_user_role','update_documento_status','update_treinamento_status','update_ficha_epi_item_status'))
 OR (n.nspname IN ('public','storage') AND p.proname ~ '${optionalIdentity}')
 UNION ALL SELECT 'trigger:'||c.nspname||'.'||c.relname||'.'||t.tgname,
 jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
 FROM pg_trigger t JOIN relations c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal
 UNION ALL SELECT 'constraint:'||c.nspname||'.'||c.relname||'.'||k.conname,
 jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)
 FROM pg_constraint k JOIN relations c ON c.oid=k.conrelid
 UNION ALL SELECT 'index:'||schemaname||'.'||indexname,jsonb_build_object('definition',indexdef)
 FROM pg_indexes WHERE (schemaname='public' AND tablename IN (${names})) OR (schemaname='engmarq_private' AND tablename='onboarding_solicitacoes')
 OR (schemaname IN ('public','engmarq_private','storage') AND tablename ~ '${optionalIdentity}')
 UNION ALL SELECT 'view:'||nspname||'.'||relname,jsonb_build_object('definition',pg_get_viewdef(oid)) FROM relations WHERE relkind='v'
 UNION ALL SELECT 'grant:'||c.nspname||'.'||c.relname||'.'||r.role,jsonb_build_object(
 'table',ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
 WHERE has_table_privilege(r.role,c.oid,privilege) ORDER BY privilege),
 'columns',ARRAY(SELECT a.attname||':'||privilege FROM pg_attribute a CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) privilege
 WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,c.oid,a.attname,privilege) ORDER BY 1))
 FROM relations c CROSS JOIN (VALUES('anon'),('authenticated'))r(role)
 UNION ALL SELECT 'schema:engmarq_private',jsonb_build_object('auth_usage',has_schema_privilege('authenticated','engmarq_private','USAGE'),
 'auth_create',has_schema_privilege('authenticated','engmarq_private','CREATE'),'anon_create',has_schema_privilege('anon','engmarq_private','CREATE'))
 UNION ALL SELECT 'storage:objects_rls',jsonb_build_object('rls',relrowsecurity,
 'client_owner_member',pg_has_role('authenticated',relowner,'MEMBER') OR pg_has_role('anon',relowner,'MEMBER'))
 FROM pg_class WHERE oid=to_regclass('storage.objects')
 UNION ALL SELECT 'bucket:'||id,jsonb_build_object('public',public,'size',file_size_limit,'mime',allowed_mime_types)
 FROM storage.buckets WHERE id IN ('documentos','logos','assinaturas')
 UNION ALL SELECT 'optional-presence:'||relation,jsonb_build_object('present',to_regclass(relation) IS NOT NULL)
 FROM (VALUES('public.fichas_epi'),('public.fichas_epi_itens')) optional(relation)
) SELECT identity,detail,identity ~ '${optionalIdentity}' AS optional FROM entries`

// Built-in PostgreSQL dynamic SELECT, guarded before SPI execution. No static FROM an optional relation.
// CASE guards the function invocation itself, not an already-bound optional FROM clause.
export const optionalPreservation=`WITH candidates AS (
 SELECT n.nspname schema_name,c.relname relation_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','engmarq_private','storage') AND c.relname ~ '${optionalIdentity}' AND c.relkind IN ('r','p','m')
 UNION SELECT 'public','fichas_epi' UNION SELECT 'public','fichas_epi_itens'
), resolved AS (
 SELECT *,to_regclass(format('%I.%I',schema_name,relation_name)) relation_oid FROM candidates
)
SELECT 'Preservação: '||CASE WHEN schema_name='public' THEN relation_name ELSE schema_name||'.'||relation_name END AS "CHECK",
 CASE WHEN relation_oid IS NULL THEN 'relation ausente no remoto; módulo EPI/Assinaturas fora do escopo da 024; tratar na 025'
 ELSE (xpath('/table/row/fingerprint/text()',query_to_xml(
 format('SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,''[]'')) AS fingerprint FROM %I.%I r',schema_name,relation_name),
 true,false,'')))[1]::text END AS "RESULTADO",'ATENÇÃO' AS "STATUS" FROM resolved ORDER BY 1;
WITH actual AS (${catalog})
SELECT 'Preservação: catálogo opcional EPI/Assinaturas' AS "CHECK",
 md5(coalesce(jsonb_agg(jsonb_build_object('identity',identity,'detail',detail) ORDER BY identity)::text,'[]')) AS "RESULTADO",
 'ATENÇÃO' AS "STATUS" FROM actual WHERE optional;`

// Independent read-only computation usable before the new helpers exist.
export const cnpjCTE=`normalized AS (
 SELECT id,cnpj,CASE WHEN btrim(cnpj) COLLATE "C" ~ '^([0-9A-Za-z]{12}[0-9]{2}|[0-9A-Za-z]{2}\\.[0-9A-Za-z]{3}\\.[0-9A-Za-z]{3}/[0-9A-Za-z]{4}-[0-9]{2})$'
 THEN translate(btrim(cnpj),'abcdefghijklmnopqrstuvwxyz./-','ABCDEFGHIJKLMNOPQRSTUVWXYZ') END canonical FROM public.empresas
),digits AS (
 SELECT n.*, (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,12) j) remainder1,
 (SELECT sum((ascii(substr(canonical,j,1))-48)*(ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2])[j])%11 FROM generate_series(1,13) j) remainder2
 FROM normalized n
),validated AS (
 SELECT *,coalesce(canonical IS NOT NULL AND canonical<>repeat(substr(canonical,1,1),14)
 AND substr(canonical,13,1)=(CASE WHEN remainder1<2 THEN 0 ELSE 11-remainder1 END)::text
 AND substr(canonical,14,1)=(CASE WHEN remainder2<2 THEN 0 ELSE 11-remainder2 END)::text,false) valid FROM digits
)`
