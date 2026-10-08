import assert from 'node:assert/strict'
import {test} from 'node:test'
import {PGlite} from '@electric-sql/pglite'
import {bootstrapStatements} from './025-postgres-fixture.mjs'
import {load} from './fundacao-fixture.mjs'
test('025 disposable harness bootstrap SQL replays locally; NOT a real concurrency result',async()=>{
 const statements=await bootstrapStatements(),db=new PGlite()
 try{
  assert.ok(statements.length>60)
  for(const source of statements)await db.exec(source)
  await db.exec(await load('../migrations/025_entitlements_quota_hardening.sql'))
  assert.equal((await db.query('SELECT count(*)::int n FROM engmarq_private.fundacao_025_legado')).rows[0].n,3)
 }finally{await db.close()}
})
