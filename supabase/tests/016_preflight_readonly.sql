-- Read-only review before considering migration 016. Does not apply migrations.
-- Run with an authorized audit role. No CPF/name data is returned.
BEGIN READ ONLY;

SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;

SELECT
  count(*) FILTER (WHERE f.id IS NULL) AS invalid_funcao,
  count(*) FILTER (WHERE s.id IS NULL) AS invalid_setor,
  count(*) FILTER (WHERE c.ambiente_id IS NOT NULL AND a.id IS NULL) AS invalid_ambiente
FROM public.colaboradores c
LEFT JOIN public.funcoes f ON (f.empresa_id, f.id) = (c.empresa_id, c.funcao_id)
LEFT JOIN public.setores s ON (s.empresa_id, s.id) = (c.empresa_id, c.setor_id)
LEFT JOIN public.ambientes a ON (a.empresa_id, a.id) = (c.empresa_id, c.ambiente_id);

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename IN ('colaboradores','funcoes','setores','ambientes')
ORDER BY tablename, policyname;

SELECT conrelid::regclass AS relation, conname, pg_get_constraintdef(oid) AS definition
FROM pg_catalog.pg_constraint
WHERE conrelid IN ('public.colaboradores'::regclass, 'public.funcoes'::regclass,
                  'public.setores'::regclass, 'public.ambientes'::regclass)
ORDER BY relation, conname;

SELECT grantee, privilege_type FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='colaboradores' ORDER BY grantee, privilege_type;
SELECT grantee, column_name, privilege_type FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='colaboradores' ORDER BY grantee, column_name, privilege_type;

SELECT tgname, pg_get_triggerdef(oid) FROM pg_catalog.pg_trigger
WHERE tgrelid='public.colaboradores'::regclass AND NOT tgisinternal;
SELECT n.nspname, p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='engmarq_private'
  AND p.proname IN ('can_access_colaboradores','guard_colaborador_write');

ROLLBACK;
