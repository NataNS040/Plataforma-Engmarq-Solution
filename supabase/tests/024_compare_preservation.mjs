// Compare exported pre/post result rows offline. Never queries any database.
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
export const requiredPreservationChecks=['empresas','user_profiles','colaboradores','documentos','treinamentos','funcoes','setores',
 'ambientes','matriz_treinamentos','documento_tipos','treinamento_tipos','exames_catalogo','storage.objects','storage.buckets',
 'fichas_epi','fichas_epi_itens','catálogo opcional EPI/Assinaturas'].map(name=>'Preservação: '+name)
export function comparePreservation(pre,post) {
 const collect=rows=>new Map(rows.filter(r=>r.CHECK?.startsWith('Preservação:')).map(r=>[r.CHECK,r.RESULTADO]))
 const a=collect(pre),b=collect(post)
 const missing=requiredPreservationChecks.filter(key=>!a.has(key)||!b.has(key))
 if(missing.length)return [{CHECK:'Preservação: exportação incompleta',RESULTADO:'faltam result sets de pre/post: '+missing.join(', '),STATUS:'BLOQUEIO'}]
 return [...new Set([...a.keys(),...b.keys()])].sort().map(key=>({CHECK:key,
  RESULTADO:!a.has(key)||!b.has(key)?'objeto/result set apareceu ou desapareceu':a.get(key)===b.get(key)?'preservado (inclui ausente → ausente)':'fingerprint/presença divergente',
  STATUS:a.has(key)&&b.has(key)&&a.get(key)===b.get(key)?'OK':'BLOQUEIO'}))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [, ,preFile,postFile]=process.argv
 if(!preFile||!postFile)throw new Error('Usage: node 024_compare_preservation.mjs PRE.json POST.json (arrays of all exported rows)')
 const rows=await Promise.all([preFile,postFile].map(async file=>{
  const data=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(data))throw new Error('Expected JSON array of result rows');return data.flat(Infinity)
 }))
 const result=comparePreservation(...rows);console.log(JSON.stringify(result,null,2))
 if(result.some(r=>r.STATUS==='BLOQUEIO'))process.exitCode=1
}
