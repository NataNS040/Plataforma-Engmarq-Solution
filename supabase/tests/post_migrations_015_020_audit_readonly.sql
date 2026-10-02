-- AUDITORIA POS-MIGRACOES 015-020. Executar inteiro, manualmente, em sessao nova.
-- NENHUM DDL/DML, lock, objeto temporario, SET ROLE, JWT ou escrita de dados.
-- A transacao impede escrita e usa um snapshot consistente de leitura.
-- Nao executar preflights PRE-018/PRE-020 depois do cutover: footprints agora sao esperados.
-- Referencia de catalogo: migrations LOCAIS auditadas na ordem 015/016/017/019/020/018.
-- Comparar com essas definicoes nao certifica por si so as regras funcionais:
-- as policies legadas de documentos sao verificadas separadamente como risco.
-- MD5 aqui detecta drift de catalogo; nao e mecanismo de autenticacao/seguranca.
-- Contagens nao provam identidades nem existencia dos bytes em S3; ver observacoes finais.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
-- Evidencias detalhadas de catalogo; a ultima tabela abaixo e o consolidado.
SELECT n.nspname schema_name,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
 pg_get_userbyid(c.relowner) owner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN ('empresas','user_profiles','colaboradores','funcoes','setores','ambientes',
 'documentos','treinamentos','matriz_treinamentos','treinamento_tipos','vw_dashboard_documentos','vw_dashboard_treinamentos'))
 OR (n.nspname='storage' AND c.relname IN ('objects','buckets')) ORDER BY n.nspname,c.relname;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
 WHERE (schemaname='public' AND tablename IN ('empresas','user_profiles','colaboradores','funcoes','setores','ambientes',
 'documentos','treinamentos','matriz_treinamentos','treinamento_tipos','fichas_epi','fichas_epi_itens'))
 OR (schemaname='storage' AND tablename='objects') ORDER BY schemaname,tablename,policyname;
SELECT p.oid::regprocedure signature,pg_get_userbyid(p.proowner) owner,p.proacl,p.proconfig,pg_get_functiondef(p.oid) definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='engmarq_private' OR (n.nspname='public' AND p.proname IN ('get_user_role','get_user_empresa_id')) ORDER BY p.oid::regprocedure::text;
SELECT n.nspname||'.'||c.relname relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('empresas','user_profiles','colaboradores','funcoes','setores','ambientes','documentos','treinamentos','matriz_treinamentos')
 AND NOT t.tgisinternal ORDER BY relation,t.tgname;
SELECT n.nspname||'.'||c.relname relation,k.conname,k.convalidated,pg_get_constraintdef(k.oid) definition
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('user_profiles','colaboradores','funcoes','setores','ambientes','documentos','treinamentos','matriz_treinamentos')
 ORDER BY relation,k.conname;
SELECT n.nspname||'.'||c.relname view_name,c.reloptions,pg_get_viewdef(c.oid,true) definition
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relname IN ('vw_dashboard_documentos','vw_dashboard_treinamentos') AND c.relkind='v';
WITH
config AS (SELECT 'https://kkjckayiqvlqpdjyoxyv.supabase.co'::text origin,
 ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']::text[] mime),
required(relation) AS (VALUES
 ('public.user_profiles'),
 ('public.colaboradores'),
 ('public.funcoes'),
 ('public.setores'),
 ('public.ambientes'),
 ('public.treinamento_tipos'),
 ('public.matriz_treinamentos'),
 ('public.treinamentos'),
 ('public.documentos'),
 ('public.empresas'),('public.vw_dashboard_treinamentos'),('public.vw_dashboard_documentos'),('storage.objects'),('storage.buckets')),
structures AS (
 SELECT r.relation,c.oid,c.relrowsecurity,c.reloptions,
  c.oid IS NOT NULL AND has_table_privilege(c.oid,'SELECT') AND
   (NOT c.relrowsecurity OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
    OR (NOT c.relforcerowsecurity AND pg_has_role(c.relowner,'USAGE'))) readable
 FROM required r LEFT JOIN pg_class c ON c.oid=to_regclass(r.relation)
),
required_columns(relation,columns) AS (VALUES
 ('public.documentos',ARRAY['id','empresa_id','arquivo_url','arquivo_path','colaborador_id']),
 ('public.colaboradores',ARRAY['id','empresa_id','funcao_id','setor_id','ambiente_id','active','data_demissao','data_admissao']),
 ('public.user_profiles',ARRAY['id','empresa_id','role','active']),
 ('public.empresas',ARRAY['id','status']),
 ('public.funcoes',ARRAY['id','empresa_id','active','riscos']),
 ('public.setores',ARRAY['id','empresa_id','active']),('public.ambientes',ARRAY['id','empresa_id','active']),
 ('public.treinamentos',ARRAY['id','empresa_id','colaborador_id','treinamento_tipo_id','data_realizacao','data_vencimento','carga_horaria','modalidade','certificado_url']),
 ('public.matriz_treinamentos',ARRAY['empresa_id','funcao_id','treinamento_tipo_id']),
 ('public.treinamento_tipos',ARRAY['id','validade_meses']),
 ('storage.objects',ARRAY['id','bucket_id','name','metadata']),
 ('storage.buckets',ARRAY['id','public','file_size_limit','allowed_mime_types'])
),
column_checks AS (
 SELECT relation,NOT EXISTS(SELECT 1 FROM unnest(columns) x(name) WHERE NOT EXISTS(
  SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass(relation) AND attname=x.name AND attnum>0 AND NOT attisdropped)) complete
 FROM required_columns
),
ready AS (SELECT coalesce((SELECT bool_and(readable) FROM structures),false)
 AND coalesce((SELECT bool_and(complete) FROM column_checks),false) ok),
expected_policies(schema_name,table_name,policy_name,permissive,roles,cmd,qual,with_check) AS (VALUES
 ('public','ambientes','ambientes_insert','PERMISSIVE','{authenticated}','INSERT',NULL,'engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','ambientes','ambientes_select','PERMISSIVE','{authenticated}','SELECT','engmarq_private.can_access_catalogos(empresa_id)',NULL),
 ('public','ambientes','ambientes_update','PERMISSIVE','{authenticated}','UPDATE','engmarq_private.can_access_catalogos(empresa_id, true)','engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','colaboradores','colaboradores_insert','PERMISSIVE','{authenticated}','INSERT',NULL,'engmarq_private.can_access_colaboradores(empresa_id, true)'),
 ('public','colaboradores','colaboradores_select','PERMISSIVE','{authenticated}','SELECT','engmarq_private.can_access_colaboradores(empresa_id)',NULL),
 ('public','colaboradores','colaboradores_update','PERMISSIVE','{authenticated}','UPDATE','engmarq_private.can_access_colaboradores(empresa_id, true)','engmarq_private.can_access_colaboradores(empresa_id, true)'),
 ('public','documentos','documentos_select','PERMISSIVE','{public}','SELECT','((get_user_role() = ''admin''::user_role) OR (empresa_id = get_user_empresa_id()))',NULL),
 ('public','documentos','documentos_write','PERMISSIVE','{public}','ALL','((get_user_role() = ''admin''::user_role) OR ((empresa_id = get_user_empresa_id()) AND (get_user_role() = ANY (ARRAY[''gestor''::user_role, ''empresa''::user_role]))))','((get_user_role() = ''admin''::user_role) OR ((empresa_id = get_user_empresa_id()) AND (get_user_role() = ANY (ARRAY[''gestor''::user_role, ''empresa''::user_role]))))'),
 ('public','funcoes','funcoes_insert','PERMISSIVE','{authenticated}','INSERT',NULL,'engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','funcoes','funcoes_select','PERMISSIVE','{authenticated}','SELECT','engmarq_private.can_access_catalogos(empresa_id)',NULL),
 ('public','funcoes','funcoes_update','PERMISSIVE','{authenticated}','UPDATE','engmarq_private.can_access_catalogos(empresa_id, true)','engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','matriz_treinamentos','matriz_delete','PERMISSIVE','{authenticated}','DELETE','engmarq_private.can_access_catalogos(empresa_id, true)',NULL),
 ('public','matriz_treinamentos','matriz_insert','PERMISSIVE','{authenticated}','INSERT',NULL,'engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','matriz_treinamentos','matriz_select','PERMISSIVE','{authenticated}','SELECT','engmarq_private.can_access_catalogos(empresa_id)',NULL),
 ('public','matriz_treinamentos','matriz_update','PERMISSIVE','{authenticated}','UPDATE','engmarq_private.can_access_catalogos(empresa_id, true)','engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','setores','setores_insert','PERMISSIVE','{authenticated}','INSERT',NULL,'engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','setores','setores_select','PERMISSIVE','{authenticated}','SELECT','engmarq_private.can_access_catalogos(empresa_id)',NULL),
 ('public','setores','setores_update','PERMISSIVE','{authenticated}','UPDATE','engmarq_private.can_access_catalogos(empresa_id, true)','engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','treinamento_tipos','treinamento_tipos_read','PERMISSIVE','{authenticated}','SELECT','engmarq_private.can_access_catalogos(get_user_empresa_id())',NULL),
 ('public','treinamentos','treinamentos_insert','PERMISSIVE','{authenticated}','INSERT',NULL,'engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','treinamentos','treinamentos_select','PERMISSIVE','{authenticated}','SELECT','engmarq_private.can_access_catalogos(empresa_id)',NULL),
 ('public','treinamentos','treinamentos_update','PERMISSIVE','{authenticated}','UPDATE','engmarq_private.can_access_catalogos(empresa_id, true)','engmarq_private.can_access_catalogos(empresa_id, true)'),
 ('public','user_profiles','profiles_select','PERMISSIVE','{authenticated}','SELECT','((id = auth.uid()) OR engmarq_private.can_manage_profile(empresa_id))',NULL),
 ('public','user_profiles','profiles_update_managers','PERMISSIVE','{authenticated}','UPDATE','((id <> auth.uid()) AND engmarq_private.can_manage_profile(empresa_id, role))','((id <> auth.uid()) AND engmarq_private.can_manage_profile(empresa_id, role))'),
 ('storage','objects','certificados_delete_guard','RESTRICTIVE','{authenticated}','DELETE','((bucket_id <> ''documentos''::text) OR (split_part(name, ''/''::text, 2) <> ''certificados''::text))',NULL),
 ('storage','objects','certificados_insert_guard','RESTRICTIVE','{authenticated}','INSERT',NULL,'((bucket_id <> ''documentos''::text) OR (split_part(name, ''/''::text, 2) <> ''certificados''::text) OR engmarq_private.can_access_certificado(name, true))'),
 ('storage','objects','certificados_select_guard','RESTRICTIVE','{authenticated}','SELECT','((bucket_id <> ''documentos''::text) OR (split_part(name, ''/''::text, 2) <> ''certificados''::text) OR engmarq_private.can_access_certificado(name))',NULL),
 ('storage','objects','certificados_update_guard','RESTRICTIVE','{authenticated}','UPDATE','((bucket_id <> ''documentos''::text) OR (split_part(name, ''/''::text, 2) <> ''certificados''::text))','((bucket_id <> ''documentos''::text) OR (split_part(name, ''/''::text, 2) <> ''certificados''::text))'),
 ('storage','objects','documentos_storage_delete','PERMISSIVE','{authenticated}','DELETE','((bucket_id = ''documentos''::text) AND engmarq_private.can_access_documento(name, true) AND (split_part(name, ''/''::text, 2) <> ''certificados''::text))',NULL),
 ('storage','objects','documentos_storage_insert','PERMISSIVE','{authenticated}','INSERT',NULL,'((bucket_id = ''documentos''::text) AND engmarq_private.can_access_documento(name, true))'),
 ('storage','objects','documentos_storage_select','PERMISSIVE','{authenticated}','SELECT','((bucket_id = ''documentos''::text) AND engmarq_private.can_access_documento(name))',NULL),
 ('storage','objects','documentos_storage_update','PERMISSIVE','{authenticated}','UPDATE','((bucket_id = ''documentos''::text) AND engmarq_private.can_access_documento(name, true) AND (split_part(name, ''/''::text, 2) <> ''certificados''::text))','((bucket_id = ''documentos''::text) AND engmarq_private.can_access_documento(name, true) AND (split_part(name, ''/''::text, 2) <> ''certificados''::text))'),
 ('storage','objects','documentos_tenant_delete_guard','RESTRICTIVE','{public}','DELETE','((bucket_id <> ''documentos''::text) OR (engmarq_private.can_access_documento(name, true) AND (split_part(name, ''/''::text, 2) <> ''certificados''::text)))',NULL),
 ('storage','objects','documentos_tenant_insert_guard','RESTRICTIVE','{public}','INSERT',NULL,'((bucket_id <> ''documentos''::text) OR engmarq_private.can_access_documento(name, true))'),
 ('storage','objects','documentos_tenant_select_guard','RESTRICTIVE','{public}','SELECT','((bucket_id <> ''documentos''::text) OR engmarq_private.can_access_documento(name))',NULL),
 ('storage','objects','documentos_tenant_update_guard','RESTRICTIVE','{public}','UPDATE','((bucket_id <> ''documentos''::text) OR (engmarq_private.can_access_documento(name, true) AND (split_part(name, ''/''::text, 2) <> ''certificados''::text)))','((bucket_id <> ''documentos''::text) OR (engmarq_private.can_access_documento(name, true) AND (split_part(name, ''/''::text, 2) <> ''certificados''::text)))')),
policy_checks AS (
 SELECT e.*,p.policyname IS NOT NULL present,
 p.policyname IS NOT NULL AND p.permissive=e.permissive AND p.roles::text=e.roles AND p.cmd=e.cmd
 AND regexp_replace(coalesce(p.qual,''),'[[:space:]]','','g')=regexp_replace(coalesce(e.qual,''),'[[:space:]]','','g')
 AND regexp_replace(coalesce(p.with_check,''),'[[:space:]]','','g')=regexp_replace(coalesce(e.with_check,''),'[[:space:]]','','g') matches
 FROM expected_policies e LEFT JOIN pg_policies p ON p.schemaname=e.schema_name AND p.tablename=e.table_name AND p.policyname=e.policy_name
),
expected_functions(signature,result_type,security_definer,volatility,config,source_hash) AS (VALUES
 ('engmarq_private.can_access_catalogos(uuid,boolean)','boolean',true,'s','{"search_path=\"\""}','cc63f95ceab7fa375eb6fc754b3b05a4'),
 ('engmarq_private.can_access_certificado(text,boolean)','boolean',true,'s','{"search_path=\"\""}','a7142371a46a9f0878235ad4698c331a'),
 ('engmarq_private.can_access_colaboradores(uuid,boolean)','boolean',true,'s','{"search_path=\"\""}','cc63f95ceab7fa375eb6fc754b3b05a4'),
 ('engmarq_private.can_access_documento(text,boolean)','boolean',true,'s','{"search_path=\"\""}','bdef7a5e5f513cd78f019a59eaa4d1f0'),
 ('engmarq_private.can_manage_profile(uuid,user_role)','boolean',true,'s','{"search_path=\"\""}','3687c70ed6c048bf1d0c400f215b0d7a'),
 ('engmarq_private.documento_legacy_path(text,uuid,text)','text',false,'i','{"search_path=\"\""}','256b7a80d65c2f41e5d5b5ac2ec2f647'),
 ('engmarq_private.guard_catalogo_write()','trigger',true,'v','{"search_path=\"\""}','dc8999bbe25d4e00387cffdc7ba9ea9a'),
 ('engmarq_private.guard_colaborador_write()','trigger',true,'v','{"search_path=\"\""}','cf28089bf3cb029f1bb475ded8eadf37'),
 ('engmarq_private.guard_documento_reference()','trigger',true,'v','{"search_path=\"\""}','d025fe67ef4ff2c59a549778091b7afe'),
 ('engmarq_private.guard_profile_update()','trigger',true,'v','{"search_path=\"\""}','c97535b7b8ae0c12e70e443538e8548e'),
 ('engmarq_private.guard_treinamento_write()','trigger',true,'v','{"search_path=\"\""}','b7fcbc0f088aeefc01e4db3a58c589b2')),
function_checks AS (
 SELECT e.*,p.oid,p.proowner,p.prosrc,p.prosecdef,p.proconfig,
 p.oid IS NOT NULL AND p.prorettype::regtype::text=e.result_type AND p.prosecdef=e.security_definer AND p.provolatile::text=e.volatility
 AND p.proconfig::text=e.config matches,
 md5(regexp_replace(p.prosrc,'[[:space:]]','','g'))=e.source_hash same_body
 FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
),
expected_constraints(relation,name,type,definition,validated) AS (VALUES
 ('public.ambientes','ambientes_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.ambientes','ambientes_empresa_id_id_key','u','UNIQUE (empresa_id, id)',true),
 ('public.ambientes','ambientes_empresa_id_nome_key','u','UNIQUE (empresa_id, nome)',true),
 ('public.colaboradores','colaboradores_ambiente_id_fkey','f','FOREIGN KEY (empresa_id, ambiente_id) REFERENCES ambientes(empresa_id, id)',true),
 ('public.colaboradores','colaboradores_empresa_id_cpf_key','u','UNIQUE (empresa_id, cpf)',true),
 ('public.colaboradores','colaboradores_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.colaboradores','colaboradores_empresa_id_id_key','u','UNIQUE (empresa_id, id)',true),
 ('public.colaboradores','colaboradores_funcao_id_fkey','f','FOREIGN KEY (empresa_id, funcao_id) REFERENCES funcoes(empresa_id, id)',true),
 ('public.colaboradores','colaboradores_setor_id_fkey','f','FOREIGN KEY (empresa_id, setor_id) REFERENCES setores(empresa_id, id)',true),
 ('public.documentos','documentos_arquivo_path_check','c','CHECK (((arquivo_path IS NULL) OR (arquivo_path ~ ((''^''::text || (empresa_id)::text) || ''/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$''::text))))',true),
 ('public.documentos','documentos_colaborador_id_fkey','f','FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL',true),
 ('public.documentos','documentos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.documentos','documentos_subtipo_exame_check','c','CHECK (((subtipo_exame = ANY (ARRAY[''admissional''::text, ''periodico''::text, ''mudanca_risco''::text, ''retorno_trabalho''::text, ''demissional''::text])) OR (subtipo_exame IS NULL)))',true),
 ('public.documentos','documentos_tipo_id_fkey','f','FOREIGN KEY (tipo_id) REFERENCES documento_tipos(id)',true),
 ('public.funcoes','funcoes_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.funcoes','funcoes_empresa_id_id_key','u','UNIQUE (empresa_id, id)',true),
 ('public.funcoes','funcoes_empresa_id_nome_key','u','UNIQUE (empresa_id, nome)',true),
 ('public.matriz_treinamentos','matriz_treinamentos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.matriz_treinamentos','matriz_treinamentos_empresa_id_funcao_id_treinamento_tipo_i_key','u','UNIQUE (empresa_id, funcao_id, treinamento_tipo_id)',true),
 ('public.matriz_treinamentos','matriz_treinamentos_funcao_id_fkey','f','FOREIGN KEY (empresa_id, funcao_id) REFERENCES funcoes(empresa_id, id)',true),
 ('public.matriz_treinamentos','matriz_treinamentos_treinamento_tipo_id_fkey','f','FOREIGN KEY (treinamento_tipo_id) REFERENCES treinamento_tipos(id)',true),
 ('public.setores','setores_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.setores','setores_empresa_id_id_key','u','UNIQUE (empresa_id, id)',true),
 ('public.setores','setores_empresa_id_nome_key','u','UNIQUE (empresa_id, nome)',true),
 ('public.treinamento_tipos','treinamento_tipos_nome_key','u','UNIQUE (nome)',true),
 ('public.treinamentos','treinamentos_certificado_path_check','c','CHECK (((certificado_url IS NULL) OR (certificado_url ~ ((''^''::text || (empresa_id)::text) || ''/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$''::text))))',true),
 ('public.treinamentos','treinamentos_colaborador_id_fkey','f','FOREIGN KEY (empresa_id, colaborador_id) REFERENCES colaboradores(empresa_id, id)',true),
 ('public.treinamentos','treinamentos_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.treinamentos','treinamentos_modalidade_check','c','CHECK ((modalidade = ANY (ARRAY[''presencial''::text, ''online''::text, ''semipresencial''::text])))',true),
 ('public.treinamentos','treinamentos_treinamento_tipo_id_fkey','f','FOREIGN KEY (treinamento_tipo_id) REFERENCES treinamento_tipos(id)',true),
 ('public.user_profiles','user_profiles_empresa_id_fkey','f','FOREIGN KEY (empresa_id) REFERENCES empresas(id)',true),
 ('public.user_profiles','user_profiles_id_fkey','f','FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE',true)),
constraint_checks AS (
 SELECT e.*,k.oid,k.convalidated,
 k.oid IS NOT NULL AND k.contype::text=e.type AND k.convalidated
 AND regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]]','','g')=regexp_replace(e.definition,'[[:space:]]','','g') matches
 FROM expected_constraints e LEFT JOIN pg_constraint k ON k.conrelid=to_regclass(e.relation) AND k.conname=e.name
),
expected_triggers(relation,name,type,enabled,function_name) AS (VALUES
 ('public.ambientes','guard_catalogo_write',23,'O','engmarq_private.guard_catalogo_write()'),
 ('public.colaboradores','guard_colaborador_write',23,'O','engmarq_private.guard_colaborador_write()'),
 ('public.documentos','guard_documento_reference',23,'O','engmarq_private.guard_documento_reference()'),
 ('public.documentos','trg_documento_status',23,'O','update_documento_status()'),
 ('public.funcoes','guard_catalogo_write',23,'O','engmarq_private.guard_catalogo_write()'),
 ('public.matriz_treinamentos','guard_treinamento_write',31,'O','engmarq_private.guard_treinamento_write()'),
 ('public.setores','guard_catalogo_write',23,'O','engmarq_private.guard_catalogo_write()'),
 ('public.treinamentos','guard_treinamento_write',31,'O','engmarq_private.guard_treinamento_write()'),
 ('public.treinamentos','trg_treinamento_status',23,'O','update_treinamento_status()'),
 ('public.user_profiles','guard_profile_update',19,'O','engmarq_private.guard_profile_update()')),
trigger_checks AS (
 SELECT e.*,t.oid,t.tgenabled,
 t.oid IS NOT NULL AND t.tgtype=e.type AND t.tgenabled::text=e.enabled AND NOT t.tgisinternal
 AND t.tgfoid=to_regprocedure(e.function_name) matches
 FROM expected_triggers e LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass(e.relation) AND t.tgname=e.name
),
data_queries(ord,label,query_text,expected,severity) AS (VALUES
 (500,'Storage: documentos preservados',$q$SELECT count(*) n FROM public.documentos$q$,12,'BLOQUEIO'),
 (501,'Storage: legacy_references preservadas',$q$SELECT count(*) n FROM public.documentos WHERE arquivo_url IS NOT NULL$q$,4,'BLOQUEIO'),
 (502,'Storage: canonical_references após backfill',$q$SELECT count(*) n FROM public.documentos WHERE arquivo_path IS NOT NULL$q$,4,'BLOQUEIO'),
 (503,'Storage: pending_backfill',$q$SELECT count(*) n FROM public.documentos WHERE arquivo_url IS NOT NULL AND arquivo_path IS NULL$q$,0,'BLOQUEIO'),
 (504,'Storage: objetos preservados',$q$SELECT count(*) n FROM storage.objects WHERE bucket_id='documentos'$q$,4,'BLOQUEIO'),
 (505,'Storage: MIME inválido',$q$SELECT count(*) n FROM storage.objects WHERE bucket_id='documentos' AND
  (metadata->>'mimetype' IS NULL OR metadata->>'mimetype' NOT IN
  ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png'))$q$,0,'BLOQUEIO'),
 (506,'Storage: tamanho inválido ou acima de 10 MB',$q$SELECT count(*) n FROM storage.objects WHERE bucket_id='documentos' AND
  CASE WHEN coalesce(metadata->>'size','') !~ '^[0-9]+$' THEN true ELSE (metadata->>'size')::numeric>10485760 END$q$,0,'BLOQUEIO'),
 (507,'Storage: path/tenant inválido',$q$SELECT count(*) n FROM storage.objects o WHERE bucket_id='documentos' AND
  (name IS NULL OR name !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
   OR NOT EXISTS(SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(o.name,'/',1)))$q$,0,'BLOQUEIO'),
 (508,'Documentos: path canônico inválido/cross-tenant',$q$SELECT count(*) n FROM public.documentos WHERE arquivo_path IS NOT NULL
  AND arquivo_path !~ ('^'||empresa_id::text||'/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')$q$,0,'BLOQUEIO'),
 (509,'Documentos: referência canônica sem objeto',$q$SELECT count(*) n FROM public.documentos d WHERE arquivo_path IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=d.arquivo_path)$q$,0,'BLOQUEIO'),
 (510,'Documentos: URL legada inválida/cross-tenant',$q$SELECT count(*) n FROM public.documentos WHERE arquivo_url IS NOT NULL AND
  (left(arquivo_url,length('https://kkjckayiqvlqpdjyoxyv.supabase.co/storage/v1/object/public/documentos/'))<>
   'https://kkjckayiqvlqpdjyoxyv.supabase.co/storage/v1/object/public/documentos/' OR
   substr(arquivo_url,length('https://kkjckayiqvlqpdjyoxyv.supabase.co/storage/v1/object/public/documentos/')+1)
    !~ ('^'||empresa_id::text||'/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'))$q$,0,'BLOQUEIO'),
 (511,'Documentos: referência legada sem objeto',$q$SELECT count(*) n FROM public.documentos d WHERE arquivo_url IS NOT NULL AND
  NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=
   substr(d.arquivo_url,length('https://kkjckayiqvlqpdjyoxyv.supabase.co/storage/v1/object/public/documentos/')+1))$q$,0,'BLOQUEIO'),
 (512,'Documentos: URL/path diferentes do backfill esperado',$q$SELECT count(*) n FROM public.documentos WHERE arquivo_url IS NOT NULL
  AND arquivo_path IS DISTINCT FROM substr(arquivo_url,length('https://kkjckayiqvlqpdjyoxyv.supabase.co/storage/v1/object/public/documentos/')+1)$q$,0,'ATENÇÃO'),
 (513,'Colaboradores: função/setor/ambiente cross-tenant',$q$SELECT count(*) n FROM public.colaboradores c
  LEFT JOIN public.funcoes f ON f.id=c.funcao_id AND f.empresa_id=c.empresa_id
  LEFT JOIN public.setores s ON s.id=c.setor_id AND s.empresa_id=c.empresa_id
  LEFT JOIN public.ambientes a ON a.id=c.ambiente_id AND a.empresa_id=c.empresa_id
  WHERE f.id IS NULL OR s.id IS NULL OR (c.ambiente_id IS NOT NULL AND a.id IS NULL)$q$,0,'BLOQUEIO'),
 (514,'Treinamentos: colaborador cross-tenant',$q$SELECT count(*) n FROM public.treinamentos t LEFT JOIN public.colaboradores c
  ON c.id=t.colaborador_id AND c.empresa_id=t.empresa_id WHERE c.id IS NULL$q$,0,'BLOQUEIO'),
 (515,'Matriz: função cross-tenant',$q$SELECT count(*) n FROM public.matriz_treinamentos m LEFT JOIN public.funcoes f
  ON f.id=m.funcao_id AND f.empresa_id=m.empresa_id WHERE f.id IS NULL$q$,0,'BLOQUEIO'),
 (516,'Treinamentos/matriz: tipo inexistente',$q$SELECT count(*) n FROM (
  SELECT treinamento_tipo_id FROM public.treinamentos UNION ALL SELECT treinamento_tipo_id FROM public.matriz_treinamentos
 ) t WHERE NOT EXISTS(SELECT 1 FROM public.treinamento_tipos tt WHERE tt.id=t.treinamento_tipo_id)$q$,0,'BLOQUEIO'),
 (517,'Certificados: path inválido/cross-tenant',$q$SELECT count(*) n FROM public.treinamentos WHERE certificado_url IS NOT NULL
  AND certificado_url !~ ('^'||empresa_id::text||'/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')$q$,0,'BLOQUEIO'),
 (518,'Certificados: referência sem objeto',$q$SELECT count(*) n FROM public.treinamentos t WHERE certificado_url IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='documentos' AND name=t.certificado_url)$q$,0,'BLOQUEIO'),
 (519,'Colaboradores: desligamento inconsistente',$q$SELECT count(*) n FROM public.colaboradores
  WHERE active IS NULL OR (NOT active AND data_demissao IS NULL) OR (active AND data_demissao IS NOT NULL)$q$,0,'ATENÇÃO'),
 (520,'Treinamentos: datas/horas/modalidade inconsistentes',$q$SELECT count(*) n FROM public.treinamentos
  WHERE data_vencimento<data_realizacao OR carga_horaria<0 OR carga_horaria::text='NaN'
   OR (modalidade IS NOT NULL AND modalidade NOT IN ('presencial','online','semipresencial'))$q$,0,'ATENÇÃO'),
 (521,'Documentos: vínculo com colaborador cross-tenant',$q$SELECT count(*) n FROM public.documentos d WHERE colaborador_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.colaboradores c WHERE c.id=d.colaborador_id AND c.empresa_id=d.empresa_id)$q$,0,'BLOQUEIO'),
 (522,'Storage: objetos sem referência atual',$q$SELECT count(*) n FROM storage.objects o WHERE bucket_id='documentos' AND
  NOT EXISTS(SELECT 1 FROM public.documentos d WHERE d.arquivo_path=o.name OR
   substr(d.arquivo_url,length('https://kkjckayiqvlqpdjyoxyv.supabase.co/storage/v1/object/public/documentos/')+1)=o.name)
  AND NOT EXISTS(SELECT 1 FROM public.treinamentos t WHERE t.certificado_url=o.name)$q$,0,'ATENÇÃO'),
 (523,'Treinamento tipos: validade inválida',$q$SELECT count(*) n FROM public.treinamento_tipos WHERE validade_meses<=0$q$,0,'ATENÇÃO'),
 (524,'Colaboradores: demissão anterior à admissão',$q$SELECT count(*) n FROM public.colaboradores WHERE data_demissao<data_admissao$q$,0,'ATENÇÃO')
),
data_results AS MATERIALIZED (
 SELECT q.*,CASE WHEN ready.ok THEN ((xpath('/table/row/n/text()',query_to_xml(query_text,true,false,'')))[1])::text::bigint END n
 FROM data_queries q CROSS JOIN ready
),
write_columns(table_name,operation,columns) AS (VALUES
 ('user_profiles','INSERT',ARRAY[]::text[]),('user_profiles','UPDATE',ARRAY['role','active']),
 ('colaboradores','INSERT',ARRAY['empresa_id','nome','cpf','matricula','funcao_id','setor_id','ambiente_id','data_admissao','active']),
 ('colaboradores','UPDATE',ARRAY['nome','matricula','funcao_id','setor_id','ambiente_id','active','data_demissao']),
 ('funcoes','INSERT',ARRAY['empresa_id','nome','descricao','active','riscos']),('funcoes','UPDATE',ARRAY['nome','descricao','active','riscos']),
 ('setores','INSERT',ARRAY['empresa_id','nome','descricao','active']),('setores','UPDATE',ARRAY['nome','descricao','active']),
 ('ambientes','INSERT',ARRAY['empresa_id','nome','descricao','active']),('ambientes','UPDATE',ARRAY['nome','descricao','active']),
 ('treinamentos','INSERT',ARRAY['empresa_id','colaborador_id','treinamento_tipo_id','data_realizacao','data_vencimento','carga_horaria','instrutor','modalidade','certificado_url']),
 ('treinamentos','UPDATE',ARRAY['colaborador_id','treinamento_tipo_id','data_realizacao','data_vencimento','carga_horaria','instrutor','modalidade','certificado_url']),
 ('matriz_treinamentos','INSERT',ARRAY['empresa_id','funcao_id','treinamento_tipo_id','obrigatorio']),('matriz_treinamentos','UPDATE',ARRAY['obrigatorio']),
 ('treinamento_tipos','INSERT',ARRAY[]::text[]),('treinamento_tipos','UPDATE',ARRAY[]::text[])
),
column_grants AS (
 SELECT w.*,a.attname,has_column_privilege('authenticated',c.oid,a.attnum,w.operation) allowed,
  a.attname=ANY(w.columns) expected FROM write_columns w
 JOIN pg_class c ON c.oid=to_regclass('public.'||w.table_name)
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
),
history AS (
 SELECT c.oid,c.oid IS NOT NULL AND has_table_privilege(c.oid,'SELECT')
 AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.oid AND attname='version' AND NOT attisdropped)
 AND (NOT c.relrowsecurity OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
  OR (NOT c.relforcerowsecurity AND pg_has_role(c.relowner,'USAGE'))) readable
 FROM (SELECT to_regclass('supabase_migrations.schema_migrations') oid) h LEFT JOIN pg_class c ON c.oid=h.oid
),
history_versions(version) AS (VALUES ('015'),('016'),('017'),('018'),('019'),('020')),
history_results AS MATERIALIZED (
 SELECT v.version,h.readable,CASE WHEN h.readable THEN
 ((xpath('/table/row/n/text()',query_to_xml(format('SELECT count(*) n FROM supabase_migrations.schema_migrations WHERE version::text IN (%L,%L)',v.version,(v.version::int)::text),true,false,'')))[1])::text::bigint END n
 FROM history_versions v CROSS JOIN history h
),
report(ord,label,result,status) AS (
 SELECT 10,'Estrutura/leitura integral: '||relation,
  CASE WHEN oid IS NULL THEN 'Ausente' WHEN NOT readable THEN 'Leitura integral não comprovada; contagens de dados serão bloqueadas' ELSE 'Presente; SELECT integral' END,
  CASE WHEN readable THEN 'OK' ELSE 'BLOQUEIO' END FROM structures
 UNION ALL SELECT 11,'Colunas: '||relation,complete::text,CASE WHEN complete THEN 'OK' ELSE 'BLOQUEIO' END FROM column_checks
 UNION ALL SELECT 20,'RLS: '||relation,coalesce(relrowsecurity::text,'ausente'),
  CASE WHEN relrowsecurity THEN 'OK' ELSE 'BLOQUEIO' END FROM structures WHERE relation NOT LIKE '%vw_%'
 UNION ALL SELECT 30,'Policy: '||schema_name||'.'||table_name||'.'||policy_name,
  CASE WHEN NOT present THEN 'Ausente' WHEN matches THEN 'Comando, roles, modo e expressões iguais ao catálogo local auditado'
   ELSE 'Divergência de expressão/roles/comando/modo; comparar definição antes de aprovar' END,
  CASE WHEN matches THEN 'OK' ELSE 'BLOQUEIO' END FROM policy_checks
 UNION ALL SELECT 31,'Policy adicional: '||p.schemaname||'.'||p.tablename||'.'||p.policyname,
  p.permissive||'; '||p.cmd||'; roles='||p.roles::text||'; qual='||coalesce(p.qual,'NULL')||'; check='||coalesce(p.with_check,'NULL'),
  CASE WHEN p.schemaname='storage' THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END
 FROM pg_policies p WHERE EXISTS(SELECT 1 FROM expected_policies e WHERE e.schema_name=p.schemaname AND e.table_name=p.tablename)
 AND NOT EXISTS(SELECT 1 FROM expected_policies e WHERE e.schema_name=p.schemaname AND e.table_name=p.tablename AND e.policy_name=p.policyname)
 UNION ALL SELECT 40,'Função: '||signature,
  CASE WHEN oid IS NULL THEN 'Ausente' WHEN NOT matches THEN 'SECURITY DEFINER/volatilidade/search_path divergentes'
   WHEN NOT same_body THEN 'Corpo diferente do catálogo local (espaços ignorados); revisar pg_get_functiondef'
   ELSE 'Assinatura, flags, search_path e fingerprint do corpo conferem' END,
  CASE WHEN NOT coalesce(matches,false) THEN 'BLOQUEIO' WHEN NOT same_body THEN 'ATENÇÃO' ELSE 'OK' END FROM function_checks
 UNION ALL SELECT 41,'EXECUTE função: '||signature,
  'authenticated='||coalesce(has_function_privilege('authenticated',oid,'EXECUTE')::text,'NULL')
   ||'; anon='||coalesce(has_function_privilege('anon',oid,'EXECUTE')::text,'NULL'),
  CASE WHEN oid IS NULL THEN 'BLOQUEIO'
   WHEN signature LIKE '%guard_%' OR signature LIKE '%documento_legacy_path%' THEN
    CASE WHEN has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('anon',oid,'EXECUTE') THEN 'BLOQUEIO' ELSE 'OK' END
   WHEN signature LIKE '%can_access_documento%' THEN
    CASE WHEN has_function_privilege('authenticated',oid,'EXECUTE') AND has_function_privilege('anon',oid,'EXECUTE') THEN 'OK' ELSE 'BLOQUEIO' END
   ELSE CASE WHEN has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE') THEN 'OK' ELSE 'BLOQUEIO' END END
 FROM function_checks
 UNION ALL SELECT 42,'Owner da função: '||signature,coalesce(pg_get_userbyid(proowner),'ausente'),
  CASE WHEN oid IS NULL OR pg_has_role('anon',proowner,'USAGE') OR pg_has_role('authenticated',proowner,'USAGE') THEN 'BLOQUEIO' ELSE 'OK' END FROM function_checks
 UNION ALL SELECT 43,'Funções privadas: EXECUTE público ou overloads inesperados',count(*)::text||' ocorrência(s)',
  CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private' AND
  (NOT EXISTS(SELECT 1 FROM function_checks f WHERE f.oid=p.oid)
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
 UNION ALL SELECT 50,'Constraint: '||relation||'.'||name,
  CASE WHEN matches THEN definition||'; VALIDATED' ELSE 'Ausente/não validada/definição divergente; comparar catálogo' END,
  CASE WHEN matches THEN 'OK' ELSE 'BLOQUEIO' END FROM constraint_checks
 UNION ALL SELECT 51,'Constraint adicional: '||n.nspname||'.'||c.relname||'.'||k.conname,
  pg_get_constraintdef(k.oid)||'; validada='||k.convalidated::text,'ATENÇÃO'
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE k.contype IN ('f','u','c') AND EXISTS(SELECT 1 FROM expected_constraints e WHERE to_regclass(e.relation)=k.conrelid)
 AND NOT EXISTS(SELECT 1 FROM expected_constraints e WHERE to_regclass(e.relation)=k.conrelid AND e.name=k.conname)
 UNION ALL SELECT 60,'Trigger: '||relation||'.'||name,
  CASE WHEN matches THEN 'Função/tipo/eventos/habilitação conferem' ELSE 'Ausente, desabilitado ou divergente' END,
  CASE WHEN matches THEN 'OK' ELSE 'BLOQUEIO' END FROM trigger_checks
 UNION ALL SELECT 61,'Trigger adicional: '||n.nspname||'.'||c.relname||'.'||t.tgname,
  pg_get_triggerdef(t.oid),'ATENÇÃO' FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND EXISTS(SELECT 1 FROM expected_triggers e WHERE to_regclass(e.relation)=t.tgrelid)
 AND NOT EXISTS(SELECT 1 FROM expected_triggers e WHERE to_regclass(e.relation)=t.tgrelid AND e.name=t.tgname)
 UNION ALL SELECT 70,'View treinamentos: security_invoker=true',
  coalesce(reloptions::text,'sem opções'),CASE WHEN 'security_invoker=true'=ANY(coalesce(reloptions,ARRAY[]::text[])) THEN 'OK' ELSE 'BLOQUEIO' END
 FROM structures WHERE relation='public.vw_dashboard_treinamentos'
 UNION ALL SELECT 71,'View documentos: exposição sem security_invoker',
  'authenticated SELECT='||coalesce(has_table_privilege('authenticated',oid,'SELECT')::text,'NULL')
  ||'; anon SELECT='||coalesce(has_table_privilege('anon',oid,'SELECT')::text,'NULL')||'; options='||coalesce(reloptions::text,'NULL'),
  CASE WHEN oid IS NULL THEN 'BLOQUEIO' WHEN NOT ('security_invoker=true'=ANY(coalesce(reloptions,ARRAY[]::text[])))
   AND (has_table_privilege('authenticated',oid,'SELECT') OR has_table_privilege('anon',oid,'SELECT')) THEN 'BLOQUEIO' ELSE 'OK' END
 FROM structures WHERE relation='public.vw_dashboard_documentos'
 UNION ALL SELECT 80,'Grants de colunas: '||table_name||' '||operation,
  count(*) FILTER(WHERE allowed IS DISTINCT FROM expected)::text||' colunas divergentes (inclui grants herdados/de tabela)',
  CASE WHEN bool_and(allowed IS NOT DISTINCT FROM expected) THEN 'OK' ELSE 'BLOQUEIO' END
 FROM column_grants GROUP BY table_name,operation
 UNION ALL SELECT 81,'Grants perigosos authenticated: '||relation,
  'DELETE='||has_table_privilege('authenticated',oid,'DELETE')::text||'; TRUNCATE='||has_table_privilege('authenticated',oid,'TRUNCATE')::text,
  CASE WHEN has_table_privilege('authenticated',oid,'TRUNCATE') OR
   (relation<>'public.matriz_treinamentos' AND has_table_privilege('authenticated',oid,'DELETE')) OR
   (relation='public.matriz_treinamentos' AND NOT has_table_privilege('authenticated',oid,'DELETE')) THEN 'BLOQUEIO' ELSE 'OK' END
 FROM structures WHERE relation IN ('public.user_profiles','public.colaboradores','public.funcoes','public.setores','public.ambientes','public.treinamento_tipos','public.treinamentos','public.matriz_treinamentos') AND oid IS NOT NULL
 UNION ALL SELECT 86,'Grants adicionais REFERENCES/TRIGGER: '||relation,
  'Privilégios de tabela/coluna não necessários ao CRUD funcional',
  CASE WHEN has_table_privilege('authenticated',oid,'REFERENCES,TRIGGER') OR has_table_privilege('anon',oid,'REFERENCES,TRIGGER')
   OR EXISTS(SELECT 1 FROM pg_attribute a WHERE attrelid=oid AND attnum>0 AND NOT attisdropped AND
    (has_column_privilege('authenticated',oid,a.attnum,'REFERENCES') OR has_column_privilege('anon',oid,a.attnum,'REFERENCES')))
  THEN 'BLOQUEIO' ELSE 'OK' END FROM structures
 WHERE relation IN ('public.user_profiles','public.colaboradores','public.funcoes','public.setores','public.ambientes','public.treinamento_tipos','public.treinamentos','public.matriz_treinamentos') AND oid IS NOT NULL
 UNION ALL SELECT 82,'Grants SELECT authenticated: '||relation,has_table_privilege('authenticated',oid,'SELECT')::text,
  CASE WHEN has_table_privilege('authenticated',oid,'SELECT') THEN 'OK' ELSE 'BLOQUEIO' END
 FROM structures WHERE relation IN ('public.user_profiles','public.colaboradores','public.funcoes','public.setores','public.ambientes','public.treinamento_tipos','public.treinamentos','public.matriz_treinamentos','public.vw_dashboard_treinamentos') AND oid IS NOT NULL
 UNION ALL SELECT 83,'Grants anon: '||relation,
  'Privilégios efetivos de tabela/coluna; SELECT/INSERT/UPDATE/DELETE/TRUNCATE esperados ausentes',
  CASE WHEN has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR EXISTS(
   SELECT 1 FROM pg_attribute a WHERE attrelid=oid AND attnum>0 AND NOT attisdropped
    AND has_column_privilege('anon',oid,a.attnum,'SELECT,INSERT,UPDATE')) THEN 'BLOQUEIO' ELSE 'OK' END
 FROM structures WHERE relation IN ('public.user_profiles','public.colaboradores','public.funcoes','public.setores','public.ambientes','public.treinamento_tipos','public.treinamentos','public.matriz_treinamentos','public.vw_dashboard_treinamentos') AND oid IS NOT NULL
 UNION ALL SELECT 84,'Schema privado: USAGE/CREATE e exposição',
  'authenticated USAGE='||has_schema_privilege('authenticated',oid,'USAGE')::text||'; anon USAGE='||has_schema_privilege('anon',oid,'USAGE')::text,
  CASE WHEN has_schema_privilege('authenticated',oid,'USAGE') AND NOT has_schema_privilege('anon',oid,'USAGE')
   AND NOT has_schema_privilege('authenticated',oid,'CREATE') AND NOT has_schema_privilege('anon',oid,'CREATE') THEN 'OK' ELSE 'BLOQUEIO' END
 FROM pg_namespace WHERE nspname='engmarq_private'
 UNION ALL SELECT 85,'Roles técnicos vs funcionais',rolname||'; superuser='||rolsuper::text||'; bypassrls='||rolbypassrls::text,
  CASE WHEN rolsuper OR rolbypassrls THEN 'BLOQUEIO' ELSE 'OK' END FROM pg_roles WHERE rolname IN ('anon','authenticated')
 UNION ALL SELECT 90,'Documentos: policy legada permite admin/acesso sem perfil ativo',count(*)::text||' policies com branch admin; 020 só protege arquivos/referências',
  CASE WHEN count(*)=0 THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END FROM pg_policies WHERE schemaname='public' AND tablename='documentos'
   AND permissive='PERMISSIVE' AND (coalesce(qual,'') LIKE '%admin%' OR coalesce(with_check,'') LIKE '%admin%')
 UNION ALL SELECT 91,'EPI: policies legadas de acesso operacional admin',count(*)::text||' policies com branch admin fora do endurecimento 015–020',
  CASE WHEN count(*)=0 THEN 'OK' ELSE 'ATENÇÃO' END FROM pg_policies WHERE schemaname='public' AND tablename IN ('fichas_epi','fichas_epi_itens')
   AND (coalesce(qual,'') LIKE '%admin%' OR coalesce(with_check,'') LIKE '%admin%')
 UNION ALL SELECT 92,'Helpers públicos SECURITY DEFINER sem search_path fixo',count(*)::text||' funções; avaliar CREATE no public/temp e ACLs',
  CASE WHEN count(*)=0 THEN 'OK' ELSE 'ATENÇÃO' END FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('get_user_empresa_id','get_user_role') AND p.prosecdef
   AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) x WHERE x LIKE 'search_path=%')
 UNION ALL SELECT 93,'PostgREST: schemas expostos',coalesce(current_setting('pgrst.db_schemas',true),'Não disponível nesta sessão; verificar configuração do projeto'),
  CASE WHEN coalesce(current_setting('pgrst.db_schemas',true),'') LIKE '%engmarq_private%' THEN 'BLOQUEIO' ELSE 'ATENÇÃO' END
 UNION ALL SELECT 94,'Tipos de papel funcionais',string_agg(e.enumlabel,', ' ORDER BY e.enumsortorder)||'; superadmin não é papel distinto no código atual',
  CASE WHEN count(*) FILTER(WHERE e.enumlabel NOT IN ('admin','empresa','gestor','operacional'))=0 THEN 'OK' ELSE 'ATENÇÃO' END
 FROM pg_enum e WHERE e.enumtypid=to_regtype('public.user_role')
 UNION ALL SELECT 95,'Empresas: risco de reativação por gestor via PostgREST',
  'UPDATE(status) authenticated='||coalesce(has_column_privilege('authenticated',oid,'status','UPDATE')::text,'NULL')
  ||'; policy UPDATE legada com gestor e sem guard de status nas migrations auditadas; revisar triggers reais',
  CASE WHEN oid IS NULL THEN 'BLOQUEIO' WHEN has_column_privilege('authenticated',oid,'status','UPDATE') AND EXISTS(
   SELECT 1 FROM pg_policies p WHERE schemaname='public' AND tablename='empresas' AND permissive='PERMISSIVE'
    AND cmd IN ('UPDATE','ALL') AND coalesce(qual,'') LIKE '%gestor%') THEN 'BLOQUEIO' ELSE 'ATENÇÃO' END
 FROM structures WHERE relation='public.empresas'
 UNION ALL SELECT 100,'Histórico migration '||version,
  CASE WHEN readable THEN n::text||' registro(s); execução manual pode não registrar histórico; conferir log e catálogo'
   ELSE 'Indisponível; consultar log do executor' END,
  CASE WHEN NOT readable OR n=0 THEN 'ATENÇÃO' WHEN n=1 THEN 'OK' ELSE 'BLOQUEIO' END FROM history_results
 UNION ALL SELECT ord,label,
  CASE WHEN n IS NULL THEN 'Não verificável: leitura integral/estrutura insuficiente' ELSE n::text||' / esperado '||expected::text END,
  CASE WHEN n IS NULL THEN 'BLOQUEIO' WHEN n=expected THEN 'OK' ELSE severity END FROM data_results
 UNION ALL SELECT 600,'Bucket documentos: configuração final',
  CASE WHEN NOT (SELECT ok FROM ready) THEN 'Leitura não comprovada' ELSE
   xmlserialize(CONTENT query_to_xml($bucket$SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='documentos'$bucket$,true,false,'') AS text) END,
  CASE WHEN NOT (SELECT ok FROM ready) THEN 'BLOQUEIO' ELSE
    CASE WHEN ((xpath('/table/row/n/text()',query_to_xml($q$SELECT count(*) n FROM storage.buckets WHERE id='documentos' AND public=false AND file_size_limit=10485760
      AND cardinality(allowed_mime_types)=7 AND allowed_mime_types @> ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']$q$,true,false,'')))[1])::text::bigint=1
     THEN 'OK' ELSE 'BLOQUEIO' END END
 UNION ALL SELECT 900,'Preservação de identidades/blobs',
  'Contagens e referências não provam identidade dos 12 registros/4 objetos nem bytes; comparar inventário/snapshot e verificar arquivos via Storage autorizado','ATENÇÃO'
 UNION ALL SELECT 901,'Homologação JWT/Storage/CDN e versões implantadas',
  'Este SQL não chama API, gera signed URL ou testa JWT real. Homologar empresa/gestor/operacional/admin/anon; confirmar frontend/backend implantados','ATENÇÃO'
 UNION ALL SELECT 902,'Referências futuras de certificados',
  '018/API validam formato/tenant, mas não existência do objeto. Consulta atual detecta dangling; não impede novos registros inconsistentes','ATENÇÃO'
 UNION ALL SELECT 903,'Objetos gerais referenciados: UPDATE/DELETE',
  '020 permite UPDATE/DELETE fora de certificados para empresa/gestor; clientes diretos podem invalidar referências. Não executar remoção nesta auditoria','ATENÇÃO'
 UNION ALL SELECT 904,'Storage: inventário de identidades dos objetos',
  CASE WHEN NOT (SELECT ok FROM ready) THEN 'Não verificável: leitura integral insuficiente'
   ELSE xmlserialize(CONTENT query_to_xml($inventory$SELECT id,name,metadata->>'mimetype' mimetype,metadata->>'size' size
    FROM storage.objects WHERE bucket_id='documentos' ORDER BY name$inventory$,true,false,'') AS text) END,
  CASE WHEN (SELECT ok FROM ready) THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END
),
totals AS (SELECT count(*) FILTER(WHERE status='BLOQUEIO') bloqueios,count(*) FILTER(WHERE status='ATENÇÃO') atencoes FROM report),
final_report AS (
 SELECT * FROM report
 UNION ALL SELECT 10000,'TOTAL_BLOQUEIOS',bloqueios::text,CASE WHEN bloqueios=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM totals
 UNION ALL SELECT 10001,'TOTAL_ATENCOES',atencoes::text,CASE WHEN atencoes=0 THEN 'OK' ELSE 'ATENÇÃO' END FROM totals
)
SELECT label AS "CHECK",result AS "RESULTADO",status AS "STATUS" FROM final_report ORDER BY ord,label;
COMMIT;
