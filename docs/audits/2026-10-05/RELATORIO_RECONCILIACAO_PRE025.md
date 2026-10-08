# Reconciliação do PRE-025 real — Fundação 025-A

Data: 2026-10-05. Escopo exclusivamente local. O usuário confirmou que a 025 não foi aplicada e forneceu o resultado remoto: 937 OK, 182 ATENÇÕES, quatro BLOQUEIOS, REPROVADO — NÃO APLICAR 025. A evidência recebida foi copiada integralmente, sem alteração de bytes, para `EVIDENCIA_REMOTA_PRE025_FORNECIDA.txt`.

Este relatório atualiza as conclusões da investigação anterior de 2026-10-04 com a nova evidência. Os relatórios anteriores foram preservados como histórico; suas pendências sobre o quinto check/corpo/ACL não substituem as decisões desta rodada.

## A) Classificação dos quatro bloqueios

| CHECK | CATEGORIA | CAUSA RAIZ | RISCO REAL | DECISÃO | EVIDÊNCIA |
|---|---|---|---|---|---|
| `function:rls_auto_enable()` | **A — FALSO POSITIVO DO CONTRATO** | O gerador em PostgreSQL/PGlite sintético não incluía a configuração externa de auto-RLS já existente no projeto | Definer de DDL; não é RPC SQL comum. O handler engole falhas de auto-RLS: não serve como garantia única de RLS | Preservar corpo e `ensure_rls`; incluir contrato estrito obrigatório PRE/POST; manter atenção informativa | Corpo, linguagem, owner, ACL, path e vínculo fornecidos; ausência nas 001–024/Git; testes de chamada negada e DDL com identidade maliciosa corretamente escapada |
| `grant:public.exames_catalogo_id_seq.anon` | **B — HARDENING NECESSÁRIO NA 025** | Fixture sem defaults de sequences criou expectativa vazia incompatível com o PRE real | SELECT expõe contador; USAGE/UPDATE permitem avançar; UPDATE permite reset/esgotamento com setval se SQL/RPC alcançar a operação. RLS da tabela não protege a sequence | PRE aceita exatamente SELECT/UPDATE/USAGE; POST exige nenhum desses privilégios efetivos | SERIAL da 006; nenhuma alteração de ACL dessa sequence nas 007–024; ACL/defaults remotos fornecidos; ausência de INSERT de clientes e de dependência da aplicação na sequence |
| `grant:public.exames_catalogo_id_seq.authenticated` | **B — HARDENING NECESSÁRIO NA 025** | Mesma lacuna do bootstrap sintético | Capacidade global independente do tenant quando existe caminho SQL; nenhuma necessidade para leitura autenticada do catálogo | PRE aceita os três privilégios; POST exige vazio; leitura da tabela e validação ASO permanecem | 023 revoga escrita e mantém somente SELECT da tabela para authenticated; testes negam INSERT antes/depois, sequence depois e preservam SELECT |
| `grant:public.exames_catalogo_id_seq.service_role` | **B — HARDENING NECESSÁRIO NA 025** | Mesma expectativa sintética vazia | UPDATE permite setval desnecessário ao uso técnico normal; SELECT permite ler estado global do contador | PRE aceita os três; POST mantém somente USAGE, suficiente para SERIAL/nextval/currval; resets são operação de owner/admin | Papel técnico BYPASSRLS com INSERT da tabela no contrato existente; INSERT com RETURNING id testado depois do hardening; setval/leitura direta negados |

Não há categoria C/D entre esses quatro checks com a evidência recebida. Isso não comprova ausência de qualquer risco externo nem autoriza a aplicação da 025. B é redução versionada de capacidade histórica, não declaração de exploração HTTP já demonstrada. A origem exata (data/autor) de comandos externos continua desconhecida; não é necessária para reconhecer o corpo/contexto revisado e o ACL legado precisamente coletado.

## B) rls_auto_enable

Busca no Git (`git log --all -S rls_auto_enable -- supabase/migrations`) e nas migrations 001–024 não encontra instalação ou chamada. Sua existência anterior à 025 está confirmada pelo usuário. A origem mais provável é configuração externa do projeto compatível com o [exemplo oficial Supabase](https://supabase.com/docs/guides/database/postgres/event-triggers); não afirmamos instalação automática, pertencimento a uma extensão ou autoria específica. Supautils possibilita a gestão de event triggers por postgres, mas essa capacidade não identifica quem instalou a função.

O corpo habilita RLS somente em tabelas/partições novas de public, nos três tags fornecidos. Não percorre nem modifica dados de negócio. SECURITY DEFINER fornece privilégios de postgres ao DDL fixo; `search_path=pg_catalog` impede shadowing em public. `cmd.object_identity` é produzido pelo PostgreSQL, schema-qualified e com cada identificador quoted quando necessário, conforme a [documentação de event trigger helpers](https://www.postgresql.org/docs/16/functions-event-triggers.html). `%s` é adequado para essa identidade completa já escapada; substituir por `%I` da string inteira seria incorreto. O teste com nome contendo aspas, ponto e vírgula e DROP confirma que o nome permanece identificador, sem executar o texto como comando extra.

PUBLIC EXECUTE não transforma RETURNS event_trigger PL/pgSQL em função invocável por SQL/RPC. O [compilador PostgreSQL](https://raw.githubusercontent.com/postgres/postgres/REL_16_STABLE/src/pl/plpgsql/src/pl_comp.c) rejeita execução comum desse pseudotipo antes do corpo; isso foi reproduzido sob anon/authenticated/service_role. Um endpoint que tente chamá-la como SELECT recebe erro; não é evidência de bypass. A criação/gestão de event trigger exige o contexto privilegiado próprio, que esse ACL isolado não concede.

Diferença relevante do exemplo oficial: o corpo coletado registra falha, mas não executa RAISE novamente. Assim, a criação pode prosseguir sem auto-RLS se ALTER TABLE falhar. Preservamos esse comportamento externo conhecido; as nossas migrations habilitam RLS explicitamente e o auditor verifica RLS efetivo. Não dependemos dessa função como única barreira. Sua ausência futura é BLOQUEIO de preservação do objeto conhecido, apesar de não ser dependência funcional do runtime.

PRE e POST exigem identidade public/rls_auto_enable(), retorno event_trigger, kind f, linguagem plpgsql, owner postgres, SECURITY DEFINER, volatilidade v, path pg_catalog, ACLs efetivos informados/PUBLIC EXECUTE, corpo aprovado e **todos** os vínculos de event trigger: exatamente ensure_rls, ddl_command_end, enabled O e os três tags ordenados. Corpo diferente, nome/schema diferente, ausência, trigger extra, mudança de tags/evento ou desativação bloqueiam. O check contratual é OK quando exato; a linha EXECUTE permanece ATENÇÃO DDL_ONLY.

O hash bruto anterior, `99be20677b456ea8d3be47bdd44fb369`, foi preservado como evidência histórica. O texto de pg_get_functiondef colado não preserva necessariamente a indentação de prosrc. Por isso o contrato desse objeto usa hash de **tokens lexicais ordenados**, `0de24df5c1137e470b28c2d0bb471b0c`, com esquema `lexical-tokens-v1`: ignora somente espaço entre tokens, preserva strings/identificadores quoted, palavras e operadores. Não remove espaço de literals, não mescla identificadores e não aceita corpos equivalentes arbitrários. Comentários ou outras diferenças conservadoras podem bloquear. Os demais hashes de funções permanecem brutos. O novo preflight também mostra raw_prosrc_md5 no diagnóstico, sem executar a função. A decisão de corpo/propriedades foi fixada independentemente em `reviewedRlsContract`; o gerador aborta se a fixture mudar, evitando homologação automática de uma nova definição.

## C) exames_catalogo_id_seq

`006_exames_catalogo.sql` cria id SERIAL, o catálogo e seus 27 registros. A migration foi adicionada pelo commit c8abe90 em 2026-08-04 23:47:09 -03:00; isso é data Git, não data de deploy. A sequence tem owner postgres conforme contrato já conferido no preflight, e é dependência do default do id. A 007 ajusta policy de tabela; a 023 restringe ACL/policy da tabela. Nenhuma 001–024 concede/revoga explicitamente os privilégios dessa sequence. Hits históricos de strings de catálogo em 024 não são comandos GRANT/DEFAULT PRIVILEGES.

Os defaults coletados para postgres/supabase_admin e o ACL efetivo são compatíveis com o [bootstrap Supabase](https://raw.githubusercontent.com/supabase/postgres/develop/migrations/db/init-scripts/00000000000000-initial-schema.sql). PostgreSQL puro não concede esses direitos de sequence aos clientes automaticamente. [Default privileges](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html) afetam objetos futuros do creator correspondente; um ACL/default atual não prova a data histórica de concessão. Sob esses defaults, o teste aplica localmente 001–024 e confirma a sobrevivência dos três privilégios. A causa do falso contrato era bootstrap incompleto, não antecipação intencional de hardening já existente: antes desta rodada a 025 não continha REVOKE dessa sequence.

Semântica de [privilégios PostgreSQL](https://www.postgresql.org/docs/16/ddl-priv.html) e [funções de sequence](https://www.postgresql.org/docs/16/functions-sequence.html):

- USAGE: nextval (avança) e currval/lastval (último valor da sessão); não permite setval nem leitura direta de last_value.
- SELECT: leitura direta da sequence e currval/lastval; não concede nextval nem setval por si só.
- UPDATE: nextval e setval; não é UPDATE de pseudocolunas/tabela. Pode resetar para colidir IDs ou avançar até esgotamento. Alteração de sequence não é desfeita por rollback.

| Papel | Atual remoto | PRE aceito | POST desejado | Justificativa específica |
|---|---|---|---|---|
| anon | SELECT, UPDATE, USAGE | Os três, exatamente | Nenhum | Sem leitura/escrita legítima do catálogo global; nenhuma necessidade de alocação de IDs |
| authenticated | SELECT, UPDATE, USAGE | Os três, exatamente | Nenhum | Somente consulta do catálogo/ASO; leitura da tabela não requer privilégios da sequence |
| service_role | SELECT, UPDATE, USAGE | Os três, exatamente | USAGE | Preserva inserção administrativa SERIAL e currval; leitura do contador/setval são tarefas de owner/admin |

O repository de exames faz SELECT com ordem/id; não foram encontradas chamadas nextval/currval/setval ou CRUD do catálogo global nos fluxos da aplicação. ACLs da sequence isoladamente não concedem INSERT na tabela. Os testes negam INSERT de anon/authenticated já no PRE e mantêm a negação no POST. Não foram alterados grants/policies de tabela.

PostgREST expõe relações dos tipos r/v/m/f/p, sem sequences S, no [código oficial consultado v12.2.3](https://raw.githubusercontent.com/PostgREST/postgrest/v12.2.3/src/PostgREST/SchemaCache.hs). RPC depende de funções em schemas expostos e privilégios, conforme a [documentação oficial](https://docs.postgrest.org/en/stable/references/api/functions.html). Não identificamos wrapper exposto para nextval/setval ou SQL arbitrário no repositório/contrato. Isso é análise estática: versão/configuração e chamadas HTTP reais não foram homologadas. Se houver SQL arbitrário, SQL injection ou wrapper externo alcançável, os ACLs PRE têm capacidade real; removê-los da sequence reduz o impacto sem alegar vulnerabilidade HTTP comprovada.

Não alteramos defaults globais: eles afetam futuros objetos e são infraestrutura compartilhada. O hardening é limitado à sequence já conhecida; defaults não recolocam grants em objetos existentes. Dropar/recriar esse objeto ou restaurar ACLs posteriormente gera drift no POST. O owner preserva controle administrativo. A inserção administrativa comum usa service_role e USAGE; rotinas externas de manutenção que façam setval/leitura do contador precisam usar owner/admin e não foram homologadas nesta etapa.

## D) Alterações locais

Arquivos existentes alterados nesta rodada (comparação com hashes anteriores à rodada, não com HEAD, que já tinha muitas mudanças do usuário):

1. `supabase/migrations/025_entitlements_quota_hardening.sql`
2. `supabase/tests/025-catalog.mjs`
3. `supabase/tests/025_contract_generate.mjs`
4. `supabase/tests/025_manual_generate.mjs`
5. `supabase/tests/025_manual_preflight.test.mjs`
6. `supabase/tests/025_preflight_origin.test.mjs`
7. `supabase/tests/fundacao-fixture.mjs`
8. `supabase/tests/package.json`
9. `supabase/tests/025_fundacao_preflight_readonly.sql`
10. `supabase/tests/025_fundacao_postflight_readonly.sql`
11. `supabase/tests/025_preflight_remoto_manual.sql`
12. `docs/audits/2026-10-04/expected-025-preflight-catalog.json`
13. `docs/audits/2026-10-04/expected-025-postflight-catalog.json`

Novos arquivos de código:

- `supabase/tests/025-reviewed-infrastructure.mjs`
- `supabase/tests/025_reconciliation.test.mjs`

Novos artefatos em `docs/audits/2026-10-05/`:

- `RELATORIO_RECONCILIACAO_PRE025.md`
- `EVIDENCIA_REMOTA_PRE025_FORNECIDA.txt`
- `025-reconciliacao-hashes-antes.json`
- `025-reconciliacao-resultados.json`
- `025-reconciliacao-especificos.log`
- `025-reconciliacao-banco-completo.log`
- `025-reconciliacao-backend.log`

Nenhum backend/frontend foi editado nesta rodada. Verificação final: 46 arquivos protegidos, zero divergências, incluindo as 24 migrations 001–024, evidências/relatórios anteriores (exceto os dois catálogos estruturais esperados intencionalmente regenerados) e o baseline remoto existente. SHA-256 final da 025: `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5`. SHA-256 final do preflight manual: `98ad6566523286e25c3eaf3a677d85786197c45edea803b2235436a455021d86`.

## E) Migration 025

**Alterada apenas localmente.** A assertion gerada agora representa o PRE real revisado, usando ACL nativo de sequence e o objeto externo conhecido. Após validar esse PRE, a migration revoga somente os privilégios desta sequence dos papéis PUBLIC/anon/authenticated/service_role e concede USAGE a service_role. Uma assertion de privilégios efetivos aborta a transação se herança deixar SELECT/UPDATE/USAGE em clientes ou SELECT/UPDATE em service_role. Não usa CASCADE nem altera memberships para resolver esse caso automaticamente. Nenhum comando de alteração de rls_auto_enable/ensure_rls foi inserido na migration. O contrato POST exige o resultado endurecido, mantendo a função/trigger intactos.

O gerador usa fixtures locais descartáveis para produzir contratos estruturais e executar testes; essas aplicações locais não são apply do projeto Supabase. As 001–024 foram preservadas byte a byte em relação ao início da rodada e ao manifesto anterior.

## F) Testes

Regressões específicas cobrem PRE/POST separados, ACLs nativos, leitura direta, nextval/currval/setval, INSERT negado a clientes antes/depois, INSERT técnico com RETURNING id após hardening, preservação de dados e da função, erro de invocation SQL sob API roles, tags CTAS/SELECT INTO, identificador adversarial, shadowing, body/literal drift, propriedades/vínculos/ausência e rollback diante de UPDATE herdado. Seis testes específicos passaram, sem skips/falhas. Parser/origem: seis testes passaram antes da rodada completa; a suíte integral repete os arquivos finais.

Backend relacionado: **155 passed, zero falhas**, uma depreciação existente Starlette/httpx. Log `025-reconciliacao-backend.log`.

Banco completo (todos os 24 arquivos `*.test.mjs`, incluindo RLS, contratos, adversariais da 025 e anteriores): **598 testes, 586 passed, zero falhas, 12 skipped**, em 206,28 segundos. Log `025-reconciliacao-banco-completo.log`. Os 12 skips são um teste de concorrência real da 024 e 11 da 025, sem o ambiente local necessário. Concorrência PostgreSQL real continua **DEFERIDA / NÃO HOMOLOGADA**; PGlite não substitui múltiplas conexões reais e skip não é pass.

## G) Novo preflight

Arquivo: `C:\Users\natap\OneDrive\Documentos\GitHub Pessoal e testes\Plataforma Engmarq\supabase\tests\025_preflight_remoto_manual.sql`.

Exatamente três statements: BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; um WITH/SELECT consolidado; COMMIT. Nenhuma DDL, DML, temp table, lock de escrita, mutation de sequence, RPC mutável, função de corpo remoto desconhecido ou credencial. A regex de tokens é somente leitura sobre pg_proc; o SQL não chama rls_auto_enable nem pg_event_trigger_ddl_commands. Fingerprints/FKs usam apenas SELECTs built-in previamente validados pelo parser.

TOTAL_BLOQUEIOS projetado para o estado remoto descrito: **0**, condicionado à correspondência exata do corpo/propriedades/vínculos fornecidos e aos demais checks já conferidos continuarem iguais. Isso é projeção local, não resultado remoto nem autorização de aplicação. EXECUTE DDL_ONLY continua ATENÇÃO. Mudanças relevantes posteriores voltam a BLOQUEIO.

## H) Baseline e riscos pendentes

Artefatos remotos/fingerprints já presentes foram preservados. A cópia textual da evidência nova é exata. As 47 pessoas ativas/zero inativas e buckets privados são fatos fornecidos, não dados sintetizados pela fixture. O histórico em `024_preflight_baseline_remoto_real.json` não foi promovido automaticamente a baseline PRE-025. A exportação integral atual de fingerprints PRE-025 não acompanhou o texto recebido: não inventamos seus valores. O template POST mantém baseline operacional vazio e bloqueia sem importação explícita do resultado PRE-025 real pelo importador existente; nenhuma fixture é embutida como baseline real. Importar posteriormente a exportação completa é pré-requisito da comparação futura, não atividade executada nesta etapa.

Pendências: concorrência PostgreSQL real; Auth/PostgREST/Storage HTTP real e schemas externos; rotinas administrativas fora do Git que dependam de SELECT/UPDATE da sequence; data/autor da instalação externa; falhas silenciosas do auto-RLS (compensadas por RLS explícito e auditoria de estado). Não iniciada a 025-B.

## I) GO / NO-GO

**GO PARA REPETIR PREFLIGHT REMOTO READ-ONLY** — manualmente pelo usuário. Não autoriza aplicar a 025.

## J) Confirmações

Nenhuma alteração/conexão/SQL remoto; migration 025 não aplicada no Supabase; nenhum postflight remoto; 025-B não iniciada; migrations 001–024 intactas; baseline/evidências remotos disponíveis preservados; nenhum commit; nenhum push. A única execução de migrations ocorreu em fixtures locais descartáveis de testes.
