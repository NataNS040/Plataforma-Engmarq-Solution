-- 026 Acidentes preflight. Execute the COMPLETE file as a trusted SQL Editor auditor BEFORE 026.
-- Read-only; no corrections. Every row must be OK; any BLOQUEIO stops the application.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT "check", CASE WHEN ok THEN 'OK' ELSE 'BLOQUEIO' END AS status, detalhe FROM (
  SELECT '025-A: can_use_feature presente' AS "check",
         to_regprocedure('engmarq_private.can_use_feature(uuid,text,boolean)') IS NOT NULL AS ok, NULL::text AS detalhe
  UNION ALL SELECT '017: can_access_catalogos presente',
         to_regprocedure('engmarq_private.can_access_catalogos(uuid,boolean)') IS NOT NULL, NULL
  UNION ALL SELECT '024: features e empresa_features presentes',
         to_regclass('public.features') IS NOT NULL AND to_regclass('public.empresa_features') IS NOT NULL, NULL
  UNION ALL SELECT '018: chave composta colaboradores(empresa_id,id)',
         EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'colaboradores_empresa_id_id_key'), NULL
  UNION ALL SELECT '026 ainda não aplicada: tabelas e view ausentes',
         to_regclass('public.acidentes') IS NULL AND to_regclass('public.esocial_codigos') IS NULL
         AND to_regclass('public.vw_acidentes_resumo') IS NULL, NULL
  UNION ALL SELECT '026 ainda não aplicada: feature acidentes ausente',
         NOT EXISTS (SELECT 1 FROM public.features WHERE feature_key = 'acidentes'), NULL
  UNION ALL SELECT '026 ainda não aplicada: guard ausente',
         to_regprocedure('engmarq_private.guard_acidente_write()') IS NULL, NULL
  UNION ALL SELECT 'Informativo: empresas legadas que receberão a feature', true,
         (SELECT count(*)::text FROM public.empresa_comercial WHERE origem = 'legado')
) checks;
COMMIT;
