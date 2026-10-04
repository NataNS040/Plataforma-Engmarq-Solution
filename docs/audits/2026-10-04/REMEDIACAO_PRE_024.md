# Remediação conservadora pré-024 — 2026-10-04

**Ainda bloqueado pelo CNPJ. Situação A para as duas funções: contrato local incorreto para preservação do legado remoto.** Nenhum SQL remoto foi executado. Não houve deploy, commit/push ou início da 025. As migrations 015–023 continuam com os hashes aprovados. A 024 foi usada exclusivamente em banco sintético descartável pelos geradores/testes; não foi aplicada ao Supabase.

## 1. Diagnóstico dos três bloqueios

Resultado remoto informado pelo usuário: 333 OK, 98 ATENÇÕES, 3 BLOQUEIOS. Não foi fornecida a exportação das linhas de atenção. Portanto, este relatório não inventa uma distribuição numérica remota por grupo.

| Bloqueio | Diagnóstico | Tratamento pré-024 |
|---|---|---|
| get_user_empresa_id(), service=true | Corpo/hash e demais atributos conferem; expectativa service=false vem da fixture incompleta | Contrato alterado para service=true; preservar função e ACL remotas |
| get_user_role(), service=true | Mesmo diagnóstico | Mesmo tratamento |
| Empresa 5c114b79-bbd1-4829-b6ac-42da9f7362c0 | CNPJ 12.345.678/0001-99, canônico 12345678000199, DV inválido | Manter bloqueio; investigar identidade e uso antes de decidir correção |

Sem outras mudanças remotas, o novo contrato deve converter dois bloqueios em OK: projeção **335 OK / 98 ATENÇÕES / 1 BLOQUEIO**. Isso não é um novo resultado remoto e não autoriza aplicar a 024.

## 2. Funções: histórico, privilégios e consumidores

- Ambas criadas em `001_base_schema.sql:205–214`: SQL, STABLE, SECURITY DEFINER, consulta de `user_profiles` pelo `auth.uid()`. Nenhum GRANT/REVOKE explícito nessa criação.
- Migrations 002–020 não redefinem essas duas funções nem revogam explicitamente seu EXECUTE de service_role. Não há ALTER DEFAULT PRIVILEGES nas migrations 001–023.
- Ambas redefinidas em `021_documentos_empresas_security.sql:98–109`: referências qualificadas e search_path vazio; preservação explícita dos helpers dos módulos legados, sem nova semântica funcional. REVOKE de PUBLIC e anon; GRANT para authenticated. **Não há REVOKE de service_role.**
- 022 e 023 não alteram essas funções/ACLs.
- `CREATE OR REPLACE FUNCTION` preserva ownership e permissões existentes: [PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html). Grants padrão dependem do provisionamento do projeto e do owner: [Supabase — roles e privilégios](https://supabase.com/blog/postgres-roles-and-privileges). O proacl/default ACL remoto ainda não foi consultado; a origem exata de seu grant não pode ser certificada apenas com has_function_privilege.
- Histórico Git relevante: `f4a2212` (fundação), `adc1d72` (hardening multi-tenant); seed também aparece em `dfdaede`. Estes são commits existentes, não criados nesta tarefa.

**Conclusão A:** a expectativa service=false não traduz uma regra imposta por 001–023. A fixture cria service_role, mas não modela o EXECUTE legado dessas duas funções; a revogação de PUBLIC na 021 deixa service=false somente nesse ambiente sintético. Corrigimos a fixture específica da 024 com os dois grants antes da 021, modelando sua preservação, sem alterar a fixture compartilhada de outras migrations. O catálogo continua comparando service explicitamente; não foi ignorado nenhum atributo nem relaxado o hash.

**É intencional/necessário?** É intencional preservar privilégios legados na 021; não há evidência de uma decisão explícita de negócio que exija esse EXECUTE para service_role. Não encontramos necessidade funcional nos consumidores versionados. Ausência de necessidade não comprova drift nem autoriza hardening adicional na 024.

Consumidores históricos completos por módulo, todos em policies:

| Migration | Consumidores dos helpers |
|---|---|
| 001 | SELECT/UPDATE de empresas; SELECT/INSERT/UPDATE de user_profiles; SELECT/ALL de setores, funcoes, ambientes, colaboradores, documentos, treinamentos e matriz_treinamentos |
| 004 | Policies administrativas de empresas |
| 005 | Escrita de empresas e catálogos/colaboradores/documentos/treinamentos/matriz para role empresa |
| 007 | Policies de leitura/escrita de documentos e treinamentos; escrita de setores |
| 009 | SELECT/INSERT/UPDATE/DELETE de objetos do bucket documentos |
| 011 | SELECT/ALL de fichas_epi e fichas_epi_itens |
| 012 | SELECT/INSERT de objetos do bucket assinaturas |
| 013 | SELECT/INSERT de logos; escrita de ambientes |
| 018 | treinamento_tipos_read: can_access_catalogos(get_user_empresa_id()) |

Após 023, a reprodução local com EPI presente mantém **7 policies** que chamam esses helpers: `treinamento_tipos_read`, `fichas_epi_select`, `fichas_epi_write`, `fichas_epi_itens_select`, `fichas_epi_itens_write`, `assinaturas_storage_select`, `assinaturas_storage_insert`. Se EPI/assinaturas não existir, seus consumidores não existem. Outras policies foram substituídas nas remediações 014–022. Não foram encontradas funções chamadoras nos corpos SQL/PLpgSQL versionados, nem RPC/chamadas diretas desses nomes no backend/frontend. A reprodução e nomes completos constam em `pre-024-local-evidence.json`; não são uma leitura do catálogo remoto.

Frontend usa cliente anon com sessão do usuário; backend operacional usa JWT do usuário, sujeito a RLS. `backend/app/services/usuarios_service.py:create_usuario` usa `create_admin_client` após autorização; `backend/app/repositories/usuarios.py` usa Auth Admin e INSERT de user_profiles, sem RPC desses helpers. Triggers de provisionamento preservam operações privilegiadas; o role service_role com BYPASSRLS não depende dessas policies para operações de tabela usuais.

**Risco da revogação:** não foi identificada quebra no provisionamento versionado ou no backend usual. RPC direta com service_role passaria a falhar por permissão, mesmo sem BYPASSRLS mudar; funções SECURITY INVOKER ou consumidores externos não versionados também poderiam quebrar. Não é possível garantir ausência desses consumidores sem inspeção remota/operacional. Por isso não foi preparado REVOKE nem qualquer SQL de mutação remota.

## 3. Empresa com CNPJ inválido

Evidência concreta: `supabase/seeds/001_first_admin.sql:16–22` insere **Norveo Tecnologia e Gestão Ltda** com exatamente `12.345.678/0001-99`; o restante associa o primeiro administrador à empresa selecionada por esse CNPJ. O seed usa UUID gerado, não o UUID remoto fornecido. É um bootstrap de primeiro Admin, não um fixture explicitamente descartável. Inclusive pode executar UPDATE em uma empresa existente com o mesmo CNPJ.

Portanto, razão social **esperada pelo seed** está identificada, mas razão social **atual remota**, natureza teste/real e relações existentes continuam **não determinadas**. Não recomendamos remoção nem substituição de CNPJ. Nome coincidente ou Admin coincidente não provam que não existam dados reais.

SQL preparado, não executado: `supabase/tests/024_pre_remediation_empresa_readonly.sql`.

Ele mostra:

- empresa: ID, razão social, CNPJ, status, criação e flags de coincidência com seed;
- perfis: IDs, role, active, criação, existência no Auth e flags de coincidência de e-mail com seed; não expõe e-mails ou nomes pessoais;
- colaboradores: contagens por active;
- todas as tabelas com empresa_id, incluindo opcionais, catálogos, documentos, treinamentos e tabelas sem FK;
- contagens por todos os caminhos simples de FKs descendentes de empresas, incluindo vínculos indiretos e FKs compostas; inventário completo de FKs para verificar ciclos e regras de exclusão;
- Storage: contagens por bucket do prefixo da empresa;
- catálogos globais: contagens, explicitamente sem atribuí-los à empresa.

Contagens por caminho podem se sobrepor; não devem ser somadas. A consulta de FK conta entidades descendentes, não lista conteúdo, CPF ou URLs. Referências textuais sem empresa_id/FK, arquivos em caminhos fora do prefixo e integrações externas exigem investigação adicional se houver indicação de uso. Uso de catálogo global por esta empresa se evidencia nas linhas de documentos/treinamentos/matriz vinculadas; o catálogo global não deve ser removido por causa deste tenant. Auditor sem superuser/BYPASSRLS torna o inventário parcial e inadequado à decisão.

SQL complementar preparado: `024_pre_remediation_helpers_readonly.sql`: ACLs, hashes, default ACLs, policies, funções chamadoras, pg_depend e atributos dos roles. Somente evidência, sem autorização de execução por este agente.

## 4. Classificação das 98 atenções

As categorias de catálogo (SCHEMA, CONTRATO, CONSTRAINTS, INDICES, GRANTS, POLICIES, FUNCTIONS, TRIGGERS, STORAGE) também contêm linhas opcionais de EPI/Assinaturas. O preflight marca essas linhas como atenção mesmo quando conferem. Agrupá-las pelo objeto opcional evita interpretá-las como falhas de cada categoria.

| Grupo | Decisão para 024 | Pendência posterior |
|---|---|---|
| EPI/Assinaturas opcional, ausente ou contrato legado | Aceitável para fundação isolada, com revisão explícita e preservação da presença/ausência e fingerprints; não recriar módulo | Gates, Admin global e segurança de EPI/assinaturas ficam para 025/pre-produção; bloqueiam rollout público |
| Fingerprints de preservação, incluindo catálogo opcional | Esperados como baseline; salvar exportação completa antes da 024 | Comparar pré/pós imediatamente, antes de operações comerciais; qualquer diferença não prevista exige investigação |
| Inventário empresas/colaboradores | Informativo; volumes/ativos/históricos não são defeitos por si | Não criar limites/Free automaticamente; CNPJ inválido permanece bloqueio separado |
| Auth sem perfil | Revisar contagem e origem antes da 024; reconciliar identidade órfã se inesperada/operacional | Não criar perfil/bootstrap automaticamente; não é bloqueio SQL automático quando se trata de conta conhecida sem acesso operacional |
| Configuração Auth e schemas expostos | Conferir manualmente antes da aprovação: compatibilidade da configuração atual e engmarq_private fora dos schemas expostos | Fluxo de signup/onboarding e prontidão de produção devem ser validados antes de exposição pública; não habilitados pela 024 |
| Migration ledger | Conferir 015–023 e reconciliar sequência real antes da aprovação | Existência da tabela de ledger não comprova aplicação das versões; hashes locais não comprovam remoto |
| Backfill Free/concessões/limites | Atenção esperada: nenhum legado recebe Free nesta migration | Revisão comercial posterior explícita; zero backfill continua sendo critério pós-024 |
| Storage | Inventário de buckets é esperado; documentos/logos têm contrato obrigatório, sem bloqueios remotos informados | Assinaturas segue módulo opcional; buckets extras devem ser reconhecidos, preservados e revisados, sem alteração automática |
| Outra categoria/objeto não reconhecido | Revisão da linha original antes de aceitar | Não aceitar em massa simplesmente porque STATUS é ATENÇÃO |

Não existe base para declarar todas as 98 revisadas apenas com os totais. O arquivo de evidência contém grupos **locais** (99 atenções no cenário com três empresas); não os atribui ao remoto. A exportação integral do consolidado é necessária para fechar revisão por grupo, especialmente Auth, ledger, configuração e buckets extras.

## 5. Arquivos alterados/preparados

Alterados somente para contrato/testes da 024:

- `supabase/tests/fundacao-fixture.mjs`: reproduz os dois grants legados antes da 021.
- `supabase/tests/fundacao_024_consolidado.test.mjs`: regressão service=true, perda de grant/hash e inventário read-only.
- `docs/audits/2026-10-03/expected-024-{preflight,postflight}-catalog.json`: somente service=false → true para as duas funções.
- `supabase/tests/024_fundacao_{preflight,postflight}_readonly.sql`: mesmas duas expectativas.
- `supabase/tests/024_fundacao_preflight_consolidado_readonly.sql`: mesmas expectativas e hash atualizado da fonte.
- `supabase/migrations/024_fundacao_comercial.sql`: **apenas o manifesto de assertion embutido**, mesmas duas expectativas. Nenhum corpo de helper ou SQL funcional da migration mudou. Sem esta correção, a assertion da aplicação rejeitaria o mesmo legado mesmo após corrigir o preflight.

Novos: os dois SQLs read-only acima, `024_pre_remediation_local_audit.mjs`, este relatório, evidência JSON e log de testes em `docs/audits/2026-10-04/`. O audit local verifica contra HEAD que os manifests/SQLs mudam apenas as duas flags e que os hashes de 015–023 permanecem iguais. Não conecta a banco remoto nem carrega credenciais.

## 6. Validação e recomendação

Comando: `node --test supabase/tests/fundacao_024_consolidado.test.mjs supabase/tests/fundacao_024.test.mjs supabase/tests/fundacao_024_concurrency.test.mjs`. Resultado final: **63 testes, 62 aprovados, 0 falhas, 1 pulado**. Testes usam PGlite descartável; teste de concorrência real foi pulado por ausência de PostgreSQL local/psql. Evidência final em `pre-024-tests.log`.

Cobertura: pre/post e consolidado read-only; preservação de dados e Storage; EPI presente/ausente; CNPJ inválido/colisão; RLS e políticas; service EXECUTE preservado, perda de grant bloqueada e corpo divergente bloqueado; inventário descobre documentos, EPI indireto e uma tabela inesperada ligada por FK, sem expor CPF/nome de colaborador. O erro inicial de collation da CTE recursiva foi corrigido e o inventário validado novamente.

**Recomendação final: ainda bloqueado.** Os dois falsos bloqueios de privilégios foram corrigidos localmente. Próxima ação necessária: obter inventário read-only remoto da empresa e exportação completa das atenções, confirmar origem e dados reais, decidir o tratamento cadastral com evidência. Só depois de resolver o CNPJ e fechar as revisões, executar novo preflight completo. Não aplicar 024 neste estado; não iniciar 025.
