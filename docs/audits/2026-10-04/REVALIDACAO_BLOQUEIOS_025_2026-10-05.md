# Revalidação local em 2026-10-05

A investigação e as correções do auditor já estavam presentes no workspace ao iniciar esta rodada. Foram inspecionadas e os SQLs foram regenerados com `node 025_contract_generate.mjs --auditors-only` e `node 025_manual_generate.mjs`. Nenhuma migration foi editada nesta rodada; nenhuma conexão ou execução no Supabase, commit ou push foi realizada.

A tabela com CHECK, ATUAL, ESPERADO, ORIGEM PROVÁVEL, RISCO REAL e AÇÃO RECOMENDADA está em [INVESTIGACAO_BLOQUEIOS_PREFLIGHT_025.md](INVESTIGACAO_BLOQUEIOS_PREFLIGHT_025.md). A busca local e no Git continua sem uma exportação completa dos cinco bloqueios remotos. `EXECUTE: rls_auto_enable()` é candidato reproduzido, não identificação confirmada do quinto check.

As migrations 001–024 não criam `rls_auto_enable()` nem alteram os grants da sequence criada pelo SERIAL da 006. A origem histórica exata da função e das ACLs remotas não pode ser inferida de owner, nome ou hash. A documentação oficial Supabase contém esse exemplo de função e seu bootstrap contém defaults para sequences; isso explica estados possíveis, sem homologar o projeto específico.

Fontes reconsultadas nesta rodada:

- https://supabase.com/docs/guides/database/postgres/event-triggers
- https://raw.githubusercontent.com/supabase/postgres/develop/migrations/db/init-scripts/00000000000000-initial-schema.sql
- https://www.postgresql.org/docs/16/functions-sequence.html

Correções locais presentes e revalidadas: ACL nativo de sequences incluindo USAGE; ausência de pseudocolunas; EXECUTE de event_trigger PL/pgSQL classificado como superfície DDL; contrato do corpo desconhecido permanece bloqueador; diagnósticos de origem e lista integral de bloqueios no único resultado consolidado. Nenhum grant foi revogado nem incorporado automaticamente à baseline esperada.

Os 24 hashes das migrations 001–024 conferem com o manifesto existente. SHA-256 da 025: `caecd750b51002721b33eab81d31ef4eda073124b2ed2b9e625ec0ac0828749e`. SHA-256 do preflight manual regenerado: `8ac5ad3ba8cbf12ad62eb2b003d3d2e76aedcf06e76555598a409559030751b7`. Ambos permanecem iguais aos registrados na investigação anterior.

O arquivo `supabase/tests/025_preflight_remoto_manual.sql` está pronto para coleta manual somente leitura, não para aprovação da migration. O total remoto continua indeterminado. A projeção é quatro apenas se o quinto check for o candidato, a linguagem remota for PL/pgSQL e não houver outras divergências. A fixture padrão produz zero; defaults legados produzem três; defaults legados com função event trigger desconhecida produzem quatro.

Backend: 155 passed, uma depreciação Starlette/httpx; log `025-revalidacao-2026-10-05-backend.log`. Banco: 592 testes, 580 passed, zero falhas, 12 skipped, em 208,39 segundos; todos os arquivos `*.test.mjs` executados com concorrência de arquivos igual a um. Os skips correspondem à concorrência PostgreSQL real da 024/025 sem ambiente local disponível. A suíte integral de banco é executada em fixtures locais descartáveis; essas fixtures aplicam migrations para validar comportamento, sem atingir qualquer projeto remoto. Os resultados finais constam no log `025-revalidacao-2026-10-05-banco.log`.

Pendência: resultado remoto completo, corpo/linguagem da função, seus vínculos e ACLs/defaults coletados pelo novo SQL. Sem isso, não afirmar causa raiz definitiva dos cinco, legitimidade específica dos objetos ou zero bloqueios. Preservar o remoto e manter a orientação NÃO APLICAR 025.
