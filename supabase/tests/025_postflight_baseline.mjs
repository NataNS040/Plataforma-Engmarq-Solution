// Offline only. Real pre-025 evidence must come from the corresponding remote preflight.
import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {preservationTables} from './025-catalog.mjs'
export function withBaseline(sql,rows){
 let payload=rows
 if(Array.isArray(payload)){
  if(payload.length!==1||!Object.hasOwn(payload[0],'BASELINE_PRE025'))throw Error('Complete PRE025 version-2 export required; legacy fingerprints alone are insufficient')
  payload=payload[0].BASELINE_PRE025
 }
 if(typeof payload==='string')payload=JSON.parse(payload)
 if(payload?.version!==2||payload.migration_sha256!=='6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5'||payload.approved!==true||payload.pre025!==true||payload.blocks!==0)throw Error('Invalid/unapproved PRE025 package')
 if(!Array.isArray(payload.checks)||!payload.checks.length||payload.checks.some(r=>r.STATUS==='BLOQUEIO')||!payload.snapshots||!Object.keys(payload.snapshots).length)throw Error('Incomplete PRE025 evidence')
 const entries=payload.legacy
 if(!Array.isArray(entries))throw Error('Missing legacy preservation manifest')
 for(const t of preservationTables){
  const found=entries.filter(r=>r.CHECK==='Preservação: '+t)
  if(found.length!==1)throw Error('Missing/duplicate baseline: '+t)
  if(!/^(ausente|[a-f0-9]{32})$/.test(found[0].RESULTADO))throw Error('Invalid baseline: '+t)
 }
 if(entries.length!==preservationTables.length)throw Error('Unexpected preservation checks')
 const manifests=payload.checks.filter(r=>r.CHECK.startsWith('Manifesto operacional: '))
 if(!manifests.length)throw Error('Missing complete relation inventory')
 for(const r of manifests){
  const key=r.CHECK.slice('Manifesto operacional: '.length)
  if(!payload.snapshots[key])throw Error('Snapshot omitted from relation inventory: '+key)
 }
 for(const [key,s] of Object.entries(payload.snapshots)){
  if(!/^(public|engmarq_private|storage)\.[A-Za-z_][A-Za-z_0-9]*$/.test(key)||!Array.isArray(s.columns)||!s.columns.length||new Set(s.columns).size!==s.columns.length||!Array.isArray(s.keys)||s.keys.some(k=>!s.columns.includes(k))||!Number.isSafeInteger(s.count)||s.count<0||!/^[a-f0-9]{32}$/.test(s.fingerprint)||!s.rows||Object.values(s.rows).some(h=>!/^[a-f0-9]{32}$/.test(h)))throw Error('Invalid snapshot: '+key)
  if(s.keys.length&&Object.keys(s.rows).length!==s.count)throw Error('Truncated snapshot rows: '+key)
 }
 for(const key of ['public.empresa_comercial','public.empresa_features','public.empresa_limites','public.empresa_uso','public.auditoria_comercial'])if(!payload.snapshots[key])throw Error('Missing commercial snapshot: '+key)
 for(const t of preservationTables){
  const key=t.includes('.')?t:'public.'+t
  const row=entries.find(r=>r.CHECK==='Preservação: '+t)
  if(row.RESULTADO==='ausente')continue
  const s=payload.snapshots[key]
  if(!s||!Array.isArray(s.columns)||!s.columns.length||!Array.isArray(s.keys)||!Number.isSafeInteger(s.count)||s.count<0||!/^[a-f0-9]{32}$/.test(s.fingerprint)||!s.rows)throw Error('Missing/invalid snapshot: '+key)
 }
 const companies=payload.checks.filter(r=>r.CHECK.startsWith('Previsão exata: '))
 const companyCount=payload.snapshots['public.empresas'].count
 if(companies.length!==companyCount||new Set(companies.map(r=>r.DETALHES?.empresa_id)).size!==companyCount)throw Error('Incomplete/duplicate company eligibility')
 if(!sql.includes('-- BEGIN 025 BASELINE JSON'))throw Error('Missing baseline markers')
 return sql.replace(/(-- BEGIN 025 BASELINE JSON\s*)[\s\S]*?(\s*-- END 025 BASELINE JSON)/,
  (_,a,b)=>a+"convert_from(decode('"+Buffer.from(JSON.stringify(payload),'utf8').toString('base64')+"','base64'),'UTF8')::jsonb"+b)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,input,out]=process.argv
 if(!input||!out)throw Error('Usage: node 025_postflight_baseline.mjs PRE025.json OUTPUT.sql')
 await writeFile(out,withBaseline(await readFile(new URL('025_fundacao_postflight_readonly.sql',import.meta.url),'utf8'),JSON.parse(await readFile(input,'utf8'))),{flag:'wx'})
}
