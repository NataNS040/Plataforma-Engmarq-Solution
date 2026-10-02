import {fixture,migrate} from './remediation-fixture.mjs'
export async function logosFixture({apply=true}={}) {
 const db=await fixture()
 await migrate(db,'021_documentos_empresas_security.sql')
 // Model confirmed remote inventory; 013 is not reapplied by 022.
 await db.exec(`DROP POLICY logos_storage_select ON storage.objects;
 DROP POLICY logos_storage_insert ON storage.objects;
 DROP POLICY logos_storage_update ON storage.objects;
 DELETE FROM storage.buckets WHERE id='logos';
 ALTER TABLE storage.objects ADD CONSTRAINT logos_fixture_bucket_name UNIQUE(bucket_id,name);
 GRANT ALL ON storage.objects TO service_role;`)
 if(apply) await migrate(db,'022_logos_tenant_storage.sql')
 return db
}
