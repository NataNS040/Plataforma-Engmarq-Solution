# SQL/RLS local

Run `npm test` in this directory. Both `user_profiles.test.mjs` and
`colaboradores.test.mjs` run on separate, ephemeral PGlite databases. No remote
URL, key or real data is used. Auth and Storage schemas are infrastructure shims.

The Colaboradores fixture applies migrations 001–016 in order (the enum addition
in 005 is committed first). Tests execute real SELECT/INSERT/UPDATE/DELETE and
TRUNCATE attempts under SQL roles, not mocked policy predicates. They also test
composite FKs, column grants, immutable fields, deactivation, malicious policy
expansion, legacy inconsistencies and transactional migration rollback.

`service_role` is tested only as a technical infrastructure role. Functional
backend tests separately assert that all employee requests use the caller JWT
and anon key, never administrative credentials.

PGlite does not exercise PostgREST relationship discovery, Supabase Auth itself,
remote schema drift, or concurrent transactions. These belong in isolated
homologation after a read-only remote preflight. Do not apply 016 to production
as part of this test command.
