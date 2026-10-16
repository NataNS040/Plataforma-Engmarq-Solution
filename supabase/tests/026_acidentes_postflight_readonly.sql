-- 026 Acidentes postflight. Execute the COMPLETE file as a trusted SQL Editor auditor AFTER 026.
-- Read-only; no corrections. Every row must be OK; save the result set as evidence.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT "check", CASE WHEN ok THEN 'OK' ELSE 'BLOQUEIO' END AS status, detalhe FROM (
  SELECT 'Feature acidentes registrada' AS "check",
         EXISTS (SELECT 1 FROM public.features WHERE feature_key = 'acidentes') AS ok, NULL::text AS detalhe
  UNION ALL SELECT 'Catálogo eSocial: 45/248/60/29 códigos (tabelas 13/14/15/17)',
         (SELECT array_agg(n ORDER BY tabela) FROM (SELECT tabela, count(*)::int n FROM public.esocial_codigos GROUP BY tabela) t)
           = ARRAY[45, 248, 60, 29],
         (SELECT string_agg(tabela || ':' || n, ' ' ORDER BY tabela) FROM (SELECT tabela, count(*) n FROM public.esocial_codigos GROUP BY tabela) t)
  UNION ALL SELECT 'RLS ativo em acidentes e esocial_codigos',
         (SELECT bool_and(relrowsecurity) FROM pg_catalog.pg_class
           WHERE oid IN ('public.acidentes'::regclass, 'public.esocial_codigos'::regclass)), NULL
  UNION ALL SELECT 'Policies de acidentes: 3 permissivas + 4 restritivas de feature',
         (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE') = 3 AND count(*) FILTER (WHERE permissive = 'RESTRICTIVE') = 4
            FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'acidentes'), NULL
  UNION ALL SELECT 'Policies de esocial_codigos: leitura + guard de feature',
         (SELECT count(*) = 2 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'esocial_codigos'), NULL
  UNION ALL SELECT 'Trigger guard_acidente_write ativo',
         EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.acidentes'::regclass
                  AND tgname = 'guard_acidente_write' AND tgenabled = 'O'), NULL
  UNION ALL SELECT 'Guard: SECURITY DEFINER, search_path vazio, sem EXECUTE para clientes',
         (SELECT p.prosecdef AND p.proconfig = ARRAY['search_path=""']
            AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
            AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
            FROM pg_catalog.pg_proc p WHERE p.oid = 'engmarq_private.guard_acidente_write()'::regprocedure), NULL
  UNION ALL SELECT 'Sem DELETE/TRUNCATE para clientes em acidentes',
         NOT has_table_privilege('authenticated', 'public.acidentes', 'DELETE')
         AND NOT has_table_privilege('authenticated', 'public.acidentes', 'TRUNCATE')
         AND NOT has_table_privilege('anon', 'public.acidentes', 'DELETE'), NULL
  UNION ALL SELECT 'Autoria não gravável pelo cliente',
         NOT has_column_privilege('authenticated', 'public.acidentes', 'criado_por', 'INSERT')
         AND NOT has_column_privilege('authenticated', 'public.acidentes', 'anulado_por', 'UPDATE')
         AND NOT has_column_privilege('authenticated', 'public.acidentes', 'empresa_id', 'UPDATE'), NULL
  UNION ALL SELECT 'Catálogo somente leitura para clientes',
         has_table_privilege('authenticated', 'public.esocial_codigos', 'SELECT')
         AND NOT has_table_privilege('authenticated', 'public.esocial_codigos', 'INSERT')
         AND NOT has_table_privilege('authenticated', 'public.esocial_codigos', 'UPDATE'), NULL
  UNION ALL SELECT 'anon sem acesso a acidentes, catálogo e resumo',
         NOT has_table_privilege('anon', 'public.acidentes', 'SELECT')
         AND NOT has_table_privilege('anon', 'public.esocial_codigos', 'SELECT')
         AND NOT has_table_privilege('anon', 'public.vw_acidentes_resumo', 'SELECT'), NULL
  UNION ALL SELECT 'View de resumo com security_invoker',
         (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_catalog.pg_class
           WHERE oid = 'public.vw_acidentes_resumo'::regclass), NULL
  UNION ALL SELECT 'Contrato do plano gratuito preservado (7 features)',
         (SELECT count(*) = 7 FROM public.features WHERE feature_key IN
           ('empresa.cadastro','usuarios.gestao','colaboradores.gestao','treinamentos','exames','documentos','relatorios.sst')), NULL
  UNION ALL SELECT 'Informativo: empresas com acidentes habilitado', true,
         (SELECT count(*)::text FROM public.empresa_features WHERE feature_key = 'acidentes' AND enabled)
) checks;
COMMIT;
