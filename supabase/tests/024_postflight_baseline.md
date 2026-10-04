O `024_fundacao_postflight_readonly.sql` inteiro entrega um único result set,
com todos os checks e quatro linhas de resumo. A última é `RESULTADO_FINAL`.
A transação é `REPEATABLE READ READ ONLY`.

Para comprovar preservação, use os fingerprints exportados do preflight
correspondente deste mesmo banco, capturados antes da aplicação da 024.
Não use evidências sintéticas dos testes como baseline remoto.

Exporte o resultado do `024_fundacao_preflight_consolidado_readonly.sql` como
um array JSON. O formato original também é aceito, desde que contenha todos
os fingerprints. Gere uma cópia pronta para execução manual, somente offline:

```powershell
node supabase/tests/024_postflight_baseline.mjs preflight-real.json postflight-com-baseline.sql
```

O utilitário não conecta ao banco e não sobrescreve arquivo existente.
Alternativamente, substitua `'[]'::jsonb` entre os marcadores
`BEGIN/END PREFLIGHT BASELINE JSON` pelo array JSON exportado, escapando
apóstrofos como `''` dentro do literal SQL.

Baseline fornecido: igualdade exata = OK; fingerprint divergente, ausente,
duplicado ou objeto desaparecido = BLOQUEIO. Isso inclui dados, presença e
catálogo opcional de EPI/Assinaturas. Empresas excluem do fingerprint somente
os campos novos previstos pela 024; endereço e derivação CNPJ têm checks próprios.

Sem baseline (`[]`), fingerprints continuam ATENÇÃO: não há comprovação de
preservação. A regra solicitada para o resumo continua dependente somente de
BLOQUEIO; a mensagem de aprovação não dispensa a revisão das ATENÇÕES.
Os checks de contrato opcional EPI/Assinaturas continuam ATENÇÃO conforme o
contrato real; a comparação de preservação é um check separado e pode bloquear.

Teste local: `npm --prefix supabase/tests run test:postflight024`.
Nenhum destes comandos aplica migrations ao Supabase remoto.

## Artefato remoto real pronto para revisão manual

SQL a executar integralmente: `024_fundacao_postflight_remoto_com_baseline.sql`.
Baseline: `024_preflight_baseline_remoto_real.json`, extraído literalmente do
JSON fornecido pelo usuário, capturado no remoto imediatamente antes da 024.
Nenhum fingerprint foi recalculado ou obtido de fixtures/estado pós-024.
O SQL foi gerado offline com `withBaseline()`; o fonte genérico mantém `[]`.
São 17 checks obrigatórios únicos: 15 hashes MD5 e dois resultados de ausência
esperada (`fichas_epi` e `fichas_epi_itens`), preservados exatamente.

Proveniência informada: TOTAL_OK=336, TOTAL_ATENCOES=98,
TOTAL_BLOQUEIOS=0, RESULTADO_FINAL=APROVADO PARA REVISÃO.
SHA-256 registrado na saída original:
`13bbf6b0118b8ac04c3b5cb835d2a37549220a71b00a7fffb7edc0a950847751`.
Esse SHA é o registro informado do preflight, não um hash do JSON ou do SQL final.

Validação local em 2026-10-04:

- `npm --prefix supabase/tests run test:postflight024`: 5 aprovados,
  0 falhos, 0 skipped. Inclui igualdade integral do artefato com
  `withBaseline(fonte, baseline real)` e validação dos 17 checks.
- `node --test supabase/tests/fundacao_024.test.mjs supabase/tests/fundacao_024_consolidado.test.mjs supabase/tests/fundacao_024_concurrency.test.mjs`:
  62 aprovados, 0 falhos, 1 skipped.
- Total: 67 aprovados, 0 falhos, 1 skipped. Concorrência PostgreSQL real
  permanece pendente/deferida: ausência de DSN/psql para PostgreSQL local
  descartável; PGlite não comprova concorrência. Não conta como aprovação.

O artefato tem três statements: BEGIN REPEATABLE READ READ ONLY,
uma consulta WITH/SELECT e COMMIT. Exatamente um result set operacional,
com ORDEM, CATEGORIA, CHECK, RESULTADO, STATUS, DETALHES;
RESULTADO_FINAL é a última linha. Sem DDL/DML ou escrita.
Drift de dados/presença/catálogo EPI continua BLOQUEIO na preservação;
ATENÇÕES contratuais opcionais não mascaram essa comparação.

A revisão da migration 024 e os testes de preservação confirmam ausência de
backfill ou alteração intencional dos valores operacionais legados cobertos.
Ela adiciona a empresas CNPJ derivado, constraints e campos de endereço,
além de contratos/funções/trigger previstos pela Fundação. Somente os seis
campos novos são excluídos do fingerprint de empresas; endereço novo NULL
e derivação CNPJ são avaliados separadamente. O seed ocorre em features novo.
Isso não dispensa a comparação real pré/pós na execução manual.

Nenhuma conexão/execução remota foi realizada nesta preparação. Migrations
foram executadas somente nas fixtures locais dos testes existentes.
Nenhuma migration foi modificada; nenhum commit/push foi realizado.
Antes da execução manual, revisar as ATENÇÕES existentes do relatório e
manter a homologação de concorrência explicitamente pendente.

## Fechamento da Fundação 024

Em 2026-10-04, o usuário confirmou que a migration 024 já foi aplicada com
sucesso no Supabase remoto e que executou o postflight final com o baseline
real pré-024 incorporado. Resultado remoto informado:

- TOTAL_OK = 527
- TOTAL_ATENCOES = 81
- TOTAL_BLOQUEIOS = 0
- RESULTADO_FINAL = `024 VALIDADA — APROVADO PARA REVISÃO FINAL`

A auditoria remota da Fundação 024 está concluída com zero bloqueios.
As 81 ATENÇÕES permanecem registradas e não equivalem a bloqueios.
O teste real de concorrência PostgreSQL permanece DEFERIDO/SKIPPED por
ausência de instância PostgreSQL local descartável; não foi aprovado.
Os testes locais foram repetidos antes do commit de fechamento.
Suíte principal (Fundação, consolidado, postflight e concorrência):
67 aprovados, 0 falhos, 1 skipped. Testes adicionais de remediação CNPJ
e inventário pré-remediação: 20 aprovados, 0 falhos, 0 skipped.
Total do fechamento: 87 aprovados, 0 falhos, 1 skipped (concorrência real).
Esta etapa de fechamento no Git não executa SQL ou migrations no remoto,
não modifica a migration 024 e não inicia a 025.
