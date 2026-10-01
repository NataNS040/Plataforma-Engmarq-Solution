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
})

for (const n of [3, 4, 5, 8]) {
  test(`actor ${n}: SELECT returns own tenant only`, async () => actor(n, async () => {
    const own = n === 8 ? 102 : 101
    assert.deepEqual((await db.query('SELECT id FROM colaboradores')).rows.map(r => r.id), [id(own + 100)])
    assert.equal((await db.query('SELECT * FROM colaboradores WHERE empresa_id=$1', [id(own === 101 ? 102 : 101)])).rows.length, 0)
  }))
}

for (const n of [3, 4]) {
  test(`manager ${n}: inserts, edits and deactivates own employee preserving history`, async () => actor(n, async () => {
    const created = (await insertEmployee()).rows[0]
    assert.equal(created.empresa_id, id(101))
    assert.equal(created.active, true)
    assert.equal((await editEmployee()).rows[0].nome, 'Edited')
    const inactive = (await editEmployee(201, "active=false,data_demissao='2026-01-01'")).rows[0]
    assert.equal(inactive.active, false)
    assert.equal(inactive.data_demissao.toISOString().slice(0, 10), '2026-01-01')
    assert.equal((await db.query('SELECT id FROM colaboradores WHERE id=$1', [id(201)])).rows.length, 1)
  }))
  test(`manager ${n}: foreign insert blocked`, async () => actor(n, () => denied(insertEmployee(102))))
  test(`manager ${n}: foreign update affects no rows`, async () => actor(n, async () => {
    assert.equal((await editEmployee(202)).rows.length, 0)
  }))
  test(`manager ${n}: tenant transfer blocked by grants`, async () => actor(n, () => denied(editEmployee(201, `empresa_id='${id(102)}'`))))
}

for (const [field, position] of [['funcao_id', 1], ['setor_id', 2], ['ambiente_id', 3]]) {
  test(`${field}: composite FK blocks foreign INSERT`, async () => actor(3, () => {
    const args = [101, 101, 101, 101]
    args[position] = 102
    return sqlError(insertEmployee(...args), '23503')
  }))
  test(`${field}: composite FK blocks foreign UPDATE`, async () => actor(3, () =>
    sqlError(editEmployee(201, `${field}='${id(102)}'`), '23503')))
  test(`${field}: missing catalog blocked`, async () => actor(3, () =>
    sqlError(editEmployee(201, `${field}='${id(999)}'`), '23503')))
}

for (const n of [1, 5, 7, 9]) {
  test(`restricted actor ${n}: SELECT visibility`, async () => actor(n, async () => {
    assert.equal((await db.query('SELECT id FROM colaboradores')).rows.length, n === 5 ? 1 : 0)
  }))
  test(`restricted actor ${n}: INSERT blocked`, async () => actor(n, () => denied(insertEmployee())))
  test(`restricted actor ${n}: UPDATE blocked`, async () => actor(n, async () => {
    assert.equal((await editEmployee(n === 9 ? 203 : 201)).rows.length, 0)
  }))
}

test('anon has no SELECT grant', async () => actor(1, () => denied(db.query('SELECT * FROM colaboradores')), 'anon'))
for (const n of [1, 3, 4, 5]) {
  test(`actor ${n}: DELETE blocked`, async () => actor(n, () => denied(db.query('DELETE FROM colaboradores'))))
  test(`actor ${n}: TRUNCATE blocked`, async () => actor(n, () => denied(db.query('TRUNCATE colaboradores CASCADE'))))
}

for (const [column, value] of [
  ['id', `'${id(999)}'`], ['empresa_id', `'${id(102)}'`], ['cpf', "'changed'"],
  ['data_admissao', "'2020-01-01'"], ['created_at', 'now()'],
]) {
  test(`immutable ${column}: column grant blocks write`, async () => actor(3, () => denied(editEmployee(201, `${column}=${value}`))))
  test(`immutable ${column}: trigger blocks write even with an added grant and permissive policy`, async () => {
    await db.exec(`BEGIN; GRANT UPDATE (${column}) ON colaboradores TO authenticated;
      CREATE POLICY test_overbroad ON colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
      SET LOCAL ROLE authenticated;`)
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id(3)])
      await denied(editEmployee(201, `${column}=${value}`))
    } finally { await db.exec('ROLLBACK') }
  })
}

for (const n of [1, 5, 7, 9]) {
  test(`trigger rejects actor ${n} even if RLS becomes permissive`, async () => {
    await db.exec(`BEGIN; CREATE POLICY test_overbroad ON colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
      SET LOCAL ROLE authenticated;`)
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id(n)])
      await denied(editEmployee())
    } finally { await db.exec('ROLLBACK') }
  })
}

test('deactivation without dismissal date blocked', async () => actor(3, () => sqlError(editEmployee(201, 'active=false'), '23514')))
test('dismissal while active blocked', async () => actor(3, () => sqlError(editEmployee(201, "data_demissao='2026-01-01'"), '23514')))
test('reactivation blocked', async () => actor(3, async () => {
  await editEmployee(201, "active=false,data_demissao='2026-01-01'")
  await sqlError(editEmployee(201, 'active=true,data_demissao=NULL'), '23514')
}))
test('inactive INSERT blocked by trigger', async () => actor(3, () => sqlError(db.query(`
  INSERT INTO colaboradores (empresa_id,nome,cpf,funcao_id,setor_id,data_admissao,active)
  VALUES ($1,'Synthetic','inactive',$1,$1,'2025-01-01',false)`, [id(101)]), '23514')))
test('nullable environment accepted', async () => actor(3, async () => {
  assert.equal((await insertEmployee(101, 101, 101, null)).rows[0].ambiente_id, null)
}))
test('CPF uniqueness is scoped to company and preserved', async () => actor(3, () => sqlError(db.query(`
  INSERT INTO colaboradores (empresa_id,nome,cpf,funcao_id,setor_id,data_admissao)
  VALUES ($1,'Synthetic','12345678901',$1,$1,'2025-01-01')`, [id(101)]), '23505')))

test('grants, policies, RLS and private function execution are restricted', async () => {
  const columns = ['id','empresa_id','nome','cpf','matricula','funcao_id','setor_id','ambiente_id','data_admissao','data_demissao','active','created_at']
  for (const column of columns) {
    const result = (await db.query(`SELECT
      has_column_privilege('authenticated','colaboradores',$1,'UPDATE') AS update,
      has_column_privilege('authenticated','colaboradores',$1,'INSERT') AS insert`, [column])).rows[0]
    assert.equal(result.update, ['nome','matricula','funcao_id','setor_id','ambiente_id','active','data_demissao'].includes(column))
    assert.equal(result.insert, ['empresa_id','nome','cpf','matricula','funcao_id','setor_id','ambiente_id','data_admissao','active'].includes(column))
  }
  assert.deepEqual((await db.query("SELECT policyname FROM pg_policies WHERE tablename='colaboradores' ORDER BY policyname")).rows.map(r=>r.policyname),
    ['colaboradores_insert','colaboradores_select','colaboradores_update'])
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='colaboradores'::regclass")).rows[0].relrowsecurity, true)
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','engmarq_private.guard_colaborador_write()','EXECUTE') AS allowed")).rows[0].allowed, false)
  const functions = (await db.query("SELECT proconfig FROM pg_proc WHERE proname IN ('can_access_colaboradores','guard_colaborador_write')")).rows
  assert.equal(functions.length, 2)
  assert.ok(functions.every(r => r.proconfig.includes('search_path=""')))
})

test('technical service role retains infrastructure access but cannot bypass composite FKs', async () => {
  await actor(1, async () => {
    assert.equal((await db.query('SELECT id FROM colaboradores')).rows.length, 3)
    assert.equal((await insertEmployee(102)).rows.length, 1)
  }, 'service_role')
  await actor(1, () => sqlError(insertEmployee(101, 102), '23503'), 'service_role')
})

// Validate preflight against an intentionally restored legacy schema, all rolled back.
test('016 preflight aborts on legacy cross-tenant references without repairing data', async () => {
  await db.exec(`ALTER TABLE colaboradores DROP CONSTRAINT colaboradores_funcao_id_fkey;
    ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_funcao_id_fkey FOREIGN KEY(funcao_id) REFERENCES funcoes(id);
    UPDATE colaboradores SET funcao_id='${id(102)}' WHERE id='${id(201)}';`)
  try {
    await sqlError(migration('016_colaboradores_tenant_security.sql'), '23514')
    await db.exec('ROLLBACK')
    assert.equal((await db.query('SELECT funcao_id FROM colaboradores WHERE id=$1',[id(201)])).rows[0].funcao_id,id(102))
  } finally {
    await db.exec(`UPDATE colaboradores SET funcao_id='${id(101)}' WHERE id='${id(201)}';
      ALTER TABLE colaboradores DROP CONSTRAINT colaboradores_funcao_id_fkey;
      ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_funcao_id_fkey FOREIGN KEY(empresa_id,funcao_id) REFERENCES funcoes(empresa_id,id);`)
  }
})

test('unexpected legacy policy aborts migration atomically; clean migration preserves all employee data', async () => {
  const original = (await db.query('SELECT * FROM colaboradores ORDER BY id')).rows
  // Reconstruct the pre-016 objects in this disposable database only.
  await db.exec(`DROP TRIGGER guard_colaborador_write ON colaboradores;
    DROP POLICY colaboradores_select ON colaboradores;
    DROP POLICY colaboradores_insert ON colaboradores;
    DROP POLICY colaboradores_update ON colaboradores;
    CREATE POLICY colaboradores_select ON colaboradores FOR SELECT USING (true);
    CREATE POLICY colaboradores_write ON colaboradores FOR ALL USING (true);
    CREATE POLICY unexpected_legacy ON colaboradores FOR SELECT USING (true);`)
  for (const [field, table] of [['funcao_id','funcoes'],['setor_id','setores'],['ambiente_id','ambientes']]) {
    await db.exec(`ALTER TABLE colaboradores DROP CONSTRAINT colaboradores_${field}_fkey;
      ALTER TABLE colaboradores ADD CONSTRAINT colaboradores_${field}_fkey FOREIGN KEY (${field}) REFERENCES ${table}(id);
      ALTER TABLE ${table} DROP CONSTRAINT ${table}_empresa_id_id_key;`)
  }
  await assert.rejects(migration('016_colaboradores_tenant_security.sql'), /Unexpected colaboradores policies/)
  await db.exec('ROLLBACK')
  assert.deepEqual((await db.query('SELECT * FROM colaboradores ORDER BY id')).rows, original)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='funcoes_empresa_id_id_key'")).rows[0].n, 0)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename='colaboradores' AND policyname='colaboradores_write'")).rows[0].n, 1)
  await db.exec('DROP POLICY unexpected_legacy ON colaboradores')
  await migration('016_colaboradores_tenant_security.sql')
  assert.deepEqual((await db.query('SELECT * FROM colaboradores ORDER BY id')).rows, original)
})
