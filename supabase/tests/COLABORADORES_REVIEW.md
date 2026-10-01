# Colaboradores: scope and deployment review

## Business rule

The application's global admin (also called Super Admin by the business) cannot
read or manage company employees. Company and manager roles manage only their
own company; operational users only read. Inactive profiles and suspended
companies are denied. No functional employee route uses a secret/service key.

## Consumers

- Dashboard: employee counts are null/unavailable for admin, including an
  individually selected company. Other existing indicators remain unchanged.
- Empresas: employee counts are not displayed or exported for admin. The legacy
  company API still embeds a count under caller RLS; this is not an authorized
  global aggregate and is not used as one.
- Documentos: admin queries only unassigned company documents, without the
  employee join. Employee certificate and EPI actions are hidden.
- Exames and Treinamentos: the admin company selector does not mount individual
  employee views. Tenant views retain their existing services and nullable joins.
- Relatorios: admin exports omit individual training/exam sheets; company
  documents and existing summary metrics remain available. No new aggregate
  endpoint or RLS bypass was introduced.
- Shared employee query keys separate identity and permission, including disabled
  states, so changing role does not reveal an earlier authorized cache entry.

These UI adjustments do not redesign the legacy RLS of documents, exams,
training, EPI or Storage. Those services were not migrated to FastAPI.

## Migration 016

The SQL contains no business-data INSERT/UPDATE/DELETE. A transaction and table
locks protect the preflight and FK replacement. Invalid tenant/catalog references
abort without repair. Unknown employee policies also abort and roll back all DDL.
Compound unique constraints and compound FKs prevent cross-company references.
Column grants, policies and the write trigger protect employee identity, tenant,
CPF and admission date. DELETE/TRUNCATE are not granted to application roles.
Security-definer functions use an empty search path and qualified relation names.

`016_preflight_readonly.sql` is a review artifact, not an automatic deployment
command. It has NOT been executed remotely. Compare its results with 001–015:
expected FK names, absence of incompatible data, known policies, private schema,
grants and migration history. Investigate every divergence before applying 016.
The migration is not meant to be reapplied manually and can wait on table locks.

## Remaining limits for homologation

- Validate the integrated browser/FastAPI/PostgREST flow in an isolated staging
  environment, including relationship discovery after FK replacement.
- PGlite tests do not prove remote schema equality or concurrency behavior.
- No new global employee aggregate exists; admin employee indicators remain
  unavailable by the accepted business decision.
- Spreadsheet import remains sequential and partially successful; catalog
  creation is still direct Supabase access. It has no all-or-nothing transaction
  or detailed per-row API error report. The preexisting advertised 500-row limit
  is not enforced. CPF formatting/check digits and dismissal-before-admission
  checks were not changed in this task.
- Employee list pagination is not implemented; deployment must account for
  PostgREST's configured response limit.

No remote migration, real-data mutation or commit is part of this work.
