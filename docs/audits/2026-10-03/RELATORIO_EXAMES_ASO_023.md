# Encerramento — Exames/ASO e migration 023

Branch `main`; base da etapa `adc1d72721e25b85fb034da7d38f8a7fd63d2ec5`.
No início, apenas os três artefatos de inventário da etapa anterior estavam
untracked. Commit/push autorizados condicionados à validação e conferência remota;
nenhum SQL remoto executado por este agente ou edição de 015–023 nesta revisão.

## Diagnóstico final e compatibilidade

O inventário remoto aprovado foi informado pelo usuário: 12 documentos, quatro
ASOs em dois tenants (três admissionais e um periódico), todos com colaborador válido;
dois documentos não-ASO associados a colaboradores; 27 procedimentos; apenas um
ASO com arquivo. O conteúdo remoto não foi acessado por esta execução.

O domínio permanece em documentos, com resultado próprio nullable e sem conversão
de observações. Todos os campos anteriores e objetos são preservados. A 023 não
executa escrita em linhas de negócio ou Storage: só expande schema/contrato.
Tests locais usam fixture sintética com a forma aprovada e comparam os dados completos.
Pre/post remotos comparam fingerprints sem revelar seu conteúdo.

O modelo, endpoints, autorização, exclusão física, limites de arquivos, compensação
de upload e instruções remotas estão em [EXAMES_ASO.md](../../EXAMES_ASO.md).
Não foi criada uma tabela principal exames, segunda data ou auditoria de alterações.

## Arquivos criados/alterados nesta implementação

Backend:
- `backend/app/api/routes/exames.py`, `app/schemas/exames.py`, `app/services/exames.py`,
  `app/repositories/exames.py`: domínio CRUD, catálogo, arquivo e autorização.
- `backend/app/api/router.py`: registro das novas rotas.
- `backend/app/repositories/dashboard.py`: contagens documentais com status live.
- `backend/pyproject.toml`: tzdata para calendário em America/Sao_Paulo no Windows.
- `backend/tests/test_exames.py`, `test_dashboard.py`, `test_health.py`: contratos e regressões.

Frontend:
- `frontend/src/services/examesService.ts`, `hooks/queries/useExames.ts`,
  `modules/exames/ExamesPage.tsx`: API, permissões, erros, edição, upload e exportação.
- `frontend/src/services/api/client.ts`: corpo binário mantendo autenticação existente.
- `frontend/src/types/database.ts`: resultado_aso explícito.
- `frontend/src/services/documentosService.ts`, `hooks/queries/useDocumentos.ts`,
  `modules/documentos/DocumentosPage.tsx`: ASO via API, exclusão do CRUD genérico e cache.
- `frontend/src/modules/relatorios/RelatoriosPage.tsx`: resultado explícito na exportação.
- `frontend/tests/exames.test.tsx`, `colaboradores-consumidores.test.ts`,
  `documentos-storage.test.ts`: novo fluxo e preservação do Storage comum.

Banco/artefatos:
- `supabase/migrations/023_exames_aso.sql`.
- `supabase/tests/023_exames_aso_preflight_readonly.sql` e `023_exames_aso_postflight_readonly.sql`.
- `supabase/tests/023_exames_aso_contract_generate.mjs`, `exames-fixture.mjs`, `exames.test.mjs`.
- `supabase/tests/package.json`: inclusão dos novos testes e dos testes do inventário.
- `docs/EXAMES_ASO.md`, este relatório e `migrations-015-022-sha256.json`.

Os três arquivos `023_exames_aso_inventory*` são da etapa anterior, continuam no
working tree e não são migrations. Nenhum arquivo EPI/Assinaturas foi alterado.

## Conteúdo da 023

Adiciona resultado_aso TEXT nullable e CHECK de valores; trigger condicionado a ASO
para vínculos/subtipo, procedimentos e datas novas/alteradas; grants adicionais
somente das duas colunas necessárias, limitados por RLS/triggers; catálogo de leitura
com perfil e empresa ativos; índice não único de tenant/tipo/colaborador; view
security_invoker com janela ASO de 30 dias e demais documentos em 60 dias.

Não há backfill, recriação/duplicação do catálogo, NOT NULL global, remoção ou mudança
de arquivos. O resultado dos quatro legados permanece NULL e observacoes='Apto'
permanece observação. Sem expor Apto/Periódico como fallback de NULL.

## LOCAL VALIDATION

| Verificação | Resultado |
|---|---|
| Backend completo | 430 testes aprovados |
| Frontend completo | 195 testes em 16 arquivos aprovados |
| Supabase completo | 417 testes aprovados; zero falhas/skips |
| SQL ASO específico, após reforço de fingerprints do catálogo | 24 testes aprovados |
| Typecheck | Aprovado |
| Build | Aprovado |
| git diff --check | Aprovado |
| Diff das migrations 015–022 | Vazio; 023 incluída como novo artefato da etapa |
| SHA-256 de 015–023 | Nove coincidências com baselines; 023 conforme hash abaixo |

Positivos: empresa/gestor CRUD, cinco subtipos, operacional leitura, vencimento/arquivo
opcionais, emissão preservada, resultado NULL, procedimentos, upload com JWT, signed
URLs de 60 segundos, arquivos legados, paginação de 600 linhas, consumidor/exports,
status em hoje/30/31/60 dias e integridade byte a byte de campos/objetos da fixture.

Negativos: tenant/colaborador estrangeiro, campos/empresa_id/path/URL forjados,
operacional escrevendo, admin, anon, perfil inativo, empresa suspensa, MIME/bytes/tamanho,
subtipo/resultado/procedimentos inválidos/duplicados/nulos, datas incoerentes, limpar
vínculo, trocar tipo ASO, cache após mudança de role, colunas/FK/policy/bucket ausentes
ou alterados. Compensação não apaga arquivos referenciados ou de estado indeterminado.

As suítes SQL são PGlite local e as APIs usam transporte HTTP simulado. Não comprovam
o Storage HTTP remoto. O contrato instalado foi validado no postflight SQL
informado pelo usuário, registrado separadamente em REMOTE VALIDATION.
Permanecem os avisos anteriores de depreciação TestClient/httpx, cache de transforms
Vitest e chunk principal >500 kB; nenhum impede os testes/build.

Hashes completos preservados: [migrations-015-022-sha256.json](migrations-015-022-sha256.json).
SHA-256 da nova 023: `4ce3bfd1328fbac623120308985e49cd0902d9fc1a45ae9c2e4a000b71039b26`.

## REMOTE VALIDATION

Evidência informada pelo usuário em 03/10/2026, sem nova execução remota por este
agente: migration 023 aplicada integralmente sem erro; preflight e postflight
aprovados; zero BLOQUEIOS; todos os itens do contrato pós-023 retornaram
`contrato conferido | OK`; auditor integral `postgres | OK`.

| Preservação no postflight | Obtido / esperado |
|---|---|
| Documentos / ASOs / catálogo | 12 / 12; 4 / 4; 27 / 27 |
| Admissionais / periódicos | 3 / 3; 1 / 1 |
| ASOs com colaborador válido / observações intactas | 4 / 4; 4 / 4 |
| ASOs com / sem procedimentos | 3 / 3; 1 / 1 |
| ASOs com / sem arquivo | 1 / 1; 3 / 3 |
| Bucket privado, limite e MIME | 1 / 1 |
| Cross-tenant ou colaborador inválido | 0 / 0 |
| Não-ASOs associados a colaborador | 2 / 2 |
| Referências canônicas sem objeto | 0 / 0 |
| Resultado novo NULL nos ASOs legados | 4 / 4 |

Todos os itens foram informados como OK. Dados legados e Storage preservados;
nenhuma limpeza automática ou backfill clínico foi realizado. Observações antigas
não foram convertidas em resultado clínico.

Fingerprints pré/pós exatamente iguais, transcritos da evidência do usuário:

| Conjunto | Fingerprint pré = pós |
|---|---|
| Documentos, excluindo a coluna nova | `b5b811b65ba3a37c3e10f7d7b331b8d5` |
| Catálogo | `3e6e977778712fe976d3c999990e726a` |
| Objetos do bucket documentos | `d979e7d33a8b107966c07f78250b4108` |
| Tipos documentais | `e710fd7436ddddfe8461c9fb27d1a4be` |

## Revisão estática final e pendências pré-produção

React ASO usa FastAPI; cliente com JWT do usuário e chave pública; tenant derivado
do perfil validado, inputs extras recusados e filtros de tenant/tipo explícitos.
Empresa/gestor gerenciam o próprio tenant; operacional apenas lê; admin e papéis
fora da allowlist não acessam ASOs. Perfil inativo e empresa suspensa bloqueados.
Catálogo exige perfil/empresa ativos e papel permitido; RLS/FK/triggers bloqueiam
cross-tenant. Arquivos exigem autorização do registro e path do tenant; URLs assinadas
não são persistidas; bucket privado preservado; sem service_role operacional ou
backfill. Nenhuma regressão identificada na revisão estática.

Homologação real com usuários/JWT/HTTP permanece pendente na auditoria pré-produção:
CRUD por papel/tenant, inativos/suspensos, upload/download e expiração de URLs,
integração ponta a ponta no ambiente alvo. Testes locais simulados e postflight SQL
não substituem essa homologação. Cadastro público/free tier e EPI/Assinaturas
permanecem fora desta etapa. Esta execução não modifica migrations 015–023 nem o banco remoto.

## Conferência Git e autorização de publicação

Após `git fetch origin`, HEAD local permanece `adc1d72721e25b85fb034da7d38f8a7fd63d2ec5`
e origin/main é `7b3658167df9c623c962dca760d5a23a7280d4ed`.
`git rev-list --left-right --count HEAD...origin/main`: `5 0`.
Há cinco commits anteriores locais não publicados: `052fd04`, `48b0517`,
`423b644`, `e3bf17e` e `adc1d72`. Nenhum commit exclusivo do remoto.
O usuário autorizou explicitamente publicar esses cinco commits existentes junto
ao novo commit Exames/ASO. Novo fetch confirmou os mesmos hashes, relação de
ancestralidade e zero commits novos remotos. Publicação por push normal, sem squash,
rebase ou reescrita dos cinco commits anteriores. Mensagem do novo commit:
`feat: migrate exames and ASO to secure tenant architecture`.
Validações finais: backend 430, frontend 195, SQL 417 (incluindo 24 da 023),
typecheck/build aprovados, nove hashes preservados e zero achados no scan de
padrões de segredos dos 35 arquivos candidatos. Somente os artefatos da etapa
listados no status foram selecionados; nenhum .env real, temporário ou build incluído.
