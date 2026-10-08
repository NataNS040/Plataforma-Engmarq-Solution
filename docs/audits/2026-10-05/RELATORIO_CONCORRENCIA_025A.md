# Concorrência PostgreSQL real — Fundação 025-A

Resultado: **CONCORRÊNCIA 025-A NÃO HOMOLOGADA**.

## A) Ambiente

O usuário confirmou preflight remoto aprovado: 941 OK, 182 ATENÇÕES, zero BLOQUEIOS, APROVADO PARA REVISÃO — NÃO AUTORIZA APLICAÇÃO. Nenhum contrato/auditor foi regenerado ou alterado nesta etapa.

Docker CLI instalado em Windows, mas `com.docker.service` está Stopped e não há processo Docker Desktop/postgres encontrado. Tanto `npipe:////./pipe/docker_engine` quanto `npipe:////./pipe/dockerDesktopLinuxEngine` retornam erro de pipe inexistente ao consultar o daemon. Há também aviso de acesso negado a `.docker/config.json`; nenhum conteúdo desse arquivo foi lido. `psql`, `postgres`, `pg_ctl` e `initdb` não foram encontrados no PATH; não há serviço PostgreSQL ou instalação na pasta padrão detectados.

Versão PostgreSQL efetivamente executada: **nenhuma**. Alvo do harness: imagem local `postgres:16`, versão 16.x validada no início se o banco puder subir. Imagem não pôde ser inspecionada porque o daemon está indisponível. Nenhum banco/container foi criado; nenhuma migration foi aplicada nesta etapa, nem em fixture. O before hook retorna indisponibilidade antes de chamar bootstrapSql.

Quando habilitado, o harness cria um container descartável de nome aleatório `engmarq-025-disposable-*`, sem rede, portas, mounts ou conexão externa, com database `engmarq_025_disposable`. Usa sessões psql independentes via docker exec; aplica bootstrap sintético das 001–024 e depois a 025 somente nesse banco real descartável. Os dados de teste são sintéticos; o mecanismo de execução deve ser PostgreSQL real, sem simular concorrência com PGlite. PGlite apenas gera o SQL de preparação existente, nunca fornece evidência de concorrência. O container é parado/removido no after hook. Cada operação Docker é agora fixada explicitamente ao endpoint local inspecionado.

## B) Resultado por cenário obrigatório

Todas as transações abaixo são previstas, **zero executadas nesta tentativa**.

| CENÁRIO | TRANSAÇÕES CONCORRENTES | RESULTADO ESPERADO | RESULTADO REAL | PASS/FAIL |
|---|---|---|---|---|
| 1. Duas criações com 99/100 | 2 previstas | Uma commit, uma P2502; uso real/materializado 100 | Não executado | SKIP |
| 2. Duas criações com 100/100 | 2 previstas | Ambas P2502; uso permanece 100 | Não executado | SKIP |
| 3. Criação + reativação com 99/100 | 2 previstas | Uma commit, uma P2502; uso 100 | Não executado | SKIP |
| 4. Duas reativações com 99/100 | 2 previstas | Uma commit, uma P2502; uso 100 | Não executado | SKIP |
| 5. Desligamento + criação com 100/100 | 2 previstas | Ambas commit, uso final 100 | Não executado | SKIP |
| 6. Desligamento + reativação | 2 previstas, ambas ordens cobertas | 100→100 ou 99→99, ambos commits | Não executado | SKIP |
| 7. Limite comercial + criação | 2 previstas, ordens/aumento/redução | Uso nunca excede limite; resultado exato por ordem | Não executado | SKIP |
| 8. Redução abaixo do uso + criação com 100/100 | 2 previstas | Redução e criação P2502; limite/uso mantidos em 100 | Não executado | SKIP |
| 9. Batch único de dois INSERTs + criação com 99/100 | 2 previstas | Batch P2502 sem linhas parciais; outra criação commit | Não executado | SKIP |
| 10. Rollback com criação concorrente | 2 previstas, mais rollback isolado | Primeira operação revertida, outra commit; contador exato | Não executado | SKIP |
| 11. Duas empresas alocando última vaga | 2 previstas | Ambas commit, quotas independentes, sem espera global | Não executado | SKIP |
| 12. Reexecução após abort | 2 aborts concorrentes, depois novas transações | Sem estado intermediário/locks persistentes; retry funciona | Não executado | SKIP |

Cobertura adicional inclui batches transacionais concorrentes, UPDATE multirow, isolamento entre tenants sem mudança de quota, manutenção multitenant com prelocks ordenados e REPEATABLE READ com 40001 esperado/abort seguro. Todos também foram SKIP.

## C) Quota

Nenhum valor antes/depois foi observado em PostgreSQL real. Limites 99/100/101 e contagens presentes no harness são **estados planejados**, não medições. Nenhuma transação aceita/rejeitada pelo PostgreSQL: o banco não iniciou.

Quando rodar, o harness registra `REAL_POSTGRES_ENVIRONMENT` e `REAL_POSTGRES_RACE`, com versão, isolamento/SQLSTATEs, before/after de limite/contagem real/empresa_uso e completion COMMIT/ROLLBACK. As assertions exigem contador=real, real≤limite e número exato de operações aceitas/rejeitadas; batches devem deixar zero linhas parciais. O teste de lost update exige os efeitos dos dois UPDATEs, não apenas o contador final.

## D) Locking

Nenhum lock foi observado nesta tentativa. Análise estática da migration, **não homologação**:

- Operações autenticadas de colaboradores prelockam empresas FOR NO KEY UPDATE no BEFORE STATEMENT; depois bloqueiam a linha alvo e empresa_uso FOR UPDATE.
- UPDATE comercial bloqueia sua linha de limite antes de chamar lock_quota e bloquear empresa_uso. O harness agora espelha essa ordem também na barreira comercial; não antecipa artificialmente o lock de empresa antes do limite.
- Operações de colaboradores consultam limite sem solicitar lock de sua linha, evitando aquele ciclo de dependências.
- Transições de UPDATE agrupam por empresa_id em ordem UUID. Manutenção privilegiada multitenant tem requisito explícito de prelock das empresas em ordem UUID antes de tocar colaboradores; a migration não impõe automaticamente essa ordem a todo SQL administrativo arbitrário.

O harness captura pg_stat_activity, pg_locks e pg_blocking_pids; exige que a segunda sessão esteja bloqueada **pela primeira sessão específica**, não por qualquer lock. O teste multitenant aplica a ordem documentada em duas sessões e executa mudanças de colaboradores em ordem inversa, verificando ausência de deadlock e lost update. A ordem anterior é hipótese do código até a execução real fornecer a evidência.

## E) Deadlocks/erros

Erro observado: falha ambiental ao conectar aos pipes locais Docker; PostgreSQL não executado. Portanto deadlocks, serialization failures e timeouts de banco **não foram avaliados**, não foram demonstrados ausentes.

Quando executado, o harness reprova 40P01, 55P03, 57014 e SQLSTATE inesperado nos cenários normais. P2502 é aceito somente como rejeição esperada de quota. Há um cenário separado REPEATABLE READ que exige exatamente um commit e um 40001, sem divergência de contador nem sessão persistente. Isso ainda não foi executado.

## F) Testes

Comandos executados em `supabase/tests`:

```text
node --check fundacao_025_concurrency.test.mjs
node --test fundacao_025_concurrency.test.mjs
```

Sintaxe JavaScript: válida. Concorrência real: **20 testes, zero passes, zero falhas, 20 skips**. Os 11 testes anteriores continuam sem execução real; ampliar cobertura não os homologou. Exit code zero do runner com SKIPs não representa aprovação. Log completo: `025-concorrencia-real-tentativa.log`. Não rodamos mocks/PGlite como substituto.

## G) Alterações desta etapa

1. `supabase/tests/fundacao_025_concurrency.test.mjs`: cobertura ampliada, endpoint Docker local fixado, evidências de quota/locks/SQLSTATE, ordem de barreira comercial e ator autorizado sintético do segundo tenant.
2. `docs/audits/2026-10-05/025-concorrencia-real-tentativa.log`: tentativa real, todos SKIP.
3. `docs/audits/2026-10-05/RELATORIO_CONCORRENCIA_025A.md`: este relatório.

Nenhuma assertion foi reduzida. As alterações de comportamento do harness ainda carecem de execução real. A migration 025 e o SQL de preflight aprovado permaneceram com hashes `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5` e `98ad6566523286e25c3eaf3a677d85786197c45edea803b2235436a455021d86`, respectivamente. As 24 migrations 001–024 conferem com o manifesto anterior, zero divergências.

## Procedimento mínimo para habilitar o ambiente

Abrir Docker Desktop em modo Linux containers e aguardar o engine ficar Running. Sem instalar outro banco ou configurar DSN de produção, validar o pipe Linux e baixar a imagem local:

```powershell
docker --host npipe:////./pipe/dockerDesktopLinuxEngine info --format '{{.ServerVersion}}'
docker --host npipe:////./pipe/dockerDesktopLinuxEngine pull postgres:16
```

Se Docker Desktop pedir habilitação/reboot de WSL2/virtualização, concluir apenas o requisito apontado pelo próprio aplicativo. Não é necessário alterar Supabase, abrir portas ou fornecer credenciais. O aviso de `.docker/config.json` deve ser distinguido da ausência do daemon; o endpoint explícito evita depender do contexto inacessível desta sessão.

Depois, a partir de `supabase/tests`, executar com requisito estrito de PostgreSQL real:

```powershell
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$env:REQUIRE_REAL_POSTGRES = '1'
npm run test:concurrency025
```

O modo REQUIRE_REAL_POSTGRES=1 torna ambiente ausente uma falha explícita; não transforma SKIP em PASS. Só uma nova execução real completa poderá autorizar o veredito de concorrência. Pode haver ajustes locais adicionais no harness quando surgirem erros reais; esta preparação não declara o bootstrap homologado em PG16.

## H) Veredito

**CONCORRÊNCIA 025-A NÃO HOMOLOGADA**.

Nenhum Supabase remoto foi acessado ou alterado, nenhuma migration aplicada no remoto, nenhum teste destrutivo remoto, nenhuma 025-B, commit ou push. O preflight remoto aprovado permanece preservado e não autoriza apply.
