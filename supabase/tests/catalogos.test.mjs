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

let beforeConstraints

async function setupBase() {
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1, '/') $$;
  `)
  for (const name of ['001_base_schema.sql', '002_empresas_extra.sql', '003_asos.sql', '004_admin_rls_fix.sql']) await migration(name)
  // Enum additions must commit before policies can refer to the value.
  await db.exec("ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'empresa'")
  await migration('005_empresa_role.sql')
  for (const name of ['006_exames_catalogo.sql', '007_empresa_permissions_fix.sql',
    '008_modalidade_e_catalogo.sql', '009_storage_documentos.sql', '010_documento_tipos_cert_epi.sql',
    '011_fichas_epi.sql', '012_storage_assinaturas.sql', '013_configuracoes_gaps.sql']) await migration(name)
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role')
  for (const n of [1, 2, 3]) {
    await db.query('INSERT INTO empresas (id, razao_social, cnpj, status) VALUES ($1,$2,$3,$4)',
      [id(100 + n), `Company ${n}`, `cnpj-${n}`, n === 3 ? 'suspensa' : 'ativa'])
  }
  const users = [
    [1, 'admin', 101, true], [2, 'admin', 101, true],
    [3, 'gestor', 101, true], [4, 'empresa', 101, true],
    [5, 'operacional', 101, true], [6, 'operacional', 101, true],
    [7, 'gestor', 101, false], [8, 'operacional', 102, true],
    [9, 'gestor', 103, true], [10, 'operacional', 103, true],
  ]
  for (const [n, role, company, active] of users) {
    await db.query('INSERT INTO auth.users VALUES ($1)', [id(n)])
    await db.query('INSERT INTO user_profiles (id,email,full_name,role,empresa_id,active) VALUES ($1,$2,$3,$4,$5,$6)',
      [id(n), `user${n}@example.com`, `User ${n}`, role, id(company), active])
  }
  // Include an old column-level grant: revoking only the table is insufficient.
  await db.exec('GRANT UPDATE (empresa_id), INSERT (id) ON user_profiles TO authenticated')
  await migration('014_fix_user_profiles_permissions.sql')
  await migration('015_user_profiles_tenant_management.sql')
}

after(async () => db.close())

const insertEmployee = (company = 101, funcao = company, setor = company, ambiente = company) =>
  db.query(`INSERT INTO colaboradores (empresa_id,nome,cpf,funcao_id,setor_id,ambiente_id,data_admissao)
    VALUES ($1,'Synthetic employee','new-cpf',$2,$3,$4,'2025-01-01') RETURNING *`,
  [id(company), id(funcao), id(setor), ambiente === null ? null : id(ambiente)])
const editEmployee = (target = 201, assignment = "nome='Edited'") =>
  db.query(`UPDATE colaboradores SET ${assignment} WHERE id=$1 RETURNING *`, [id(target)])
const sqlError = (promise, code) => assert.rejects(promise, error => error.code === code)

before(async () => {
  await setupBase()
  for (const company of [101, 102, 103]) {
    for (const table of ['funcoes', 'setores', 'ambientes']) {
      await db.query(`INSERT INTO ${table} (id,empresa_id,nome) VALUES ($1,$1,'Catalog')`, [id(company)])
    }
    await db.query(`INSERT INTO colaboradores (id,empresa_id,nome,cpf,funcao_id,setor_id,ambiente_id,data_admissao)
      VALUES ($1,$2,'Synthetic employee','12345678901',$2,$2,$2,'2025-01-01')`, [id(company + 100), id(company)])
  }
  await db.exec('GRANT UPDATE (empresa_id), INSERT (id) ON colaboradores TO authenticated')
  await migration('016_colaboradores_tenant_security.sql')
  await db.exec('GRANT UPDATE (empresa_id), INSERT (id) ON funcoes, setores, ambientes TO authenticated')
  beforeConstraints = (await db.query("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('colaboradores'::regclass,'funcoes'::regclass,'setores'::regclass,'ambientes'::regclass) ORDER BY conname")).rows
  await migration('017_catalogos_tenant_security.sql')
})

for (const table of ['funcoes', 'setores', 'ambientes']) {
  const create = (company=101) => db.query(`INSERT INTO ${table} (empresa_id,nome) VALUES ($1,'New catalog') RETURNING *`,[id(company)])
  const edit = (target=101, assignment="nome='Edited'") => db.query(`UPDATE ${table} SET ${assignment} WHERE id=$1 RETURNING *`,[id(target)])
  for (const n of [3,4,5,8]) {
    test(`${table}: actor ${n} reads only own tenant`, async () => actor(n, async () => {
      assert.deepEqual((await db.query(`SELECT empresa_id FROM ${table}`)).rows.map(r=>r.empresa_id),[id(n===8?102:101)])
      assert.equal((await db.query(`SELECT id FROM ${table} WHERE empresa_id=$1`,[id(n===8?101:102)])).rows.length,0)
    }))
  }
  for (const n of [3,4]) {
    test(`${table}: manager ${n} creates, edits, deactivates and restores own catalog`, async () => actor(n, async () => {
      assert.equal((await create()).rows[0].empresa_id,id(101))
      assert.equal((await edit()).rows[0].nome,'Edited')
      assert.equal((await edit(101,'active=false')).rows[0].active,false)
      assert.equal((await edit(101,'active=true')).rows[0].active,true)
    }))
    test(`${table}: manager ${n} cannot create/update foreign catalog`, async () => {
      await actor(n,()=>denied(create(102)))
      await actor(n,async()=>assert.equal((await edit(102)).rows.length,0))
    })
  }
  for (const n of [1,5,7,9]) {
    test(`${table}: restricted actor ${n} cannot write`, async () => {
      await actor(n,()=>denied(create(n===9?103:101)))
      await actor(n,async()=>assert.equal((await edit(n===9?103:101,'active=false')).rows.length,0))
      if (n!==5) await actor(n,async()=>assert.equal((await db.query(`SELECT id FROM ${table}`)).rows.length,0))
    })
  }
  test(`${table}: anon denied`,async()=>actor(1,()=>denied(db.query(`SELECT * FROM ${table}`)),'anon'))
  test(`${table}: DELETE and TRUNCATE have no application grants`,async()=>{
    for (const n of [1,3,4,5]) {
      await actor(n,()=>denied(db.query(`DELETE FROM ${table}`)))
      await actor(n,()=>denied(db.query(`TRUNCATE ${table} CASCADE`)))
    }
  })
  test(`${table}: forged tenant and identity changes blocked`,async()=>{
    await actor(3,()=>denied(edit(101,`empresa_id='${id(102)}'`)))
    await actor(3,()=>denied(edit(101,`id='${id(999)}'`)))
  })
  test(`${table}: trigger defends against broadened grants and policies`,async()=>{
    for (const n of [1,3,5,7,9]) {
      await db.exec(`BEGIN; GRANT UPDATE (empresa_id) ON ${table} TO authenticated;
        CREATE POLICY test_overbroad ON ${table} FOR ALL TO authenticated USING (true) WITH CHECK (true);
        SET LOCAL ROLE authenticated;`)
      try {
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id(n)])
        await denied(edit(101,n===3?`empresa_id='${id(102)}'`:"nome='Forbidden'"))
      } finally {await db.exec('ROLLBACK')}
    }
  })
  test(`${table}: duplicate name per tenant rejected including inactive items`,async()=>actor(3,async()=>{
    await edit(101,'active=false')
    await sqlError(db.query(`INSERT INTO ${table} (empresa_id,nome) VALUES ($1,'Catalog')`,[id(101)]),'23505')
  }))
  test(`${table}: new catalog must be active`,async()=>actor(3,()=>sqlError(db.query(`INSERT INTO ${table} (empresa_id,nome,active) VALUES ($1,'New',false)`,[id(101)]),'23514')))
  test(`${table}: soft deactivation preserves employee references and visibility`,async()=>actor(3,async()=>{
    await edit(101,'active=false')
    const field={funcoes:'funcao_id',setores:'setor_id',ambientes:'ambiente_id'}[table]
    const result=await db.query(`SELECT c.id, t.active FROM colaboradores c JOIN ${table} t
      ON (c.empresa_id,c.${field})=(t.empresa_id,t.id) WHERE c.id=$1`,[id(201)])
    assert.equal(result.rows.length,1)
    assert.equal(result.rows[0].active,false)
    assert.equal((await insertEmployee()).rows.length,1)
  }))
  test(`${table}: composite FK still rejects cross-tenant employee reference`,async()=>actor(3,()=>{
    const field={funcoes:'funcao_id',setores:'setor_id',ambientes:'ambiente_id'}[table]
    return sqlError(editEmployee(201,`${field}='${id(102)}'`),'23503')
  }))
  test(`${table}: technical access retained, without granting it to functional admin`,async()=>actor(1,async()=>{
    assert.equal((await db.query(`SELECT id FROM ${table}`)).rows.length,3)
    assert.equal((await create(102)).rows.length,1)
  },'service_role'))
  test(`${table}: exact policies and column grants`,async()=>{
    assert.deepEqual((await db.query('SELECT policyname FROM pg_policies WHERE tablename=$1 ORDER BY policyname',[table])).rows.map(r=>r.policyname),[`${table}_insert`,`${table}_select`,`${table}_update`])
    assert.equal((await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[table])).rows[0].relrowsecurity,true)
    for (const column of ['id','empresa_id','nome','descricao','active',...(table==='funcoes'?['riscos']:[])]) {
      const r=(await db.query(`SELECT has_column_privilege('authenticated',$1,$2,'UPDATE') AS update,
        has_column_privilege('authenticated',$1,$2,'INSERT') AS insert`,[table,column])).rows[0]
      assert.equal(r.update,!['id','empresa_id'].includes(column))
      assert.equal(r.insert,column!=='id')
    }
  })
}

test('017 preserves all 016 constraints and compound FK definitions',async()=>{
  assert.deepEqual((await db.query("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('colaboradores'::regclass,'funcoes'::regclass,'setores'::regclass,'ambientes'::regclass) ORDER BY conname")).rows,beforeConstraints)
})
test('catalog security functions have restricted execution and empty search_path',async()=>{
  const rows=(await db.query("SELECT proconfig,prosecdef FROM pg_proc WHERE proname IN ('can_access_catalogos','guard_catalogo_write')")).rows
  assert.equal(rows.length,2)
  assert.ok(rows.every(r=>r.prosecdef && r.proconfig.includes('search_path=""')))
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','engmarq_private.guard_catalogo_write()','EXECUTE') AS allowed")).rows[0].allowed,false)
  assert.equal((await db.query("SELECT has_function_privilege('anon','engmarq_private.can_access_catalogos(uuid,boolean)','EXECUTE') AS allowed")).rows[0].allowed,false)
})

