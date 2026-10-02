-- Logos only. Run the COMPLETE file after the read-only 022 preflight.
-- No replay of 013/021, backfill, Storage ALTER TABLE, triggers or ACL changes.
-- Trusted SQL Editor role must bypass RLS; browser operations use authenticated.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE storage.buckets, storage.objects, public.empresas IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE installed boolean; r record;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION '022 requires a trusted migration executor with RLS bypass';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
 OR to_regprocedure('engmarq_private.can_access_empresa(uuid,boolean,boolean)') IS NULL
 OR EXISTS (SELECT 1 FROM pg_roles client CROSS JOIN pg_roles privileged
   WHERE client.rolname IN ('anon','authenticated') AND
   (privileged.rolsuper OR privileged.rolbypassrls) AND pg_has_role(client.oid,privileged.oid,'MEMBER'))
 OR EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND
   (pg_has_role('anon',relowner,'MEMBER') OR pg_has_role('authenticated',relowner,'MEMBER')))
 OR NOT has_schema_privilege('authenticated','storage','USAGE')
 OR NOT has_schema_privilege('authenticated','engmarq_private','USAGE')
 OR NOT has_table_privilege('authenticated','storage.objects','SELECT')
 OR NOT has_table_privilege('authenticated','storage.objects','INSERT')
 OR NOT has_table_privilege('authenticated','storage.objects','UPDATE') THEN
   RAISE EXCEPTION '022 requires completed 021, Storage RLS and existing authenticated Storage grants; do not change Storage ownership';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='engmarq_private' AND
   (has_schema_privilege('authenticated',oid,'CREATE') OR has_schema_privilege('anon',oid,'CREATE'))) THEN
   RAISE EXCEPTION '022 private schema is writable by an untrusted role';
 END IF;
 -- All of these objects must be absent on first apply, or the exact known 022
 -- contract on rerun. Unknown drift is never silently overwritten.
 installed := to_regprocedure('engmarq_private.can_access_logo(text,text,jsonb)') IS NOT NULL;
 IF installed THEN
   -- GENERATED_CONTRACT_CHECK
   IF EXISTS (SELECT 1 FROM (VALUES ('engmarq_private.can_access_logo(text,text,jsonb)','caa03ead77e4f7dde459d656f4905be8'),
 ('engmarq_private.logo_update_identity(uuid,text,text)','928ef86c18f5def4f9ad6aa2632736ae')) e(signature,source_hash) WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
 WHERE p.oid=to_regprocedure(e.signature) AND p.prosecdef AND p.provolatile='s'
 AND p.prorettype='boolean'::regtype AND p.prokind='f'
 AND NOT p.proisstrict AND NOT p.proleakproof
 AND CASE WHEN e.signature LIKE '%can_access_logo%' THEN
   p.pronargdefaults=1 AND pg_get_expr(p.proargdefaults,0)='NULL::jsonb'
   ELSE p.pronargdefaults=0 END
 AND p.prolang=(SELECT oid FROM pg_language WHERE lanname=CASE WHEN e.signature LIKE '%can_access_logo%' THEN 'plpgsql' ELSE 'sql' END)
 AND p.proconfig=ARRAY['search_path=""'] AND (owner.rolsuper OR owner.rolbypassrls)
 AND NOT pg_has_role('authenticated',p.proowner,'MEMBER') AND NOT pg_has_role('anon',p.proowner,'MEMBER')
 AND md5(replace(p.prosrc,E'\r\n',E'\n'))=e.source_hash
 AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE a.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='anon'),
 (SELECT oid FROM pg_roles WHERE rolname='authenticated')) OR (a.grantee<>p.proowner AND a.is_grantable))))
 OR EXISTS (SELECT 1 FROM (VALUES ('logos_storage_insert','b168e90187e03a16a869edb13bf3485d'),
 ('logos_storage_select','493597c9c67e68c0c631ce09e649831e'),
 ('logos_storage_update','3dd115c4b8e1ed18aef1f2d0172f69b0'),
 ('logos_tenant_delete_guard','f3a9dd28a5a72e2cd7772d60f0a838a8'),
 ('logos_tenant_insert_guard','7c8e2951e0aeb30c5943dff9a60543dc'),
 ('logos_tenant_select_guard','bb0cbbbdc39d5fe97e171311035238cc'),
 ('logos_tenant_update_guard','9612dca2ef655cb8c3f52f04fc6fa308')) e(policyname,fingerprint) WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='storage' AND p.tablename='objects'
 AND p.policyname=e.policyname AND md5(p.permissive||p.roles::text||p.cmd||coalesce(p.qual,'')||coalesce(p.with_check,''))=e.fingerprint))
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND policyname LIKE 'logos_%' AND policyname NOT IN ('logos_storage_insert','logos_storage_select','logos_storage_update','logos_tenant_delete_guard','logos_tenant_insert_guard','logos_tenant_select_guard','logos_tenant_update_guard'))
 OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='engmarq_private' AND p.proname IN ('can_access_logo','logo_update_identity'))<>2 THEN
 RAISE EXCEPTION '022 known contract drift: review helpers, ACLs and policies before rerun';
 END IF;
 ELSE
   IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='logos' OR name='logos')
   OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='logos')
   OR EXISTS (SELECT 1 FROM public.empresas WHERE logo_url IS NOT NULL)
   OR (SELECT count(*) FROM public.empresas)<>3
   OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'logos_%')
   OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='engmarq_private' AND p.proname IN ('can_access_logo','logo_update_identity')) THEN
     RAISE EXCEPTION '022 inventory changed: expected no logos bucket/policies/helpers/objects/references and exactly 3 companies. Review fresh read-only inventory';
   END IF;
 END IF;
 IF installed AND NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='logos' AND name='logos'
   AND NOT public AND file_size_limit=2097152 AND
   allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp']) THEN
   RAISE EXCEPTION '022 existing bucket drift; do not silently change publicity or data';
 END IF;
 IF installed AND (EXISTS (SELECT 1 FROM storage.objects o WHERE bucket_id='logos' AND
   (name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo\.(png|jpg|webp)$'
    OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id::text=split_part(o.name,'/',1))))
 OR EXISTS (SELECT 1 FROM public.empresas e WHERE logo_url IS NOT NULL AND
   NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='logos'
     AND e.logo_url='logos/'||o.name AND split_part(o.name,'/',1)=e.id::text))) THEN
   RAISE EXCEPTION '022 existing logos data drift; review paths and references';
 END IF;
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('logos','logos',false,2097152,ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION engmarq_private.can_access_logo(
 object_path text, operation text, object_metadata jsonb DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE extension text; mime text; bytes text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated'
   OR auth.uid() IS NULL OR operation IS NULL OR operation NOT IN ('read','insert','update')
   OR object_path IS NULL OR object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo\.(png|jpg|webp)$' THEN
   RETURN false;
 END IF;
 IF operation<>'read' THEN
   extension := split_part(object_path,'.',2);
   mime := object_metadata->>'mimetype';
   bytes := object_metadata->>'size';
   -- Storage may first create a reservation with NULL metadata. Bucket HTTP
   -- restrictions enforce MIME/size before accepting bytes. Also reject bad
   -- metadata when supplied via SQL/REST; never claim to inspect binary magic.
   IF mime IS NOT NULL AND mime IS DISTINCT FROM (CASE extension
     WHEN 'png' THEN 'image/png' WHEN 'jpg' THEN 'image/jpeg' WHEN 'webp' THEN 'image/webp' END) THEN
     RETURN false;
   END IF;
   IF bytes IS NOT NULL THEN
     IF bytes !~ '^[0-9]{1,12}$' THEN RETURN false; END IF;
     IF bytes::numeric>2097152 THEN RETURN false; END IF;
   END IF;
 END IF;
 RETURN EXISTS (
   SELECT 1 FROM public.user_profiles p JOIN public.empresas e ON e.id=p.empresa_id
   WHERE p.id=auth.uid() AND p.active AND e.status='ativa'
     AND p.empresa_id::text=split_part(object_path,'/',1)
     AND (p.role IN ('gestor','empresa') OR (operation='read' AND p.role='operacional'))
 );
END $$;

-- STABLE reads the statement snapshot (old tuple) as the trusted owner. It
-- binds UPDATE's target to the same existing id/bucket/path, without a trigger
-- on Supabase-owned storage.objects. Also prevents entering/leaving logos via
-- broad policies on other buckets. Non-logo objects retain their own policies.
CREATE OR REPLACE FUNCTION engmarq_private.logo_update_identity(
 object_id uuid, target_bucket text, target_path text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM storage.objects o WHERE o.id=object_id AND
   CASE WHEN o.bucket_id='logos' OR target_bucket='logos' THEN
     o.bucket_id IS NOT DISTINCT FROM target_bucket AND o.name IS NOT DISTINCT FROM target_path
     AND engmarq_private.can_access_logo(target_path,'update')
   ELSE true END
 );
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_access_logo(text,text,jsonb),
 engmarq_private.logo_update_identity(uuid,text,text) FROM PUBLIC,anon,authenticated;
-- PUBLIC guards must be callable by anon too; helpers return false for logos
-- outside authenticated. EXECUTE is not a functional upload permission.
GRANT EXECUTE ON FUNCTION engmarq_private.can_access_logo(text,text,jsonb),
 engmarq_private.logo_update_identity(uuid,text,text) TO authenticated,anon;

DROP POLICY IF EXISTS logos_storage_select ON storage.objects;
DROP POLICY IF EXISTS logos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS logos_storage_update ON storage.objects;
DROP POLICY IF EXISTS logos_tenant_select_guard ON storage.objects;
DROP POLICY IF EXISTS logos_tenant_insert_guard ON storage.objects;
DROP POLICY IF EXISTS logos_tenant_update_guard ON storage.objects;
DROP POLICY IF EXISTS logos_tenant_delete_guard ON storage.objects;
CREATE POLICY logos_storage_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='logos' AND engmarq_private.can_access_logo(name,'read'));
CREATE POLICY logos_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='logos' AND engmarq_private.can_access_logo(name,'insert',metadata));
CREATE POLICY logos_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='logos' AND engmarq_private.can_access_logo(name,'update'))
WITH CHECK (bucket_id='logos' AND engmarq_private.can_access_logo(name,'update',metadata)
 AND engmarq_private.logo_update_identity(id,bucket_id,name));
CREATE POLICY logos_tenant_select_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
USING (bucket_id<>'logos' OR engmarq_private.can_access_logo(name,'read'));
CREATE POLICY logos_tenant_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
WITH CHECK (bucket_id<>'logos' OR engmarq_private.can_access_logo(name,'insert',metadata));
CREATE POLICY logos_tenant_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
USING (bucket_id<>'logos' OR engmarq_private.can_access_logo(name,'update'))
WITH CHECK ((bucket_id<>'logos' OR engmarq_private.can_access_logo(name,'update',metadata))
 AND engmarq_private.logo_update_identity(id,bucket_id,name));
-- Product has no logo delete flow. Restrictive denial survives broad policies.
CREATE POLICY logos_tenant_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
USING (bucket_id<>'logos');
COMMIT;
