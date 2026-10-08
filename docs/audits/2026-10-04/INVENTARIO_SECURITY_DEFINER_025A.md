# Inventario SECURITY DEFINER 025-A

Evidencia local sintetica; owner real, ACLs, membresias e schemas expostos: VALIDAR NO PREFLIGHT REMOTO.

Todas as funcoes abaixo usam search_path vazio. PUBLIC EXECUTE das funcoes novas foi revogado; privileges efetivos de anon/auth/service constam do contrato. SQL nao pode impedir superuser/owner de desabilitar triggers.

| Funcao | Owner local | anon | authenticated | service_role | Argumentos e fronteira |
|---|---|---|---|---|---|
| `get_user_empresa_id()` | postgres | False | True | True | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `get_user_role()` | postgres | False | True | True | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `provisionar_perfil_interno(uuid,uuid,text,user_role)` | postgres | False | False | True | actor_id somente service_role confiavel; tenant derivado do profile bloqueado; nao aceita empresa_id; Auth verificado no banco |
| `reservar_arquivo_sst(text,text)` | postgres | False | True | False | feature/extensao whitelist; auth.uid e profile ativos; tenant derivado; nao recebe tenant |
| `engmarq_private.account_colaborador_delete()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.account_colaborador_insert()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.account_colaborador_statement()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.audit_commercial_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.can_access_catalogos(uuid,boolean)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_access_certificado(text,boolean)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_access_colaboradores(uuid,boolean)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_access_documento(text,boolean)` | postgres | True | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_access_documento_row(uuid,boolean)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_access_empresa(uuid,boolean,boolean)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_access_logo(text,text,jsonb)` | postgres | True | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_manage_profile(uuid,user_role)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_read_exames_catalogo()` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_read_foundation(uuid)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_use_documento_object(text,boolean)` | postgres | True | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.can_use_feature(uuid,text,boolean)` | postgres | True | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.documento_feature(uuid)` | postgres | False | True | False | UUID de tipo global; somente chave do modulo; nao retorna documento/tenant |
| `engmarq_private.guard_aso_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_catalogo_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_colaborador_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_commercial_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_diagnostico_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_documento_feature()` | postgres | False | False | False | UUID de tipo global; somente chave do modulo; nao retorna documento/tenant |
| `engmarq_private.guard_documento_metadata()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_documento_reference()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_empresa_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_profile_update()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_treinamento_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.guard_uso_write()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.has_empresa_feature(uuid,text)` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.is_commercial_admin()` | postgres | False | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.lock_colaborador_statement()` | postgres | False | False | False | somente trigger; argumentos impossiveis ao cliente; NEW/OLD validados; quota tecnica tambem verificada |
| `engmarq_private.lock_quota(uuid)` | postgres | False | False | False | tenant/path explicito; somente owner; nunca RPC cliente |
| `engmarq_private.logo_update_identity(uuid,text,text)` | postgres | True | True | False | predicate booleano de RLS; argumento tenant/path nao autoriza acesso por si; profile derivado de auth.uid; grants/policies continuam obrigatorios |
| `engmarq_private.reconciliar_uso(uuid)` | postgres | False | False | False | tenant/path explicito; somente owner; nunca RPC cliente |
| `engmarq_private.storage_features(text)` | postgres | False | False | False | tenant/path explicito; somente owner; nunca RPC cliente |
