-- Additional evidence only; no remote execution performed by this task.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT p.oid::regprocedure::text AS function,pg_get_userbyid(p.proowner) AS owner,
 md5(replace(p.prosrc,E'\r\n',E'\n')) AS body_hash,p.proacl,p.proconfig,p.prosecdef,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role
FROM pg_proc p WHERE p.oid IN
 (to_regprocedure('public.get_user_empresa_id()'),to_regprocedure('public.get_user_role()'));
SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname,d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclobjtype='f';
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE coalesce(qual,'')||coalesce(with_check,'') ~ 'get_user_(empresa_id|role)';
-- Text-body scan supplements pg_depend: SQL string bodies need not record
-- all called functions as catalog dependencies. Review false-positive comments.
SELECT p.oid::regprocedure::text AS consumer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND
 p.prosrc ~ 'get_user_(empresa_id|role)' ORDER BY 1;
SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS consumer,d.deptype
FROM pg_depend d WHERE d.refclassid='pg_proc'::regclass AND d.refobjid IN
 (to_regprocedure('public.get_user_empresa_id()'),to_regprocedure('public.get_user_role()')) ORDER BY 1;
SELECT rolname,rolsuper,rolbypassrls,rolinherit FROM pg_roles
WHERE rolname IN ('service_role','authenticated','anon');
COMMIT;
