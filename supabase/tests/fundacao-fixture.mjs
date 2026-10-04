import {fixture,migrate,id,load,actor,dataSnapshot} from './remediation-fixture.mjs'
export {migrate,id,load,actor,dataSnapshot}
export const cnpjs=['11.222.333/0001-81','04.252.011/0001-10','00.000.000/E08G-12']
export async function fundacaoFixture(post=false,{legacyEpi=true}={}) {
 const db=await fixture({legacyEpi})
 // 024 remote baseline: 001 public helpers retain legacy service_role EXECUTE.
 // 021 CREATE OR REPLACE preserves ACLs and revokes only PUBLIC/anon.
 // Model these two existing grants only; do not broaden private-function ACLs.
 await db.exec('GRANT EXECUTE ON FUNCTION public.get_user_empresa_id(),public.get_user_role() TO service_role')
 await migrate(db,'021_documentos_empresas_security.sql')
 // Same confirmed 022 starting shape; preserve EPI/assinaturas deliberately.
 await db.exec(`DROP POLICY logos_storage_select ON storage.objects;
 DROP POLICY logos_storage_insert ON storage.objects;
 DROP POLICY logos_storage_update ON storage.objects;
 DELETE FROM storage.buckets WHERE id='logos';
 ALTER TABLE storage.objects ADD CONSTRAINT logos_fixture_bucket_name UNIQUE(bucket_id,name);
 GRANT ALL ON storage.objects TO service_role;`)
 await migrate(db,'022_logos_tenant_storage.sql')
 await migrate(db,'023_exames_aso.sql')
 for(let n=0;n<3;n++)await db.query('UPDATE empresas SET cnpj=$1 WHERE id=$2',[cnpjs[n],id(101+n)])
 if(post)await migrate(db,'024_fundacao_comercial.sql')
 return db
}
