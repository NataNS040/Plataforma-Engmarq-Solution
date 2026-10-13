-- Baseline only: no personal identifiers, writes or external effects.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT current_database() database_name,current_user executor,current_setting('transaction_read_only') read_only;
SELECT count(*) companies,count(*) FILTER(WHERE status='ativa') active_companies FROM public.empresas;
SELECT role,active,count(*) profiles FROM public.user_profiles GROUP BY role,active ORDER BY role,active;
SELECT count(*) auth_users FROM auth.users;
SELECT max_colaboradores_ativos,ilimitado,count(*) companies FROM public.empresa_limites GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) usage_mismatches FROM public.empresa_uso u
WHERE u.colaboradores_ativos<>(SELECT count(*) FROM public.colaboradores c WHERE c.empresa_id=u.empresa_id AND c.active);
SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal;
SELECT b.id,b.public,count(o.id) objects FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id GROUP BY b.id,b.public ORDER BY b.id;
SELECT to_regclass('engmarq_private.public_signup_control') signup_gate,to_regprocedure('public.autorizar_auth_interno(uuid,uuid,text)') admission_rpc;
ROLLBACK;
