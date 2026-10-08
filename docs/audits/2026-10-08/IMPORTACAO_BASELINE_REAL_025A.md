# Importação real PRE-025 e preparação do postflight

**BASELINE/POSTFLIGHT PRONTOS PARA REVISÃO REMOTA.** Isto não autoriza aplicar a migration. Nenhuma conexão ou execução no Supabase foi realizada nesta tarefa. O estado POST remoto ainda não foi coletado.

## Fonte e preservação

Fonte integral fornecida pelo usuário: attachment `7b5ad754-930e-4f8b-ad39-4a5be8160059/Pasted text.txt`. A importação preserva exatamente os bytes originais, incluindo espaços, strings, nulos, booleanos, números, arrays e objetos. Não houve reconstrução, substituição por fixture ou alteração do JSON.

- Arquivo definitivo: `docs/audits/2026-10-08/PRE025_REAL.json`.
- Tamanho: **909757 bytes**.
- SHA-256: `48411545910eddfff40896d368a2d6028d2303c3b2c602a4b44262b33094829f` (igual à fonte).
- Captura declarada no pacote: `2026-10-08T03:24:56.6548+00:00`.
- Envelope: array de um elemento com `BASELINE_PRE025`, versão 2, `approved=true`, `pre025=true`, `blocks=0` e hash da migration congelada.
- Conteúdo: 1123 checks únicos por categoria/check; 28 snapshots e 18 fingerprints de preservação. Inventário operacional completo, elegibilidade individual das 3 empresas e snapshots comerciais presentes.
- Contagens: **941 OK, 182 ATENÇÃO, 0 BLOQUEIO**. Conferem com o resultado informado. O pacote declara `blocks`; os outros totais foram calculados dos registros, não inseridos no JSON.
- Colaboradores: **47 ativos, 0 inativos, 0 com estado nulo**, total 47, consistente com snapshot. Distribuição entre as três empresas: 1, 46 e 0 ativos.
- Os cinco snapshots comerciais têm zero registros PRE: empresa_comercial, empresa_features, empresa_limites, empresa_uso e auditoria_comercial. As três empresas possuem previsão de legado, sete features SST explícitas, limite ilimitado e uso real. EPI não previsto. São evidências do pacote, não novas concessões.

Categorias: ATENCOES 2; BASELINE 29; BASELINE_ADICIONAL 20; BASELINE_COMERCIAL 5; CNPJ 2; CONTRATO_025 832; ESTADO 7; INTEGRIDADE 72; OPCIONAIS 78; PRESERVACAO 18; SEGURANCA 35; STORAGE 23.

## Artefatos e alterações desta tarefa

Criados:

- `supabase/tests/025_import_real_baseline.mjs`: importador offline por arquivo ou stdin, mkdir automático, validação antes da escrita, SHA-256, criação exclusiva e idempotência. Baseline ou SQL com hash diferente são recusados, sem sobrescrita silenciosa.
- `supabase/tests/025_import_real_baseline.test.mjs`: testes da importação, dados reais, stdin, consumo e ausência de POST. Usa banco PGlite descartável somente para a verificação local de ausência de POST; não representa integração remota nem nova homologação de concorrência.
- `docs/audits/2026-10-08/PRE025_REAL.json`: pacote integral real.
- `docs/audits/2026-10-08/025_postflight_REAL_readonly.sql`: SQL compilado pelo `withBaseline` existente, com pacote real incorporado em base64. SHA-256 `5d6c6fb5dda12ed250a523bfd1387ca860e7a0c98926023e251ab64a8691ef75`.
- Este relatório e os logs `025-import-real-tests.log`, `025-import-cli-final-tests.log`.

Alterado: `supabase/tests/package.json`, para comandos `import:025:baseline` e `test:025:import`.

O template `supabase/tests/025_fundacao_postflight_readonly.sql` mantém `[]` propositalmente: ele é reutilizável e não deve ser executado no lugar do artefato REAL. O importador existente `025_postflight_baseline.mjs` foi consumido sem alteração. Nenhum contrato do preflight foi modificado.

## Comparação e execução futura

O SQL REAL contém exatamente três statements: BEGIN REPEATABLE READ READ ONLY, WITH/SELECT consolidado, COMMIT. O parser verifica tokens executáveis e os SELECTs dinâmicos permitidos; não há DDL/DML ou chamada remota a cnpj_valido/cnpj_canonico. CNPJ é inspecionado por metadados/corpo e expressão independente.

Etapas no SQL: entrada PRE e coleta dos catálogos/fingerprints POST; comparação com contrato POST e projeção das colunas PRE; checks de estado/backfill/quota; checks de segurança, Storage, integridade referencial e cross-tenant; `raw`, `numbered`, `totals` e `final` para um único resultado consolidado. Divergências críticas recebem BLOQUEIO com evidência em DETALHES.

Verifica preservação operacional e dos registros comerciais PRE, somente adições previstas, elegibilidade individual, ausência de plano Free indevido/feature extra, contador real versus empresa_uso, contratos RLS/ACL/funções/triggers, sequence POST, infraestrutura rls_auto_enable, Storage, EPI/assinaturas, isolamento tenant e restrição do Super Admin à camada comercial. Testes adversariais cobrem alterações de dados, grants, event trigger, features, manifesto, auditoria e Storage.

Se executado antes da migration, o SQL falha com `42P01` por ausência de `engmarq_private.fundacao_025_legado`; não produz APROVADO. Isso foi testado localmente. Se o cliente mantiver a transação após um erro, encerrar com ROLLBACK antes de outra consulta. Não é um preflight e não deve ser executado agora para simular POST.

## Comandos e testes

Da raiz:

```powershell
npm --prefix supabase/tests run import:025:baseline -- "C:\Users\natap\.codex\attachments\7b5ad754-930e-4f8b-ad39-4a5be8160059\Pasted text.txt"
node supabase/tests/025_import_real_baseline.mjs docs/audits/2026-10-08/PRE025_REAL.json
npm --prefix supabase/tests run test:025:import
```

Para arquivo relativo com npm, prefira caminho absoluto: npm executa o script em supabase/tests. O destino é fixado pela localização do módulo e independe do diretório atual. Stdin: `node supabase/tests/025_import_real_baseline.mjs - < INPUT.json` em shell compatível com redirecionamento de stdin, ou fornecer stream pela API do processo; testado com spawn e pipe Node.

Regressão executada a partir de supabase/tests:

```text
node --test --test-concurrency=1 025_import_real_baseline.test.mjs 025_baseline_postflight.test.mjs fundacao_025.test.mjs fundacao_025_adversarial.test.mjs fundacao_025_security.test.mjs 025_preflight_origin.test.mjs 025_reconciliation.test.mjs
```

Resultado: **96 PASS, 0 FAIL, 0 SKIP**, log `025-import-real-tests.log`. Validação final do importador após acrescentar stdin e checks duplicados: **13 PASS, 0 FAIL, 0 SKIP**, log `025-import-cli-final-tests.log`. Há testes repetidos entre execuções; não somar esses números como testes únicos.

Cobertura: válido/vazio/inválido/truncado; envelope ausente; arquivo ausente; diretório/arquivo automáticos; bytes e valores preservados; hash divergente sem sobrescrita; idempotência; status/categoria/duplicatas/blocks/contagens inconsistentes; SQL consumindo exatamente o payload real; parser READ ONLY; POST inexistente. Regressão do postflight usa fixtures locais explicitamente identificadas e nunca as grava como baseline real.

## Freeze, divergências e pendências

Migration 025 antes/depois: `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5`. Todas as 24 migrations anteriores conferem com o manifesto `docs/audits/2026-10-04/PRESERVACAO_001_024_025A.json`. Preflight aprovado preservado: `98ad6566523286e25c3eaf3a677d85786197c45edea803b2235436a455021d86`.

Nenhuma divergência dos totais de referência encontrada. As 182 atenções reais permanecem integralmente no JSON; não foram removidas nem transformadas em OK. Não existe evidência POST remoto nesta entrega.

Procedimento manual futuro: revisar este relatório, o baseline e o SQL REAL; preservar seus hashes; validar que o pacote corresponde ao corte efetivo de dados. Se houver alterações operacionais desde a captura, exportar um novo PRE completo e tratar a substituição explicitamente, pois o importador recusará hash diferente. A aplicação depende de autorização separada e não é autorizada aqui. Somente após aplicação independentemente autorizada, executar **o arquivo completo** `docs/audits/2026-10-08/025_postflight_REAL_readonly.sql` no SQL Editor como auditor confiável, salvar o único resultado consolidado e investigar qualquer BLOQUEIO antes de encerrar a revisão. Não presumir resultado futuro aprovado.

Nenhuma migration aplicada nesta tarefa, nenhuma alteração remota, nenhum commit/push e nenhum início de 025-B.
