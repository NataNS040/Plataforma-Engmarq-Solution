import { seedTenantBase } from './tenant-fixture.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// Real PostgreSQL/WASM: no production URL, keys, network, Auth or PostgREST.
// Auth/storage shims only provide Supabase-owned infrastructure for migrations.
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const migration = async name => db.exec((await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''))
const actor = async (n, run, role = 'authenticated') => {
  await db.exec('BEGIN')
  try {
    assert.ok(['authenticated', 'anon', 'service_role'].includes(role))
    await db.exec(`SET LOCAL ROLE ${role}`)
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id(n)])
    return await run()
  } finally {
    await db.exec('ROLLBACK')
  }
}
const denied = promise => assert.rejects(promise, error => error.code === '42501')



after(async () => db.close())

const sqlError = (promise, code) => assert.rejects(promise, error => error.code === code)

before(async () => {
  await seedTenantBase(db, migration, id)
  await db.exec('GRANT UPDATE (empresa_id), INSERT (id) ON funcoes, setores, ambientes TO authenticated')
  await migration('017_catalogos_tenant_security.sql')
  await migration('018_treinamentos_tenant_security.sql')
  await db.exec('ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated,anon,service_role; GRANT ALL ON storage.objects TO authenticated,anon,service_role')
  for (const company of [101,102,103]) {
    await db.query(`INSERT INTO treinamentos (id,empresa_id,colaborador_id,treinamento_tipo_id,data_realizacao) VALUES ($1,$2,$3,(SELECT id FROM treinamento_tipos LIMIT 1),'2025-01-01')`, [id(company+200),id(company),id(company+100)])
    await db.query(`INSERT INTO matriz_treinamentos (id,empresa_id,funcao_id,treinamento_tipo_id) VALUES ($1,$2,$2,(SELECT id FROM treinamento_tipos LIMIT 1))`, [id(company+300),id(company)])
    await db.query(`INSERT INTO storage.objects (id,bucket_id,name) VALUES ($1,'documentos',$2)`,[id(company),`${id(company)}/certificados/test.pdf`])
  }
})

for (const table of ['treinamentos','matriz_treinamentos']) {
  const offset = table === 'treinamentos' ? 200 : 300
  const create = (company=101, relation=101) => table === 'treinamentos'
    ? db.query(`INSERT INTO treinamentos (empresa_id,colaborador_id,treinamento_tipo_id,data_realizacao)
        VALUES ($1,$2,(SELECT id FROM treinamento_tipos LIMIT 1),'2025-01-01') RETURNING *`,[id(company),id(relation+100)])
    : db.query(`INSERT INTO matriz_treinamentos (empresa_id,funcao_id,treinamento_tipo_id)
        VALUES ($1,$2,(SELECT id FROM treinamento_tipos ORDER BY id OFFSET 1 LIMIT 1)) RETURNING *`,[id(company),id(relation)])
  const edit = (company=101) => db.query(`UPDATE ${table} SET ${table==='treinamentos' ? "instrutor='Edited'" : 'obrigatorio=false'} WHERE id=$1 RETURNING *`,[id(company+offset)])
  for (const n of [3,4,5,8]) test(`${table}: actor ${n} reads only own tenant`, () => actor(n,async () => {
    const rows = (await db.query(`SELECT * FROM ${table}`)).rows
    assert.equal(rows.length,1); assert.equal(rows[0].empresa_id,id(n===8 ? 102 : 101))
  }))
  for (const n of [3,4]) {
    test(`${table}: manager ${n} creates and edits own tenant`, () => actor(n,async () => {
      assert.equal((await create()).rows.length,1)
      assert.equal((await edit()).rows.length,1)
    }))
    test(`${table}: manager ${n} cannot update foreign tenant`, () => actor(n,async () => assert.equal((await edit(102)).rows.length,0)))
    test(`${table}: manager ${n} cannot insert foreign tenant`, () => actor(n,() => denied(create(102,102))))
    test(`${table}: cross-tenant relation blocked by compound FK ${n}`, () => actor(n,() => sqlError(create(101,102),'23503')))
  }
  for (const n of [1,5,7,9]) {
    test(`${table}: restricted actor ${n} cannot write`, () => actor(n, async () => {
      assert.equal((await edit()).rows.length,0)
      await denied(create())
    }))
    if (n!==5) test(`${table}: actor ${n} cannot read`, () => actor(n, async () => assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,0)))
  }
  test(`${table}: anonymous denied`, () => actor(3,() => denied(db.query(`SELECT * FROM ${table}`)),'anon'))
  test(`${table}: tenant and identity column grants denied`, () => actor(3,() => denied(db.query(`UPDATE ${table} SET empresa_id=$1`,[id(102)]))))
  test(`${table}: truncate denied`, () => actor(3,() => denied(db.exec(`TRUNCATE ${table} CASCADE`))))
  test(`${table}: technical service role retained`, () => actor(1,async () => assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,3),'service_role'))
}
test('completed training cannot be physically deleted', () => actor(3,() => denied(db.query('DELETE FROM treinamentos'))))
test('requirement removal preserves completed history', () => actor(3,async () => {
  assert.equal((await db.query('DELETE FROM matriz_treinamentos RETURNING *')).rows.length,1)
  assert.equal((await db.query('SELECT * FROM treinamentos')).rows.length,1)
}))
test('operacional cannot delete requirements', () => actor(5,async () => assert.equal((await db.query('DELETE FROM matriz_treinamentos RETURNING *')).rows.length,0)))
test('status remains calculated by existing date trigger', () => actor(3,async () => {
  for (const [date,status] of [[null,'em_dia'],['2000-01-01','vencido']]) {
    const result=await db.query('UPDATE treinamentos SET data_vencimento=$1 RETURNING status',[date])
    assert.equal(result.rows[0].status,status)
  }
  assert.equal((await db.query("UPDATE treinamentos SET data_vencimento=CURRENT_DATE+1 RETURNING status")).rows[0].status,'vencendo')
}))
test('status is not writable by caller', () => actor(3,() => denied(db.exec("UPDATE treinamentos SET status='pendente'"))))
test('foreign certificate path rejected', () => actor(3,() => sqlError(db.query('UPDATE treinamentos SET certificado_url=$1',[`${id(102)}/certificados/test.pdf`]),'23514')))
test('dashboard view obeys invoker RLS', async () => {
  await actor(1,async () => assert.equal((await db.query('SELECT * FROM vw_dashboard_treinamentos')).rows.length,0))
  await actor(3,async () => {
    const rows=(await db.query('SELECT * FROM vw_dashboard_treinamentos')).rows
    assert.equal(rows.length,1);assert.equal(rows[0].empresa_id,id(101))
  })
})
for (const n of [1,3,4,5,7,8,9]) test(`certificate storage read actor ${n}`, () => actor(n,async () => {
  const rows=(await db.query('SELECT * FROM storage.objects')).rows
  assert.equal(rows.length,[3,4,5,8].includes(n)?1:0)
  if(rows.length) assert.equal(rows[0].name,`${id(n===8?102:101)}/certificados/test.pdf`)
}))
for (const n of [1,3,4,5,7,9]) test(`certificate storage writes actor ${n}`, () => actor(n,async () => {
  assert.equal((await db.query("DELETE FROM storage.objects WHERE bucket_id='documentos' RETURNING *")).rows.length,0)
  assert.equal((await db.query("UPDATE storage.objects SET name='renamed.pdf' RETURNING *")).rows.length,0)
  const insert=db.query("INSERT INTO storage.objects (id,bucket_id,name) VALUES ($1,'documentos',$2)",[id(999),`${id(101)}/certificados/new.pdf`])
  if([3,4].includes(n)) await insert; else await denied(insert)
}))
test('storage guard does not change other document namespaces', () => actor(3,async () => {
  await db.query("INSERT INTO storage.objects VALUES ($1,'documentos',$2)",[id(900),`${id(101)}/other.pdf`])
  assert.equal((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING *',[id(900)])).rows.length,1)
}))
test('global type catalog is read only for tenant actors', async () => {
  await actor(3,async () => assert.ok((await db.query('SELECT * FROM treinamento_tipos')).rows.length>0))
  await actor(1,async () => assert.equal((await db.query('SELECT * FROM treinamento_tipos')).rows.length,0))
  await actor(3,() => denied(db.exec("INSERT INTO treinamento_tipos(nome) VALUES ('Forged')")))
})
test('guard protects history even if a permissive delete policy is introduced', async () => {
  await db.exec('BEGIN')
  try {
    await db.exec("GRANT DELETE ON treinamentos TO authenticated; CREATE POLICY bad_delete ON treinamentos FOR DELETE USING (true); SET LOCAL ROLE authenticated")
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(3)])
    await denied(db.exec('DELETE FROM treinamentos'))
  } finally { await db.exec('ROLLBACK') }
})

test('exact training grants and private function privileges', async () => {
  for (const table of ['treinamentos','matriz_treinamentos']) {
    const result=await db.query(`SELECT has_table_privilege('authenticated',$1,'TRUNCATE') AS truncate,
      has_column_privilege('authenticated',$1,'empresa_id','UPDATE') AS tenant_update,
      has_column_privilege('authenticated',$1,'id','INSERT') AS identity_insert`,[table])
    assert.deepEqual(result.rows[0],{truncate:false,tenant_update:false,identity_insert:false})
  }
  const functions=(await db.query(`SELECT proname,prosecdef,proconfig FROM pg_proc
    WHERE proname IN ('guard_treinamento_write','can_access_certificado')`)).rows
  assert.equal(functions.length,2)
  for(const fn of functions) {assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes('search_path=""'))}
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','engmarq_private.guard_treinamento_write()','EXECUTE') AS allowed")).rows[0].allowed,false)
  assert.equal((await db.query("SELECT has_function_privilege('anon','engmarq_private.can_access_certificado(text,boolean)','EXECUTE') AS allowed")).rows[0].allowed,false)
})
test('technical writes retain historical rows and RLS bypass only for service role', () => actor(1,async () => {
  assert.equal((await db.query("UPDATE treinamentos SET instrutor='Technical' RETURNING *")).rows.length,3)
},'service_role'))

// Run 018 on independent pre-018 databases to verify rollback, not silent repair.
for (const scenario of ['foreign_employee','foreign_function','external_certificate','public_bucket','unexpected_policy']) {
  test(`018 aborts atomically on legacy ${scenario}`,async () => {
    const isolated=new PGlite()
    const migrate=async name => isolated.exec((await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')).replace(/^\uFEFF/,''))
    try {
      await seedTenantBase(isolated,migrate,id)
      await migrate('017_catalogos_tenant_security.sql')
      if(scenario==='foreign_employee' || scenario==='external_certificate') {
        await isolated.query(`INSERT INTO treinamentos (empresa_id,colaborador_id,treinamento_tipo_id,data_realizacao,certificado_url)
          VALUES ($1,$2,(SELECT id FROM treinamento_tipos LIMIT 1),'2025-01-01',$3)`,
          [id(101),id(scenario==='foreign_employee'?202:201),scenario==='external_certificate'?'https://external.test/cert.pdf':null])
      } else if(scenario==='foreign_function') {
        await isolated.query(`INSERT INTO matriz_treinamentos (empresa_id,funcao_id,treinamento_tipo_id)
          VALUES ($1,$2,(SELECT id FROM treinamento_tipos LIMIT 1))`,[id(101),id(102)])
      } else if(scenario==='public_bucket') await isolated.exec("UPDATE storage.buckets SET public=true WHERE id='documentos'")
      else await isolated.exec('CREATE POLICY unexpected ON treinamentos FOR SELECT USING (true)')
      await assert.rejects(migrate('018_treinamentos_tenant_security.sql'))
      await isolated.exec('ROLLBACK')
      assert.equal((await isolated.query("SELECT 1 FROM pg_constraint WHERE conname='colaboradores_empresa_id_id_key'")).rows.length,0)
      const count=(await isolated.query('SELECT count(*)::int AS n FROM treinamentos')).rows[0].n
      assert.equal(count,['foreign_employee','external_certificate'].includes(scenario)?1:0)
    } finally {await isolated.close()}
  })
}
