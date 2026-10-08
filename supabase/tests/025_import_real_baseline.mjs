// Offline import. Never connects to PostgreSQL or Supabase.
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {pathToFileURL,fileURLToPath} from 'node:url'
import {withBaseline} from './025_postflight_baseline.mjs'
export const sha256=b=>createHash('sha256').update(b).digest('hex')
export async function saveExclusive(path,bytes){
 await mkdir(dirname(path),{recursive:true})
 try{await writeFile(path,bytes,{flag:'wx'});return 'created'}catch(e){
  if(e.code!=='EEXIST')throw e
  const old=await readFile(path)
  if(sha256(old)!==sha256(bytes))throw Error('Different SHA-256; refusing overwrite: '+path)
  return 'unchanged'
 }
}
const audit=fileURLToPath(new URL('../../docs/audits/2026-10-08/',import.meta.url))
export async function importRealBaseline(input,{destination=resolve(audit,'PRE025_REAL.json'),postflight=resolve(audit,'025_postflight_REAL_readonly.sql')}={}){
 let bytes
 if(Buffer.isBuffer(input))bytes=input
 else try{bytes=await readFile(input)}catch(e){throw Error('Cannot read baseline file: '+input+' ('+e.code+')')}
 let rows
 try{if(!bytes.toString('utf8').trim())throw Error('empty');rows=JSON.parse(bytes.toString('utf8'))}catch(e){throw Error('Empty, invalid or truncated JSON: '+e.message)}
 if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.BASELINE_PRE025)throw Error('Expected one-element array containing BASELINE_PRE025')
 const p=typeof rows[0].BASELINE_PRE025==='string'?JSON.parse(rows[0].BASELINE_PRE025):rows[0].BASELINE_PRE025
 const totals={OK:0,'ATENÇÃO':0,BLOQUEIO:0},categories={}
 for(const r of p.checks??[]){
  if(!Object.hasOwn(totals,r.STATUS)||typeof r.CHECK!=='string'||!r.CHECK||typeof r.CATEGORIA!=='string'||!r.CATEGORIA||!Object.hasOwn(r,'RESULTADO')||!Object.hasOwn(r,'DETALHES'))throw Error('Invalid check/status/category')
  totals[r.STATUS]++;categories[r.CATEGORIA]=(categories[r.CATEGORIA]??0)+1
 }
 if(p.blocks!==totals.BLOQUEIO)throw Error('Declared blocks disagree with check records')
 if(new Set((p.checks??[]).map(r=>JSON.stringify([r.CATEGORIA,r.CHECK]))).size!==p.checks?.length)throw Error('Duplicate category/check records')
 const employees=p.checks?.find(r=>r.CHECK==='Colaboradores ativos/inativos/total')
 if(!employees||!['ativos','inativos','estado_nulo'].every(k=>Number.isSafeInteger(employees.DETALHES[k])&&employees.DETALHES[k]>=0)||Number(employees.RESULTADO)!==Object.values(employees.DETALHES).filter(Number.isInteger).reduce((a,b)=>a+b,0)||Number(employees.RESULTADO)!==p.snapshots?.['public.colaboradores']?.count)throw Error('Inconsistent employee counts')
 const template=await readFile(new URL('025_fundacao_postflight_readonly.sql',import.meta.url),'utf8')
 const sql=withBaseline(template,rows)
 const baselineState=await saveExclusive(destination,bytes)
 const postflightState=await saveExclusive(postflight,Buffer.from(sql))
 return {destination,bytes:bytes.length,sha256:sha256(bytes),baselineState,postflight,postflightState,postflight_sha256:sha256(sql),totals,categories,employees:employees.DETALHES,snapshots:Object.keys(p.snapshots).length,captured_at:p.captured_at}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const input=process.argv[2]
  if(!input)throw Error('Usage: npm run import:025:baseline -- INPUT.json (or - for stdin; run from repository root with --prefix supabase/tests)')
  let source=input
  if(input==='-'){const chunks=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));source=Buffer.concat(chunks)}
  console.log(JSON.stringify(await importRealBaseline(source),null,2))
 }catch(e){console.error('PRE025 import failed: '+e.message);process.exitCode=1}
}
