import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { seedTenantBase } from './tenant-fixture.mjs'
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
export const load=async name=>(await readFile(new URL(name,import.meta.url),'utf8')).replace(/^\uFEFF/,'')
export const migrate=async(db,name)=>db.exec(await load(`../migrations/${name}`))
export async function fixture({legacyEpi=false}={}) {
 const db=new PGlite()
 await seedTenantBase(db,name=>migrate(db,name),id)
 await migrate(db,'017_catalogos_tenant_security.sql')
 await db.exec(`ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO authenticated,anon;
  GRANT ALL ON storage.objects TO authenticated,anon;
  UPDATE storage.buckets SET public=true WHERE id='documentos';`)
 for(let n=1;n<=12;n++) {
  const company=id(n===4?102:101),path=`${company}/synthetic${n}.pdf`
  if(n<=4)await db.query(`INSERT INTO storage.objects VALUES($1,'documentos',$2,'{"mimetype":"application/pdf","size":9}')`,[id(800+n),path])
  await db.query(`INSERT INTO documentos(id,empresa_id,tipo_id,titulo,arquivo_url) VALUES($1,$2,
   (SELECT id FROM documento_tipos WHERE nome='PGR'),'Synthetic',$3)`,[id(900+n),company,
   n<=4?`https://kkjckayiqvlqpdjyoxyv.supabase.co/storage/v1/object/public/documentos/${path}`:null])
 }
 await migrate(db,'019_documentos_path_compat.sql')
 await migrate(db,'020_documentos_private_storage.sql')
 await migrate(db,'018_treinamentos_tenant_security.sql')
 for(const company of [101,102,103]) {
  await db.query(`INSERT INTO fichas_epi(id,empresa_id,colaborador_id,data_entrega) VALUES($1,$2,$3,'2026-01-01')`,[id(1100+company),id(company),id(company+100)])
  await db.query(`INSERT INTO fichas_epi_itens(id,empresa_id,ficha_epi_id,equipamento) VALUES($1,$2,$3,'Synthetic EPI')`,[id(1200+company),id(company),id(1100+company)])
  await db.query(`INSERT INTO storage.objects VALUES($1,'assinaturas',$2,'{"mimetype":"image/jpeg","size":9}')`,[id(1300+company),`${id(company)}/signature.jpg`])
 }
 if(!legacyEpi) await db.exec(`DROP TABLE fichas_epi_itens; DROP TABLE fichas_epi;
  DROP POLICY assinaturas_storage_insert ON storage.objects;
  DROP POLICY assinaturas_storage_select ON storage.objects;
  DELETE FROM storage.objects WHERE bucket_id='assinaturas';
  DELETE FROM storage.buckets WHERE id='assinaturas';`)
 return db
}
export async function actor(db,n,run,role='authenticated') {
 await db.exec(`BEGIN; SET LOCAL ROLE ${role}`)
 try {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(n)])
  return await run()
 } finally {await db.exec('ROLLBACK')}
}
export async function dataSnapshot(db) {
 return Promise.all(['empresas','user_profiles','colaboradores','documentos','treinamentos','fichas_epi','fichas_epi_itens',
  'funcoes','setores','ambientes','matriz_treinamentos','documento_tipos','treinamento_tipos','exames_catalogo','storage.objects','storage.buckets']
  .map(async t=>(await db.query('SELECT to_regclass($1) relation',[t])).rows[0].relation
   ? (await db.query(`SELECT * FROM ${t} ORDER BY id`)).rows : null))
}
