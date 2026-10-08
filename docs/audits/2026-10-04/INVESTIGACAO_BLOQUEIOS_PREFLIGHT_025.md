# Investigação local dos bloqueios do preflight 025

## Estado e limites da evidência

O usuário informou 937 OK, 181 ATENÇÕES e 5 BLOQUEIOS, mas forneceu somente quatro checks. A exportação remota da 025 não está no repositório. Os relatórios anteriores ainda registram resultado remoto não apurado; `supabase/tests/024_preflight_baseline_remoto_real.json` contém fingerprints de preservação, não o catálogo de funções/ACLs nem o resultado da 025. Não foi feita conexão com Supabase, execução de SQL remoto, apply em ambiente real, commit ou push.

HEAD consultado: `b8e6f3c270254ee37a73acc1c7829aad69fc8d5c`. Havia alterações locais e arquivos novos da implementação 025 antes desta investigação; eles não foram revertidos. Nenhuma migration 001–025 foi editada nesta investigação. SHA-256 da 025: `caecd750b51002721b33eab81d31ef4eda073124b2ed2b9e625ec0ac0828749e`. Os testes existentes aplicam migrations exclusivamente em fixtures locais descartáveis; isso não é uma aplicação no projeto Supabase.

**Não há evidência suficiente para declarar os cinco checks remotamente resolvidos ou projetar zero bloqueios.** Foi corrigida a representação de sequences e ampliada a coleta somente leitura. Nenhum objeto foi homologado apenas por nome, owner, hash informado ou semelhança com documentação.

## Tabela de investigação

| CHECK | ATUAL | ESPERADO original | ORIGEM PROVÁVEL | RISCO REAL | AÇÃO RECOMENDADA |
|---|---|---|---|---|---|
| `function:rls_auto_enable()` | Adicional; retorno `event_trigger`; postgres; SECURITY DEFINER; search_path pg_catalog; EXECUTE efetivo nos três papéis; hash `99be20677b456ea8d3be47bdd44fb369` | Ausente | Configuração externa de auto-RLS compatível com exemplo oficial Supabase; não criada pelas nossas 001–024 | EXECUTE não demonstra RPC explorável: função PL/pgSQL event trigger rejeita chamada SQL comum. Corpo e vínculo DDL desconhecidos ainda exigem revisão | Preservar; colher corpo, linguagem, ACL, dependência de extensão e event triggers com novo preflight. Depois comparar corpo e contexto; não excluir nem aprovar só pelo nome/hash |
| `grant:public.exames_catalogo_id_seq.anon` | SELECT/UPDATE e seis entradas de pseudocolunas no auditor antigo; USAGE não auditado | table/columns vazios | Defaults históricos do Supabase na criação SERIAL da 006 ou GRANT externo posterior | UPDATE permite setval e nextval caso exista execução SQL como anon; sequence não tem RLS. Não demonstra vazamento de linhas nem acesso HTTP direto | Inventariar ACL nativo e origem; manter divergência bloqueadora até revisão. Eventual redução de privilégios deve ser migration separada, revisada e testada |
| `grant:public.exames_catalogo_id_seq.authenticated` | Mesmo padrão | table/columns vazios | Mesma origem provável | Mesma capacidade; alteração do contador pode causar colisões/falhas em futuras inserções globais. Aplicação consultada só lê o catálogo | Mesma ação; não presumir que revogação é a correção |
| `grant:public.exames_catalogo_id_seq.service_role` | Mesmo padrão | table/columns vazios | Mesma origem provável | Papel técnico privilegiado; nextval pode ser necessário para inserts administrativos. UPDATE não equivale a acesso de usuário final | Preservar; avaliar dependências administrativas fora do repositório antes de qualquer redução |
| **Quinto check remoto: não fornecido**. Candidato reproduzido no auditor original: `EXECUTE: rls_auto_enable()` | Não conhecido remotamente. No cenário sintético original, SECURITY DEFINER com PUBLIC EXECUTE produz este quinto bloqueio | Check de EXECUTE exige ausência de concessão ampla em funções definer | Se confirmado: auditor genérico de funções comuns aplicado à função event trigger com EXECUTE padrão PostgreSQL | Falso positivo de classificação de superfície RPC **quando o tipo é event_trigger e a linguagem é PL/pgSQL**; o bloqueio separado de contrato continua justificando revisão do corpo DDL | Corrigido localmente para ATENÇÃO DDL_ONLY nesse tipo/linguagem; solicitar/exportar linha original. Novo resumo entrega todos os bloqueios; não declarar candidato como fato remoto |

## Origem de `rls_auto_enable()`

- Busca textual nas migrations 001–024: nenhuma definição ou referência a `rls_auto_enable`/`ensure_rls`.
- `git log --all -S rls_auto_enable -- supabase` e busca histórica de `ensure_rls`, DEFAULT PRIVILEGES e SEQUENCES nas migrations anteriores: nenhum commit estabelece a criação dessa função.
- Sua existência **pré-025 é confirmada pelo preflight informado**, desde que executado antes de qualquer aplicação; não é possível datar a instalação. PostgreSQL não registra timestamp de criação em pg_proc.
- A [documentação oficial Supabase](https://supabase.com/docs/guides/database/postgres/event-triggers) apresenta uma função desse nome para habilitar RLS em tabelas públicas novas, com retorno event_trigger, SECURITY DEFINER e search_path pg_catalog. Isso é compatibilidade, não prova de instalação automática nem identificação do administrador que a criou.
- Supautils permite gerenciar event triggers, mas isso não torna toda função de auto-RLS um objeto pertencente à extensão. O novo auditor consulta pg_depend/pg_extension para distinguir esse vínculo.
- Não há chamadas funcionais na aplicação ou nas nossas migrations. Um event trigger remoto pode depender dela e disparar durante DDL futuro; não removê-la. O catálogo antigo não inventariava pg_event_trigger. O novo auditor traz seus vínculos no próprio check de função.
- A fixture demonstra que a função PL/pgSQL event_trigger rejeita `SELECT public.rls_auto_enable()` antes de executar o corpo. A [documentação PostgreSQL de trigger functions](https://www.postgresql.org/docs/16/plpgsql-trigger.html) descreve o contexto especial de execução. Essa conclusão não autoriza aceitar um corpo desconhecido, outras linguagens ou um wrapper externo.
- O hash fornecido é MD5 de prosrc com normalização CRLF. Não informa extensão, instalação, triggers, grantees reais ou segurança do SQL dinâmico. O corpo completo deve ser revisado sem ser executado.

## Origem e estado esperado da sequence

1. `006_exames_catalogo.sql` cria `id SERIAL PRIMARY KEY`, portanto cria `public.exames_catalogo_id_seq`, e semeia o catálogo. Não contém GRANT/REVOKE da sequence nem ALTER DEFAULT PRIVILEGES. No Git, foi adicionada em `c8abe90`, em **2026-08-04 23:47:09 -03:00**, conforme o timestamp do commit; isso não data o deploy remoto.
2. A 007 recria a policy de leitura. A 023 restringe grants e policy da **tabela**, concedendo SELECT a authenticated. Nenhuma 001–024 altera o ACL da sequence. Revogar privilégios da tabela não revoga os da sequence.
3. O [bootstrap oficial Supabase](https://github.com/supabase/postgres/blob/develop/migrations/db/init-scripts/00000000000000-initial-schema.sql) contém default privileges para sequences de papéis de criação, concedendo ALL aos papéis técnicos/API. O comportamento depende da versão/configuração e do criador do objeto; não presumir todos os projetos idênticos.
4. No [PostgreSQL](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html), default privileges valem para objetos futuros criados pelo papel correspondente. O ACL atual e os defaults atuais não provam historicamente qual comando concedeu cada privilégio; grants manuais posteriores podem produzir o mesmo estado.
5. Em PostgreSQL puro sem esses defaults, a fixture original produz ACL vazio para os três papéis. Sob o bootstrap legado documentado, a execução local das 001–024 produz SELECT/UPDATE/USAGE para os três, e preserva os grants após a 023 e a 024. Ambos os resultados dependem do estado inicial do projeto. A expectativa vazia não é consequência universal das migrations.
6. A fixture antiga concedia ALL ON ALL TABLES, mas não ALL ON SEQUENCES. A ampliação de inventário da 025 passou a incluir sequences, porém reutilizou has_table_privilege/has_column_privilege. A representação resultante trata campos internos da sequence como colunas e omite **USAGE**. Esse defeito de cobertura foi corrigido; os defaults foram adicionados apenas como cenário opcional de teste, não como uma nova baseline remota.
7. `backend/app/repositories/exames.py` consulta `exames_catalogo` por SELECT, ordenando ordem/id. A 023 usa nomes do catálogo para validar ASOs. Não há chamadas nextval/setval nem CRUD do catálogo global na aplicação consultada. SELECT na tabela não precisa de SELECT/UPDATE/USAGE na sequence. Inserts administrativos fora da aplicação podem precisar de nextval; sua existência não pode ser excluída pelo Git.

### Risco e eventual proposta versionada

Conforme [PostgreSQL, funções de sequence](https://www.postgresql.org/docs/current/functions-sequence.html), UPDATE permite setval; USAGE ou UPDATE permite nextval. O teste local confirma setval sob anon quando o ACL legado existe. RLS da tabela não impede essa operação; setval não é revertido por rollback. Pode haver colisões de PK ou esgotamento do contador em futuras inserções administrativas.

Isso é uma **capacidade real no banco**, mas não prova exploração pelo frontend/REST: não foi identificada rota de SQL arbitrário, RPC wrapper de setval ou mecanismo de alteração do catálogo na aplicação. SELECT na sequence expõe seu contador, não os dados de ASOs. service_role é uma credencial técnica, não Super Admin funcional.

Se a coleta e revisão confirmarem privilégio excedente e acesso alcançável, propor uma migration separada de menor privilégio, explicitamente restrita a esta sequence: retirar capacidades desnecessárias de PUBLIC/anon/authenticated e conceder ao caminho técnico de inserção somente o que necessita. Avaliar defaults do papel criador separadamente; alteração de defaults não corrige ACLs existentes. Testar leitura/validação de ASOs, inserts administrativos, dependências e negação de setval aos clientes. **Nenhum SQL corretivo foi produzido para execução remota nem aplicado.** Não transformar defaults legítimos em vulnerabilidade demonstrada sem confirmar caminho de acesso e necessidade.

## Correções locais efetuadas

- `supabase/tests/025-catalog.mjs`: ACLs nativos de sequence com SELECT/UPDATE/USAGE, sem pseudocolunas. Comparação estrita preservada. Contrato de grants dos outros tipos preservado.
- `supabase/tests/025_contract_generate.mjs`: opção `--auditors-only`, regenerando auditores/catálogos sem escrever a migration pendente. O caminho padrão antigo continua disponível; não foi utilizado nesta investigação.
- `supabase/tests/025_manual_generate.mjs`: enriquece checks existentes com definição, linguagem, ACL, vínculos de event triggers/extensão e dependências; sequences trazem ACL nativo, defaults atuais e dependências. Acrescenta todas as linhas bloqueadoras em `RESULTADO_FINAL.DETALHES.bloqueios`, sem duplicar checks nem criar outro result set. O check EXECUTE de função PL/pgSQL event_trigger passa a ATENÇÃO DDL_ONLY; o check de contrato/corpo continua estrito e bloqueia funções desconhecidas. Outras linguagens e funções comuns não recebem essa classificação.
- `supabase/tests/025_manual_preflight.test.mjs`: allowlist inclui somente a leitura built-in has_sequence_privilege.
- `supabase/tests/tenant-fixture.mjs`, `remediation-fixture.mjs`, `fundacao-fixture.mjs`: cenário opcional de defaults legado antes da criação da 006; padrão anterior preservado.
- `supabase/tests/025_preflight_origin.test.mjs`: testa sobrevivência dos defaults pelas 001–024, USAGE isolado, ausência de homologação implícita, diagnóstico das origens, consolidação de todos os bloqueios e reprodução do candidato a quinto check sem executar seu corpo.
- `supabase/tests/package.json`: testes novos incluídos em test:025 e comando generate:025:auditors.
- Regenerados: `025_fundacao_preflight_readonly.sql`, `025_fundacao_postflight_readonly.sql`, `025_preflight_remoto_manual.sql`, `expected-025-preflight-catalog.json`, `expected-025-postflight-catalog.json`.

Os catálogos continuam sendo evidência estrutural sintética; não são baseline remota. A assertion embutida na migration 025 foi preservada e não deve ser considerada alinhada/aprovada para apply com esta investigação pendente. Uma revisão futura deverá alinhar o contrato da migration com o perfil validado antes de qualquer aplicação.

## Resultado esperado e execução manual

- Fixture padrão das 001–024: zero bloqueios locais.
- Fixture das 001–024 sob defaults legados documentados: três bloqueios de ACL, preservados para revisão de origem/necessidade.
- Mesmo cenário mais função PL/pgSQL event trigger não homologada: cinco bloqueios no auditor anterior, **quatro** no auditor corrigido; EXECUTE é ATENÇÃO, enquanto o corpo desconhecido continua BLOQUEIO. **Esse teste não identifica o quinto check remoto.**
- Remoto: **TOTAL_BLOQUEIOS não pode ser recalculado com a evidência disponível**; a correção de representação não remove permissões nem homologa funções. **Se** o quinto for o candidato, a função for PL/pgSQL e não houver outras diferenças, a projeção é **4**. Não projetar zero.
- Falso positivo confirmado: a representação/omissão de USAGE no auditor e a suposição de que ACL vazio é universal após 001–024. Os três grants remotos são compatíveis com estado legítimo, mas sua origem histórica e necessidade específica ainda não foram provadas. A classificação de EXECUTE de PL/pgSQL event_trigger como RPC foi corrigida; falta a linha remota para confirmar que ela é o quinto bloqueio informado.

O SQL está pronto **para nova coleta manual somente leitura**, não para declarar a 025 aprovada. Executar o arquivo completo `supabase/tests/025_preflight_remoto_manual.sql` no Supabase SQL Editor, como auditor integral. Contém BEGIN REPEATABLE READ READ ONLY, um WITH/SELECT consolidado e COMMIT; nenhuma mutation, nextval/setval, chamada de função desconhecida ou execução dos helpers CNPJ remotos. Exportar todas as linhas bloqueadoras, ou o JSON `bloqueios` da última linha, para completar a investigação. Preservar o resultado anterior.

Caminho absoluto:

`C:\Users\natap\OneDrive\Documentos\GitHub Pessoal e testes\Plataforma Engmarq\supabase\tests\025_preflight_remoto_manual.sql`

## Testes

Resultados registrados em `025-investigacao-tests.log` e `025-investigacao-backend-tests.log`, na mesma pasta deste relatório. O teste inicial de nova regressão falhou apenas por esperar redação diferente da mensagem PostgreSQL; a expectativa foi corrigida para a mensagem efetivamente emitida. Nenhum resultado de fixture substitui evidência remota ou concorrência PostgreSQL real.

Backend relacionado à 025, exames, catálogos e segurança: **155 passed**, uma depreciação existente de Starlette/httpx.

Suíte de banco completa, repetida depois do último ajuste: **592 testes contabilizados, 580 passed, 0 failed, 12 skipped**, em 167,27 s. Foram executados todos os 23 arquivos `*.test.mjs` de `supabase/tests`, com `node --test --test-concurrency=1`. Os 12 skips são o teste de concorrência real da 024 (sem DSN/psql local descartável) e os 11 da 025 (Docker local indisponível). Não há evidência nova de concorrência real; PGlite não a substitui. A primeira rodada completa também passou: 580/0/12, em 169,95 s; log preservado como `025-investigacao-tests-inicial.log`.

Os seis testes dos dois arquivos de preflight manual/origem passaram na suíte final, incluindo parser de exatamente três statements somente leitura, um único result set, ausência de chamada ao corpo desconhecido, ACLs nativos, USAGE isolado, classificação DDL_ONLY e consolidação de bloqueios. Os testes adversariais de funções definer comuns, policies, Storage, tenant, CNPJ e preservação continuam passando.

Verificação de preservação: os **24 hashes** do manifesto `PRESERVACAO_001_024_025A.json` conferem, **zero divergências**. SHA-256 da migration 025 permanece o registrado acima. SHA-256 do novo SQL manual: `8ac5ad3ba8cbf12ad62eb2b003d3d2e76aedcf06e76555598a409559030751b7`. `git diff --check` nos arquivos de fixture/package rastreados alterados: sem erros de whitespace.

Comandos de geração utilizados, exclusivamente locais:

```text
node 025_contract_generate.mjs --auditors-only
node 025_manual_generate.mjs
```

Backend, a partir de `backend`:

```text
.venv/Scripts/python.exe -m pytest tests/test_entitlements_025.py tests/test_exames.py tests/test_catalogos.py tests/test_security.py
```

**Pendência objetiva:** receber os checks remotos completos e a coleta de origem gerada pelo novo SQL. Até lá, não é possível informar causa raiz definitiva dos cinco, homologar a presença remota da função ou remover os três bloqueios de ACL de maneira justificada. Nenhum apply, correção remota ou push deve ser derivado deste relatório.
