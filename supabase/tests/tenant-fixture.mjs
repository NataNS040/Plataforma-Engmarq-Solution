// Shared synthetic fixtures through migration 016; no remote access.
export async function seedTenantBase(db, migration, id, {legacySequenceDefaults=false}={}) {
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
  // Optional reproduction of the documented Supabase legacy bootstrap, before
  // 006 creates SERIAL. This is a local scenario, never a remote baseline.
  if(legacySequenceDefaults) await db.exec('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role')
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
  for (const company of [101, 102, 103]) {
    for (const table of ['funcoes', 'setores', 'ambientes']) {
      await db.query(`INSERT INTO ${table} (id,empresa_id,nome) VALUES ($1,$1,'Catalog')`, [id(company)])
    }
    await db.query(`INSERT INTO colaboradores (id,empresa_id,nome,cpf,funcao_id,setor_id,ambiente_id,data_admissao)
      VALUES ($1,$2,'Synthetic employee','12345678901',$2,$2,$2,'2025-01-01')`, [id(company + 100), id(company)])
  }
  await db.exec('GRANT UPDATE (empresa_id), INSERT (id) ON colaboradores TO authenticated')
  await migration('016_colaboradores_tenant_security.sql')
}
