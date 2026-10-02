-- Executar inteiro no SQL Editor administrativo. Somente catalogos/dados.
-- Nenhum helper da aplicacao e invocado. Nao testa JWT, uploads, HTTP ou bytes.
-- Sem bypass/ownership adequado, RLS pode ocultar dados: conferir secao 00.
-- Faz leitura de storage.objects; em bases grandes, preferir fora do pico.
-- Saida contem URLs e codigo de funcoes; tratar como confidencial.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH RECURSIVE
rels AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='storage' AND c.relname IN ('objects','buckets'))
 OR (n.nspname='public' AND c.relname IN ('empresas','user_profiles'))
),
policies AS (
 SELECT p.*,pg_get_expr(p.polqual,p.polrelid) AS using_expression,
 pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
 FROM pg_policy p WHERE p.polrelid IN (SELECT oid FROM rels)
),
deps(classid,objid) AS (
 SELECT 'pg_policy'::regclass::oid,oid FROM policies
 UNION
 SELECT d.refclassid,d.refobjid FROM pg_depend d JOIN deps x
 ON d.classid=x.classid AND d.objid=x.objid
 WHERE d.refclassid IN ('pg_proc'::regclass,'pg_class'::regclass,
 'pg_operator'::regclass,'pg_type'::regclass)
),
refs AS (
 SELECT e.id::text AS empresa_id,to_jsonb(e)->>'status' AS empresa_status,
 to_jsonb(e)->>'logo_url' AS logo_url,
 split_part(split_part(btrim(to_jsonb(e)->>'logo_url'),'?',1),'#',1) AS clean_ref
 FROM public.empresas e WHERE to_jsonb(e)->>'logo_url' IS NOT NULL
),
parsed AS (
 SELECT r.*,CASE
 WHEN clean_ref ~ '/storage/v1/object/(public|sign|authenticated)/'
 THEN regexp_replace(clean_ref,'^.*?/storage/v1/object/(public|sign|authenticated)/','')
 WHEN clean_ref ~ '^https?://' THEN NULL
 ELSE regexp_replace(clean_ref,'^/','') END AS bucket_path,
 CASE WHEN clean_ref ~ '^https?://' THEN split_part(clean_ref,'/',3) END AS url_host
 FROM refs r
),
mapped AS (
 SELECT p.*,split_part(bucket_path,'/',1) AS ref_bucket,
 substring(bucket_path FROM position('/' IN bucket_path)+1) AS ref_path
 FROM parsed p
),
matches AS (
 SELECT m.*,coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',o.id,'bucket_id',o.bucket_id,'name',o.name,
 'tenant_corresponde',split_part(o.name,'/',1)=m.empresa_id))
 FROM storage.objects o WHERE
 (m.bucket_path LIKE '%/%' AND o.bucket_id=m.ref_bucket AND o.name=m.ref_path)
 OR (o.bucket_id='logos' AND o.name=m.bucket_path)),'[]'::jsonb) AS objetos
 FROM mapped m
),
objects AS (
 SELECT o.*,split_part(o.name,'/',1) AS primeiro_segmento,
 o.name ~ '^[^/]+/logo\.[^/]+$' AS formato_frontend,
 EXISTS (SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(o.name,'/',1)) AS tenant_existe
 FROM storage.objects o WHERE o.bucket_id='logos' OR o.bucket_id ILIKE '%logo%'
 OR o.name ~* '(^|/)logos?(/|\.|$)'
 OR EXISTS (SELECT 1 FROM mapped m WHERE o.bucket_id=m.ref_bucket AND o.name=m.ref_path)
),
report AS (
 SELECT '00_contexto_e_limites' AS secao,jsonb_build_object(
 'current_user',current_user,'session_user',session_user,
 'read_only',current_setting('transaction_read_only'),
 'isolation',current_setting('transaction_isolation'),'snapshot_at',transaction_timestamp(),
 'database',current_database(),'policy_grants',current_setting('supautils.policy_grants',true),
 'row_security',current_setting('row_security'),
 'executor_superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
 'executor_bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'limites',ARRAY['Catalogo nao prova equivalencia sem revisar expressoes, roles e helpers.',
 'Nenhum helper e executado; sem simulacao JWT ou teste HTTP/bytes.',
 'URLs percent-encoded nao sao decodificadas; host remoto nao e validado.',
 'Corpos SQL textuais/PLpgSQL/dinamicos podem nao constar no pg_depend; revisar funcoes inventariadas.',
 'Bucket publico permite entrega publica de bytes; nao concede escrita.',
 'Dados podem ser parciais por RLS se o executor nao tiver acesso administrativo.']) AS dados
 UNION ALL
 SELECT '01_buckets',to_jsonb(b) FROM storage.buckets b
 UNION ALL
 SELECT '02_relacoes_rls_acl',jsonb_build_object('relation',r.oid::regclass::text,
 'owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,
 'acl_raw',r.relacl,'acl_effective',(SELECT jsonb_agg(to_jsonb(a)) FROM
 aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a)) FROM rels r
 UNION ALL
 SELECT '03_todas_policies',jsonb_build_object('relation',p.polrelid::regclass::text,
 'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
 'roles',(SELECT jsonb_agg(CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x) END)
 FROM unnest(p.polroles) x),'using',p.using_expression,'with_check',p.check_expression,
 'update_check_implicit',p.polcmd IN ('w','*') AND p.check_expression IS NULL,
 'candidato_logos',CASE WHEN p.polrelid<>'storage.objects'::regclass THEN 'CONTEXTO'
 WHEN (coalesce(p.using_expression,'')||coalesce(p.check_expression,'')) ILIKE '%logo%'
 THEN 'MENCAO_EXPLICITA' ELSE 'REVISAR: pode autorizar logos por expressao ampla/helper' END)
 FROM policies p
 UNION ALL
 SELECT '04_roles',jsonb_build_object('oid',r.oid,'name',r.rolname,'superuser',r.rolsuper,
 'bypassrls',r.rolbypassrls,'inherit',r.rolinherit,'login',r.rolcanlogin,'config',r.rolconfig)
 FROM pg_roles r
 UNION ALL
 SELECT '05_memberships',to_jsonb(m) FROM pg_auth_members m
 UNION ALL
 SELECT '05_role_database_settings',jsonb_build_object(
 'role',CASE WHEN s.setrole=0 THEN 'ALL' ELSE pg_get_userbyid(s.setrole) END,
 'database',CASE WHEN s.setdatabase=0 THEN 'ALL' ELSE
 (SELECT datname FROM pg_database WHERE oid=s.setdatabase) END,'settings',s.setconfig)
 FROM pg_db_role_setting s WHERE s.setdatabase=0 OR
 s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())
 UNION ALL
 SELECT '06_privilegios_efetivos',jsonb_build_object('role',r.rolname,
 'relation',t.oid::regclass::text,'privilege',v.privilege,
 'granted',has_table_privilege(r.oid,t.oid,v.privilege))
 FROM pg_roles r CROSS JOIN rels t CROSS JOIN
 (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
 WHERE r.rolname IN ('anon','authenticated','service_role','authenticator',current_user)
 UNION ALL
 SELECT '07_acl_colunas',jsonb_build_object('relation',a.attrelid::regclass::text,
 'column',a.attname,'acl',a.attacl) FROM pg_attribute a
 WHERE a.attrelid IN (SELECT oid FROM rels) AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT '08_schemas_acl',jsonb_build_object('schema',n.nspname,
 'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl)
 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
 UNION ALL
 SELECT '09_helpers_e_funcoes',jsonb_build_object('oid',p.oid,
 'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
 'security_definer',p.prosecdef,'volatility',p.provolatile,'config_search_path',p.proconfig,
 'acl_raw',p.proacl,'acl_effective',(SELECT jsonb_agg(to_jsonb(a)) FROM
 aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),
 'dependency_registered',EXISTS (SELECT 1 FROM deps d
 WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid),'definition',pg_get_functiondef(p.oid))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind IN ('f','p') AND ((n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
 OR EXISTS (SELECT 1 FROM deps d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid))
 UNION ALL
 SELECT '10_dependencias_registradas',jsonb_build_object('class',d.classid::regclass::text,
 'oid',d.objid,'identity',pg_describe_object(d.classid,d.objid,0)) FROM deps d
 UNION ALL
 SELECT '10_dependencias_por_policy',jsonb_build_object('policy',p.polname,
 'relation',p.polrelid::regclass::text,'dependency',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid))
 FROM policies p JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid
 UNION ALL
 SELECT '11_triggers',jsonb_build_object('relation',t.tgrelid::regclass::text,
 'name',t.tgname,'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text,
 'definition',pg_get_triggerdef(t.oid)) FROM pg_trigger t
 WHERE t.tgrelid IN (SELECT oid FROM rels) AND NOT t.tgisinternal
 UNION ALL
 SELECT '12_objetos_logos',to_jsonb(o) FROM objects o
 UNION ALL
 SELECT '13_contagens_por_bucket',jsonb_build_object('bucket',b.id,
 'total_objetos_bucket',(SELECT count(*) FROM storage.objects o WHERE o.bucket_id=b.id),
 'objetos_relacionados_logos',(SELECT count(*) FROM objects o WHERE o.bucket_id=b.id))
 FROM storage.buckets b
 UNION ALL
 SELECT '14_referencias_empresas',to_jsonb(m)||jsonb_build_object('correspondencia',CASE
 WHEN btrim(logo_url)='' THEN 'REFERENCIA_VAZIA'
 WHEN position('%' IN logo_url)>0 THEN 'REVISAR_PERCENT_ENCODING'
 WHEN jsonb_array_length(objetos)=0 THEN 'SEM_CORRESPONDENCIA_LOCAL'
 ELSE 'OBJETO_LOCAL_ENCONTRADO_HOST_E_BYTES_NAO_VERIFICADOS' END) FROM matches m
 UNION ALL
 SELECT '15_objetos_sem_referencia',jsonb_build_object('id',o.id,'bucket',o.bucket_id,'name',o.name)
 FROM objects o WHERE NOT EXISTS (SELECT 1 FROM matches m,
 jsonb_array_elements(m.objetos) x WHERE x->>'id'=o.id::text)
 UNION ALL
 SELECT '15_resumo_dados',jsonb_build_object('bucket_logos_existe',
 EXISTS (SELECT 1 FROM storage.buckets WHERE id='logos'),
 'empresas_total',(SELECT count(*) FROM public.empresas),
 'referencias_nao_nulas',(SELECT count(*) FROM matches),
 'referencias_sem_correspondencia',(SELECT count(*) FROM matches WHERE jsonb_array_length(objetos)=0),
 'objetos_logos',(SELECT count(*) FROM storage.objects WHERE bucket_id='logos'),
 'objetos_relacionados',(SELECT count(*) FROM objects),
 'objetos_tenant_inexistente',(SELECT count(*) FROM objects WHERE NOT tenant_existe),
 'objetos_fora_formato_frontend',(SELECT count(*) FROM objects WHERE NOT formato_frontend))
 UNION ALL
 SELECT '16_criterios_decisao',jsonb_build_object(
 'POLICY_EQUIVALENTE_SEGURA_EXISTE','Confirmar SELECT+INSERT+UPDATE para upsert, grants, OR das permissivas/AND das restritivas, helpers seguros, ator ativo e papel autorizado, tenant/empresa ativa e origem/destino validos. Operacional/anon/inativo/cross-tenant sem escrita. Nomes nao provam seguranca.',
 'LOGOS_SEM_AUTORIZACAO','Confirmar RLS e grants e ausencia de autorizacao efetiva para alguma operacao do fluxo. Bucket publico nao resolve INSERT/UPDATE. Revisar todas as policies, inclusive sem mencao a logos.',
 'CONFIGURACAO_INSEGURA','Escrita por operacional/anon/inativo/cross-tenant, predicados amplos, bypass exposto aos atores, helpers inseguros ou falta de protecao de origem/destino. Publicidade de logos por si so nao implica inseguranca.',
 'INCONSISTENCIA_DE_DADOS','Referencia sem objeto, bucket inexistente, tenant divergente/inexistente, path fora do contrato ou URL externa/encoded a revisar. Objeto sem referencia pode ser legado.',
 'classificacao_automatica','NAO_CONCLUSIVA: categorias podem coexistir. Revisar evidencias, nunca inferir seguranca por nome/regex.')
)
SELECT secao,dados FROM report ORDER BY secao,dados::text;
COMMIT;
