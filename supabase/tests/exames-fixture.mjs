import {fixture,migrate,id} from './remediation-fixture.mjs'
export {migrate,id}
export async function examesFixture(post=false) {
 const db=await fixture()
 await migrate(db,'021_documentos_empresas_security.sql')
 // Approved shape, synthetic values: 12 documents, 4 ASOs, 2 other employee documents.
 for(let n=1;n<=4;n++) {
  await db.query(`UPDATE documentos SET tipo_id=(SELECT id FROM documento_tipos WHERE nome='ASO'),
   colaborador_id=$1,subtipo_exame=$2,emissao='2026-01-01',vencimento='2027-01-01',observacoes='Apto',
   exames_realizados=$3 WHERE id=$4`,[id(n===4?202:201),n===4?'periodico':'admissional',n===4?[]:['Audiometria'],id(900+n)])
 }
 // Only ASO 1 has a file. Other objects remain referenced by ordinary documents.
 for(let n=2;n<=4;n++) {
  const row=(await db.query('SELECT arquivo_path,arquivo_url,empresa_id FROM documentos WHERE id=$1',[id(900+n)])).rows[0]
  await db.query('UPDATE documentos SET empresa_id=$1,arquivo_path=$2,arquivo_url=$3 WHERE id=$4',
   [row.empresa_id,row.arquivo_path,row.arquivo_url,id(903+n)])
  await db.query('UPDATE documentos SET arquivo_path=NULL,arquivo_url=NULL WHERE id=$1',[id(900+n)])
 }
 await db.query('UPDATE documentos SET colaborador_id=$1 WHERE id IN ($2,$3)',[id(201),id(908),id(909)])
 if(post)await migrate(db,'023_exames_aso.sql')
 return db
}
