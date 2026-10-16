/**
 * Módulos que existem no front mas ainda não estão liberados no back-end.
 *
 * Fichas de EPI: as tabelas `fichas_epi*` e o bucket `assinaturas` estão em
 * quarentena desde a migration 025 (`can_use_feature` nega 'epi' e o backend
 * bloqueia a feature em `app/core/entitlements.py`). Enquanto a migration
 * própria do módulo (EPI v2) não for aplicada, as telas mostram "em breve"
 * e nenhuma consulta a `fichas_epi` é disparada.
 */
export const EPI_DISPONIVEL = false
