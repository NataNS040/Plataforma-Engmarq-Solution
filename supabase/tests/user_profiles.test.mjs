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
const update = (target, sql = "role = 'admin'") => db.query(`UPDATE public.user_profiles SET ${sql} WHERE id = $1 RETURNING *`, [id(target)])
const denied = promise => assert.rejects(promise, error => error.code === '42501')
let baselineExploitable = false

before(async () => {
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
  for (const name of ['001_base_schema.sql', '002_empresas_extra.sql', '004_admin_rls_fix.sql']) await migration(name)
  // Enum additions must commit before policies can refer to the value.
  await db.exec("ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'empresa'")
  await migration('005_empresa_role.sql')
  await migration('013_configuracoes_gaps.sql')
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
  await actor(3, async () => {
    baselineExploitable = (await update(3)).rows[0].role === 'admin'
  })
  // Include an old column-level grant: revoking only the table is insufficient.
  await db.exec('GRANT UPDATE (empresa_id), INSERT (id) ON user_profiles TO authenticated')
  await migration('014_fix_user_profiles_permissions.sql')
})

after(async () => db.close())

test('013 escalation reproduced; 014 applies idempotently and keeps RLS enabled', async () => {
  assert.equal(baselineExploitable, true)
  await migration('014_fix_user_profiles_permissions.sql')
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_profiles'::regclass")).rows[0].relrowsecurity, true)
  const policies = (await db.query("SELECT policyname FROM pg_policies WHERE tablename = 'user_profiles' ORDER BY policyname")).rows
  assert.deepEqual(policies.map(p => p.policyname), ['profiles_select', 'profiles_update_managers'])
})

for (const manager of [3, 4]) {
  test(`manager ${manager} cannot promote another user directly`, async () => actor(manager, () => denied(update(6))))
  test(`manager ${manager} cannot self-promote or change own active`, async () => actor(manager, async () => {
    assert.equal((await update(manager)).rows.length, 0)
    assert.equal((await update(manager, 'active = false')).rows.length, 0)
  }))
  test(`manager ${manager} cannot edit existing admin`, async () => actor(manager, async () => {
    assert.equal((await update(1, "role = 'operacional', active = false")).rows.length, 0)
  }))
  test(`manager ${manager} can edit non-admin role/status`, async () => actor(manager, async () => {
    const result = await update(6, "role = 'gestor', active = false")
    assert.equal(result.rows.length, 1)
    assert.equal(result.rows[0].active, false)
    assert.equal(result.rows[0].role, 'gestor')
    assert.equal((await update(6, 'active = true')).rows[0].active, true)
  }))
  test(`manager ${manager} cannot read or edit another company`, async () => actor(manager, async () => {
    const rows = (await db.query('SELECT * FROM user_profiles')).rows
    assert.ok(rows.length > 1)
    assert.ok(rows.every(row => row.empresa_id === id(101)))
    assert.equal((await update(8, 'active = false')).rows.length, 0)
  }))
}

for (const n of [1, 3, 4]) {
  for (const assignment of [
    `empresa_id = '${id(102)}'`, "email = 'changed@example.com'", "full_name = 'Changed'",
    `id = '${id(99)}'`, "created_at = now()",
  ]) {
    test(`actor ${n}: immutable column ${assignment.split(' ')[0]}`, async () => actor(n, () => denied(update(6, assignment))))
  }
}

for (const n of [5, 7, 9]) {
  test(`operational/inactive/suspended actor ${n} reads only own profile and cannot administer`, async () => actor(n, async () => {
    assert.deepEqual((await db.query('SELECT id FROM user_profiles')).rows.map(row => row.id), [id(n)])
    assert.equal((await update(n, 'active = true')).rows.length, 0)
    assert.equal((await update(n === 9 ? 10 : 6, 'active = false')).rows.length, 0)
  }))
}

test('admin reads all companies and can promote, demote and suspend other users', async () => actor(1, async () => {
  assert.equal((await db.query('SELECT id FROM user_profiles')).rows.length, 10)
  assert.equal((await update(8)).rows[0].role, 'admin')
  assert.equal((await update(2, "role = 'gestor', active = false")).rows[0].active, false)
}))

test('admin cannot self-demote or self-disable, preserving an acting administrator', async () => actor(1, async () => {
  assert.equal((await update(1, "role = 'operacional'")).rows.length, 0)
  assert.equal((await update(1, 'active = false')).rows.length, 0)
}))

for (const n of [1, 3, 4]) {
  test(`actor ${n} cannot insert/upsert or delete profiles directly`, async () => {
    await actor(n, () => denied(db.query('DELETE FROM user_profiles WHERE id = $1', [id(6)])))
    await actor(n, () => denied(db.query(`INSERT INTO user_profiles (id,email,full_name,role,empresa_id)
      VALUES ($1,'injected@example.com','Injected','admin',$2)
      ON CONFLICT (id) DO UPDATE SET role = 'admin'`, [id(n), id(101)])))
    await actor(n, () => denied(db.query('TRUNCATE user_profiles CASCADE')))
  })
}

test('anonymous has no profile access', async () => actor(1, () => denied(db.query('SELECT * FROM user_profiles')), 'anon'))

test('explicit service role retains provisioning rights', async () => {
  await db.query('INSERT INTO auth.users VALUES ($1)', [id(99)])
  await actor(99, async () => {
    assert.equal((await db.query(`INSERT INTO user_profiles (id,email,full_name,role,empresa_id)
      VALUES ($1,'new@example.com','New','gestor',$2) RETURNING id`, [id(99), id(101)])).rows.length, 1)
  }, 'service_role')
})

test('only role and active have authenticated UPDATE grants', async () => {
  const columns = ['id', 'email', 'full_name', 'role', 'empresa_id', 'active', 'created_at']
  for (const column of columns) {
    const row = (await db.query("SELECT has_column_privilege('authenticated','public.user_profiles',$1,'UPDATE') AS allowed", [column])).rows[0]
    assert.equal(row.allowed, ['role', 'active'].includes(column))
  }
})

test('trigger remains a barrier if a future permissive policy or column grant is added', async () => {
  await db.exec(`BEGIN;
    CREATE POLICY test_overbroad ON user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT UPDATE (empresa_id) ON user_profiles TO authenticated;
    SET LOCAL ROLE authenticated;`)
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id(3)])
    await denied(update(6, `empresa_id = '${id(102)}', role = 'admin'`))
  } finally {
    await db.exec('ROLLBACK')
  }
})
