// Offline only: embed real exported preflight rows in a separate manual SQL artifact.
import {readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {requiredPreservationChecks} from './024_compare_preservation.mjs'
export function withBaseline(sql,rows) {
 if(!Array.isArray(rows))throw Error('Expected exported preflight JSON array')
 const fingerprints=rows.flat(Infinity).filter(r=>r.CHECK?.startsWith('Preservação:')).map(({CHECK,RESULTADO})=>({CHECK,RESULTADO}))
 for(const check of requiredPreservationChecks)if(fingerprints.filter(r=>r.CHECK===check).length!==1)throw Error('Missing/duplicate baseline: '+check)
 if(fingerprints.some(r=>typeof r.RESULTADO!=='string'))throw Error('Invalid baseline fingerprint')
 return sql.replace(/(-- BEGIN PREFLIGHT BASELINE JSON\s*)[\s\S]*?(\s*-- END PREFLIGHT BASELINE JSON)/,
  (_,a,b)=>a+"'"+JSON.stringify(fingerprints).replaceAll("'","''")+"'::jsonb"+b)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [, ,preFile,outFile]=process.argv
 if(!preFile||!outFile)throw Error('Usage: node 024_postflight_baseline.mjs PREFLIGHT.json OUTPUT.sql')
 const sql=await readFile(new URL('024_fundacao_postflight_readonly.sql',import.meta.url),'utf8')
 await writeFile(outFile,withBaseline(sql,JSON.parse(await readFile(preFile,'utf8'))),{flag:'wx'})
}
