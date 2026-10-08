// PGlite only compiles the existing synthetic bootstrap. SQL executes in real PG
// in the concurrency harness; no result from this fixture counts as concurrency.
import {PGlite} from '@electric-sql/pglite'
import {fundacaoFixture} from './fundacao-fixture.mjs'
const literal=v=>v===null?'NULL':typeof v==='boolean'||typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'"
export async function bootstrapStatements(){
 const statements=[];let depth=0
 const originals={exec:PGlite.prototype.exec,query:PGlite.prototype.query}
 for(const method of ['exec','query'])PGlite.prototype[method]=async function(sql,params,...rest){
  if(depth===0)statements.push(method==='query'?sql.replace(/\$(\d+)\b/g,(_,n)=>literal(params[Number(n)-1])):sql)
  depth++
  try{return await originals[method].call(this,sql,params,...rest)}finally{depth--}
 }
 let db
 try{db=await fundacaoFixture(true);return statements}
 finally{for(const method of ['exec','query'])PGlite.prototype[method]=originals[method];await db?.close()}
}
export async function bootstrapSql(){return (await bootstrapStatements()).join(';\n')+';\n'}
