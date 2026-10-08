# Fundação 025-A — bootstrap corrigido e concorrência PostgreSQL real

## A) Causa raiz

O docker run configurava corretamente POSTGRES_DB=engmarq_025_disposable e o psql usava esse mesmo nome. Não havia divergência de nomes ou DROP DATABASE. O healthcheck anterior executava pg_isready somente com -U postgres, via socket, sem especificar o banco alvo. Ele podia aceitar o **servidor temporário de inicialização** antes de docker_setup_db criar POSTGRES_DB. O before hook então tentava conectar ao banco ainda inexistente.

A leitura do entrypoint da imagem usada confirmou a ordem: docker_temp_server_start (listen_addresses vazio, apenas Unix socket), docker_setup_db, scripts de inicialização, docker_temp_server_stop e servidor definitivo. pg_isready não basta para comprovar existência/acesso ao banco. Cleanup ocorre no after hook; não causou a falha de criação.

## B) Correção local

Único arquivo de código alterado nesta etapa: `supabase/tests/fundacao_025_concurrency.test.mjs`.

- Nome do banco definido uma vez e compartilhado pelo docker run, readiness e psql.
- pg_isready usa -h 127.0.0.1 -d engmarq_025_disposable **dentro do container sem rede**; não alcança o servidor temporário socket-only.
- Readiness exige consulta real SELECT current_database() no alvo, além de SELECT version(), com deadline de 60 segundos e erro explícito/logs se falhar.
- Todas as conexões psql dos cenários usam o servidor definitivo via TCP loopback interno.
- Bootstrap valida cinco tabelas, oito funções, seis triggers de colaboradores e dois triggers de quota/comercial, habilitados, antes dos cenários.
- Diagnóstico imprime versão, current_database, nome/ID do container, schema/migrations carregados e confirmação descartável; nenhum segredo.

A primeira tentativa local após essa correção passou no bootstrap, mas revelou um erro adicional de infraestrutura em race: a variável local `const state` ocultava a função state() e provocava ReferenceError antes de iniciar a concorrência. Quatro testes registraram esse erro; interrompemos a tentativa e removemos seu container. Renomeamos somente a variável para summary, preservando as mesmas consultas e assertions. Em seguida repetimos os 20 testes integralmente.

**Nenhuma assertion de concorrência foi reduzida ou alterada; nenhuma migration/contrato/auditor foi editado.**

Artefatos desta etapa:

1. `supabase/tests/fundacao_025_concurrency.test.mjs`
2. `docs/audits/2026-10-05/025-concorrencia-bootstrap-corrigido.log` — tentativa intermediária, preservada com o ReferenceError.
3. `docs/audits/2026-10-05/025-concorrencia-real-final.log` — execução real completa.
4. `docs/audits/2026-10-05/025-concorrencia-real-resultados.json` — resultados e amostras de locks estruturados.
5. `docs/audits/2026-10-05/RELATORIO_CONCORRENCIA_REAL_025A_POSTGRES16.md` — este relatório.

## C) Ambiente real

- PostgreSQL **16.15**, Debian 16.15-1.pgdg13+2, x86_64, 64-bit.
- Docker local, endpoint npipe:////./pipe/dockerDesktopLinuxEngine; Docker Server 29.1.3.
- Imagem postgres:16 previamente baixada pelo usuário.
- Database engmarq_025_disposable.
- Container da execução final: engmarq-025-disposable-c8dfbb55.
- Container ID: 70d270be825e6d2b182680b25a8b4d3b09ae6ba5cf329fc99a50d2dc0ccada81.
- Criado com --rm, --network none, sem publicação de portas, mounts ou DSN externo.
- Bootstrap Auth/Storage e dados sintéticos; SQL real das migrations 001–024 e 025 preservado e executado nesse PostgreSQL. PGlite apenas captura os statements de preparação do helper existente; não executa os cenários de concorrência nem substitui sessões PostgreSQL.
- Antes dos cenários: tables=5, functions=8, collaboratorTriggers=6, quotaTriggers=2. Assertion do contrato pré-025 e execução da 025 concluídas no banco descartável.
- Sessões concorrentes psql independentes, mais sessão observadora para pg_locks/pg_stat_activity/pg_blocking_pids.
- Container final removido pelo after hook; container intermediário também removido. Consultas docker ps -a específicas para ambos retornaram vazio.

Não era produção e não houve acesso ao Supabase remoto.

## D) Resultados dos 20 cenários

A/R = commits aceitos / transações rejeitadas; rollback explícito indicado separadamente. L/R/U = limite / ativos reais / empresa_uso. Os números são resultados reais, não projeções.

| # | CENÁRIO | RESULTADO ESPERADO | RESULTADO REAL | PASS/FAIL |
|---|---|---|---|---|
| 1 | 99: aumento de limite + criação | Ambos commits; limite 101, ativos 100 | L/R/U 100/99/99 → 101/100/100; A/R 2/0 | PASS |
| 2 | 100: desligamento + criação | Ambos commits; vaga reutilizada | 100/100/100 → 100/100/100; A/R 2/0 | PASS |
| 3 | 98: reativação multirow concorrente dos mesmos registros | Dois commits sem dupla contagem | 100/98/98 → 100/100/100; A/R 2/0 | PASS |
| 4 | 99: duas criações | Exatamente uma aceita | 100/99/99 → 100/100/100; A/R 1/1 | PASS |
| 5 | 100: duas criações | Ambas rejeitadas | 100/100/100 preservado; A/R 0/2 | PASS |
| 6 | 99: duas reativações | Exatamente uma aceita | 100/99/99 → 100/100/100; A/R 1/1 | PASS |
| 7 | 99: criação + reativação | Exatamente uma aceita | 100/99/99 → 100/100/100; A/R 1/1 | PASS |
| 8 | 100: desligamento + reativação | Ambos commits | 100/100/100 preservado; A/R 2/0 | PASS |
| 9 | 99: reativação + desligamento | Ambos commits | 100/99/99 preservado; A/R 2/0 | PASS |
| 10 | 100: redução para 99 + criação | Ambas rejeitadas; limite original mantido | 100/100/100 preservado; A/R 0/2 | PASS |
| 11 | 99: batch único de duas linhas + criação | Batch falha inteiro; outra criação aceita | 100/99/99 → 100/100/100; A/R 1/1; zero linhas do batch | PASS |
| 12 | 98: dois batches transacionais de duas linhas | Um batch commit, outro abort integral | 100/98/98 → 100/100/100; A/R 1/1 | PASS |
| 13 | 99: redução para 99 antes da criação | Redução aceita; criação rejeitada | 100/99/99 → 99/99/99; A/R 1/1 | PASS |
| 14 | 99: criação antes da redução para 99 | Criação aceita; redução rejeitada | 100/99/99 → 100/100/100; A/R 1/1 | PASS |
| 15 | Rollback isolado e rollback com criação concorrente | Sem linhas/contador residuais | Isolado permanece 100/99/99; concorrente termina 100/100/100, um rollback e um commit | PASS |
| 16 | Tenants distintos sem serialização global | UPDATE do tenant 102 conclui enquanto 101 mantém lock | UPDATE concluído com lock_timeout 300ms; detentor termina normalmente | PASS |
| 17 | Retry após abort por quota | Dois aborts, depois desligamento/retry sem lock residual | Dois P2502; estado 100/100/100 preservado; retry aceito; zero sessões antigas | PASS |
| 18 | REPEATABLE READ | Um commit, outro 40001; abort seguro | 100/99/99 → 100/100/100; A/R 1/1; zero sessões antigas | PASS |
| 19 | Última vaga de empresas distintas | Ambos commits, quotas independentes | Tenant 101: 100/100/100; tenant 102: 2/2/2; dois commits | PASS |
| 20 | Manutenção multitenant com prelocks UUID e linhas em ordem inversa | Dois commits, sem deadlock/lost update | Tenant 101: 100/99/99; tenant 102: 2/2/2; nomes de ambas linhas preservam sufixos A B | PASS |

## E) Concorrência e locking

Contagem real e empresa_uso permaneceram iguais em todas as assertions; nenhuma operação aceita elevou ativos acima do limite. Nos casos 99/100, somente uma criação/reativação concorrente ganhou a última vaga. Com 100/100, ambas criações foram rejeitadas. Os cenários de alteração comercial respeitaram as duas ordens e rejeitaram redução abaixo do uso, sem write skew que violasse quota.

Último estado validado antes da remoção do container:

| Tenant sintético | Limite | Ativos reais | empresa_uso |
|---|---:|---:|---:|
| UUID terminando em 101 | 100 | 99 | 99 |
| UUID terminando em 102 | 2 | 2 | 2 |

As amostras reais mostram RowShareLock em empresas (e no limite quando o primeiro ator é comercial), RowExclusiveLock de colaboradores, tuple lock em empresas e espera ShareLock não concedida sobre o transactionid do detentor. pg_blocking_pids identifica especificamente a primeira sessão como bloqueadora da segunda. PgSleep/Timeout nos detentores é a barreira intencional do harness, não timeout SQL.

Ordem aplicada: colaborador autenticado prelocka empresas FOR NO KEY UPDATE antes da linha alvo e empresa_uso FOR UPDATE. Comercial começa pela linha do limite, depois empresa e uso; o colaborador consulta limite sem adquirir lock dessa linha. As amostras capturam a barreira/espera em empresa/transactionid; a ordem posterior de empresa_uso é a definida no SQL real executado, não uma amostra temporal de cada lock interno.

Para manutenção privilegiada com mais de uma empresa, o teste aplica o requisito documentado de prelock UUID 101 → 102 antes das linhas, mesmo tocando colaboradores em ordem inversa. Ambos os UPDATEs sobrevivem como A B, sem lost update. Isso homologa esse protocolo, não SQL administrativo arbitrário que ignore os prelocks.

Zero deadlocks 40P01, lock timeouts 55P03, statement cancellations 57014 ou SQLSTATE inesperado na execução final. Houve um 40001 esperado em REPEATABLE READ, com abort seguro, e 13 rejeições P2502 esperadas nos registros de race. P2502 representa rejeição esperada de quota, não falha de teste. Batch/rollback não deixaram inserção parcial, contador divergente, sessão persistente ou bloqueio que impedisse retry.

## F) Testes

Comando real, com DOCKER_HOST local explícito e REQUIRE_REAL_POSTGRES=1:

```text
npm run test:concurrency025
```

Execução final: **20 passes, zero fails, zero skips, zero cancelled**, 452.047,8531 ms (7min32s). Nenhum antigo SKIP foi promovido por inferência: os 20 corpos de teste executaram em PostgreSQL e passaram. Tentativa intermediária preservada: quatro falhas ReferenceError do harness antes da concorrência; interrompida, erro corrigido e execução integral repetida. Nenhuma falha de quota foi escondida ou transformada em SKIP.

node --check passou. git diff --check no arquivo do harness não apontou whitespace inválido.

## G) Veredito

**CONCORRÊNCIA 025-A HOMOLOGADA** no escopo dos 20 cenários e do protocolo de locks documentado. Esta evidência não homologa Auth/PostgREST/Storage HTTP nem autoriza aplicação remota da 025.

## H) Confirmações

Nenhuma ação remota; 025 não aplicada remotamente; 025-B não iniciada; nenhum commit/push. As 24 migrations 001–024 continuam com os hashes do manifesto anterior, zero divergências. SHA-256 da 025 permanece `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5`; preflight remoto aprovado permanece `98ad6566523286e25c3eaf3a677d85786197c45edea803b2235436a455021d86`.
