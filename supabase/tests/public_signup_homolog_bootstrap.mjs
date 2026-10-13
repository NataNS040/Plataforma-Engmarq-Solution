// Synthetic source only. No production connection, backup, env or credentials.
import {spawn} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {bootstrapSql} from './025-postgres-fixture.mjs'
import {load} from './fundacao-fixture.mjs'
const host='npipe:////./pipe/dockerDesktopLinuxEngine'
const name='norveo-homolog-synthetic-source'
const run=(args,input='')=>new Promise((resolve,reject)=>{
 const p=spawn('docker',['--host',host,...args],{windowsHide:true});let out='',err=''
 p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject)
 p.on('close',code=>code===0?resolve(out):reject(new Error(err)));p.stdin.end(input)
})
await run(['run','--rm','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16'])
try {
 let ready=false
 for(let n=0;n<60;n++){
  try{await run(['exec',name,'psql','-h','127.0.0.1','-U','postgres','-Atc','SELECT 1']);ready=true;break}catch{}
  await new Promise(r=>setTimeout(r,500))
 }
 if(!ready)throw new Error('Synthetic local database not ready')
 const sql=await bootstrapSql()+'\n'+await load('../migrations/025_entitlements_quota_hardening.sql')
 await writeFile(new URL('../../.norveo-homolog.local/synthetic-bootstrap.sql',import.meta.url),sql)
 await run(['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],sql)
 // Transfer synthetic application schemas ONLY, preserving real local Auth/Storage.
 const dump=await run(['exec',name,'pg_dump','-U','postgres','--schema=public','--schema=engmarq_private','--no-publications'])
 await writeFile(new URL('../../.norveo-homolog.local/synthetic-app.sql',import.meta.url),dump)
 console.log('Synthetic 001-025-A application schemas exported; no production data')
} finally {await run(['stop',name])}
