// Local-only manifest generation. No env, credentials or network access.
import { mkdir,writeFile } from 'node:fs/promises'
import { fixture,migrate } from './remediation-fixture.mjs'
const db=await fixture()
try {
 await migrate(db,'021_documentos_empresas_security.sql')
 const rows=async sql=>(await db.query(sql)).rows
 const tables="'empresas','documentos','user_profiles','colaboradores','funcoes','setores','ambientes','treinamentos','matriz_treinamentos','treinamento_tipos','fichas_epi','fichas_epi_itens'"
 const manifest={
  policies:await rows(`SELECT schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check FROM pg_policies
   WHERE (schemaname='public' AND tablename IN (${tables})) OR
    (schemaname='storage' AND tablename='objects' AND policyname NOT LIKE 'logos_%') ORDER BY schemaname,tablename,policyname`),
  functions:await rows(`SELECT p.oid::regprocedure::text signature,p.prorettype::regtype::text result_type,p.prosecdef,p.provolatile::text,p.proconfig::text,
   md5(replace(p.prosrc,E'\\r\\n',E'\\n')) source_hash,pg_get_functiondef(p.oid) definition
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='engmarq_private'
   OR (n.nspname='public' AND p.proname IN ('get_user_empresa_id','get_user_role')) ORDER BY signature`),
  triggers:await rows(`SELECT t.tgrelid::regclass::text relation,t.tgname,t.tgtype::int,t.tgenabled::text,t.tgfoid::regprocedure::text function_name
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN (${tables}) AND NOT t.tgisinternal ORDER BY relation,tgname`),
  constraints:await rows(`SELECT k.conrelid::regclass::text relation,k.conname,pg_get_constraintdef(k.oid) definition,k.convalidated
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN (${tables}) AND k.contype IN ('f','u','c') ORDER BY relation,conname`),
  grants:await rows(`SELECT c.relname relation,r.role,
    array_to_string(ARRAY(SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      WHERE has_table_privilege(r.role,c.oid,p) ORDER BY p),',') table_privileges,
    array_to_string(ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege(r.role,c.oid,a.attname,'INSERT') ORDER BY a.attname),',') insert_columns,
    array_to_string(ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege(r.role,c.oid,a.attname,'UPDATE') ORDER BY a.attname),',') update_columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES('authenticated'),('anon')) r(role)
    WHERE n.nspname='public' AND c.relname IN (${tables}) ORDER BY c.relname,r.role`),
 }
 const directory=new URL('../../docs/audits/2026-10-02/',import.meta.url)
 await mkdir(directory,{recursive:true})
 await writeFile(new URL('expected-021-catalog.json',directory),JSON.stringify(manifest,null,2)+'\n')
 console.log('021 expected catalog generated from actual migrations in memory')
}finally{await db.close()}
