# Remediação dos bloqueios pós-migrations 015–020

Referência: 02/10/2026, America/Sao_Paulo. Fase de correção local, sem execução
remota, push ou implantação. As migrations 015–020 foram preservadas exatamente
como estavam no início desta fase, inclusive as alterações da 020 já existentes
na árvore de trabalho. Não reaplicar essas migrations.

## A–C. Bloqueios originais, causas e correções

| Bloqueio | Causa raiz | Correção implementada e evidência negativa |
|---|---|---|
| B01 — public.documentos | Policies da 007 permitiam admin global e não verificavam perfil/empresa ativos | 021 substitui policies por SELECT/INSERT/UPDATE/DELETE de tenant ativo; helper aceita apenas empresa/gestor ou operacional para leitura; guard restritiva e trigger protegem metadados. Admin lê zero linhas e não escreve, anon não recebe acesso, operacional não escreve, tenant B não modifica A. Grants legados por tabela e coluna são retirados; URL legado somente SELECT; campos técnicos não editáveis |
| B02 — view de documentos | View usava permissões/RLS do owner, com SELECT concedido a consumidores | `security_invoker=true`, apenas SELECT para authenticated e limpeza de grants por coluna. Na fixture, A vê 11 linhas próprias e B vê uma própria; nenhum vê a outra empresa. Admin vê zero, anon recebe negação. Testes também detectam invoker desligado e grants inesperados |
| B03 — 44 falhas Storage | Fixture usava synthetic.supabase.co, enquanto a 020 aplicada define o trusted origin real; fault injection dependia de whitespace antigo | Fixture usa IDs/objetos sintéticos e o prefixo literal correto. A 020 inteira é executada sem substituição do origin ou do parser. Origin de sessão incorreto é sobrescrito conforme produção; URL com origin estrangeiro continua recusada. Regex de injeção corresponde ao comando real e tem assert de correspondência; rollback integral e retry são testados |
| B04 — dashboard | Frontend consultava diretamente colaboradores, treinamentos, empresas e as views | Dois endpoints FastAPI com CurrentProfile e client JWT/RLS; contagens exatas via HEAD, filtros adicionais por tenant, limites validados e erros sem fallback. Frontend usa apenas apiRequest. Admin consulta somente empresas e recebe indicadores internos indisponíveis; não há consulta operacional nem alertas. Escopo estrangeiro/global de tenant retorna 403 |
| B05 — reativação pelo gestor | Grant compartilhado UPDATE(status) e policy legada autorizavam gestor/empresa a mudar o próprio estado | Policies de Empresas, grants por coluna e trigger com decisão por papel. Authenticated é o papel SQL de admin e tenants: status permanece concedido para o admin, mas trigger nega mudança por empresa/gestor. Cadastro legítimo de empresa ativa é mantido; suspensa não ganha escrita. DELETE/TRUNCATE funcionais são retirados. Endpoint existente já exige admin para status; novos testes incluem PATCH misto e reativação após suspensão |

Não foi criado papel `superadmin`: ele não existe no enum atual. As allowlists
de acesso operacional excluem admin e papéis não reconhecidos; não foi inventada
uma homologação de identidade superadmin inexistente.

## D. Arquivos alterados/criados nesta fase

- Banco: `supabase/migrations/021_documentos_empresas_security.sql`.
- SQL read-only: `supabase/tests/021_security_preflight_readonly.sql` e
  `supabase/tests/021_security_postflight_readonly.sql`.
- Backend: `app/api/router.py`, novos `api/routes/dashboard.py`,
  `repositories/dashboard.py`, `services/dashboard.py`, `schemas/dashboard.py`.
- Frontend: `services/dashboardService.ts`, `modules/dashboard/DashboardPage.tsx`,
  `modules/documentos/DocumentosPage.tsx`, `hooks/queries/useDocumentos.ts` e
  `modules/relatorios/RelatoriosPage.tsx`. A tela admin de Documentos não monta
  consultas; dashboard/relatórios admin apresentam apenas cadastro comercial.
- Testes backend: novo `tests/test_dashboard.py`, testes adicionais em
  `test_empresas.py` e atualização do inventário explícito em `test_health.py`.
- Testes frontend: novos `dashboard.test.ts`, `dashboard-documentos-ui.test.tsx`
  e atualização dos três consumidores de dashboard em
  `colaboradores-consumidores.test.ts` para o novo contrato HTTP.
- Testes SQL: fixture e suíte `remediation-*`, infraestrutura de
  `documentos_storage.test.mjs` e inclusão da suíte corretiva em `package.json`.
- Evidências e geradores reprodutíveis nesta pasta. Os arquivos da auditoria de
  01/10 permanecem históricos; não confundir seus achados com a baseline pós-021.

O inventário anterior continha **16 ocorrências de método** no dashboard:
8 classe C e 8 classe D. Todas foram removidas; não há `.from`, Storage ou cliente
Supabase de dados no serviço novo. `dashboard-bypasses-removed.json` registra isso.
Auth direto e módulos legados mantidos não foram migrados só por aparecerem no CSV.

## E. Migration corretiva 021

Transacional desde BEGIN até COMMIT, reexecutável para os objetos conhecidos,
sem UPDATE/INSERT/DELETE de dados de negócio ou de Storage. Constraints são
validadas contra os dados existentes: inconsistência aborta, sem apagar ou
reescrever referências. Na fixture, reexecutar preserva todas as linhas/objetos.

Pré-requisitos: 017/019/020/018 concluídas, bucket documentos privado com
10 MB/7 MIME, RLS de objetos já ativo, assinaturas privadas, ownership dos objetos
públicos/funções e autorização específica para gerenciar policies de Storage.
Drift de policies de empresas/documentos aborta a migration inteira.

A 021 **não executa ALTER TABLE storage.objects, não troca owners, não desliga
RLS e não configura supautils**. Para assinaturas, executa apenas DROP POLICY
IF EXISTS/CREATE POLICY. Essas operações têm autorização distinta de ALTER TABLE:
PostgreSQL exige owner; Supabase pode autorizar gestão de policies via
`supautils.policy_grants`. O preflight verifica owner/superuser ou configuração
específica do papel, com GUC registrada em pg_settings. O suporte real desse hook
deve ser confirmado pelo resultado remoto, não pelo PGlite.
([Supabase supautils — Manage Policies](https://github.com/supabase/supautils/blob/master/README.md#manage-policies))

Necessárias nesta fase, além dos cinco bloqueios:

- AT04: helpers públicos recebem search_path vazio, referências qualificadas e
  EXECUTE somente authenticated; seus valores de retorno para os módulos legados
  não mudam. Não dependemos deles para autorizar Documentos/Empresas novos.
- AT06: FK de documento/colaborador passa a composta por tenant. NO ACTION
  conserva o registro e impede remover tecnicamente o colaborador sem resolver
  suas referências; o módulo funcional já proibia DELETE de Colaboradores.
- AT05: a proibição de admin acessar dados internos exigiu guards restritivas
  em EPI e assinaturas, sem migração da API de EPI. FKs de EPI/colaborador e
  item/ficha passam a compostas; CASCADE de item/ficha mantém a semântica anterior,
  mas só liga o mesmo tenant. DELETE funcional de Empresas fica proibido, evitando
  a cascata de remoção de empresas e dados internos. TRUNCATE de EPI é revogado.
  Assinaturas continuam privadas e sem UPDATE/DELETE; bucket/MIME/limite e objetos
  não são modificados.

## F. Testes negativos e preservação

**55 testes** da suíte corretiva final cobrem tabela/view, admin e anon, empresa/gestor,
operacional, perfil inativo, empresa suspensa, tenant estrangeiro, status comercial,
cadastro legítimo, FKs de tenant, grants antigos, policies permissivas extras,
assinaturas/EPI, certificados imutáveis, TRUNCATE, reexecução e rollback.

Incluem detecção read-only de policy adulterada, view sem invoker, trigger desligado,
grant de coluna adicional, MIME inválido, canonical count divergente e corpo de
guard adulterado. Um auditor com SELECT/BYPASSRLS, sem ownership ou escrita,
é identificado como incapaz de aplicar a migration, inclusive policies de Storage.
Uma referência antiga cross-tenant causa erro 23503 e rollback de todo o catálogo,
sem perda/"conserto" da referência.
RLS desligado em tabela operacional pré-requisito bloqueia o preflight e a 021,
com rollback verificado. Snapshots incluem FKs, ACLs por tabela/coluna, view options
e helpers públicos/privados, além de dados e policies/triggers.

**26 testes novos** do dashboard backend verificam JWT/anon key, tenant derivado
do perfil, contagens acima de 1000, admin sem query operacional, 403 antes do
repository, identidades inválidas, parâmetros duplicados/estranhos, limites,
no-store e erros sem fallback/detalhes SQL. **8 testes adicionais** de Empresas
verificam status e suspensão pela API. **9 testes novos** frontend verificam o
contrato HTTP, negações, respostas inválidas e telas admin sem consultas internas.

Os **45 testes Storage** incluem os 44 anteriores ajustados à configuração real
e uma nova URL Supabase de projeto estrangeiro. A expectativa antiga de que uma
sessão sem origin faria a 020 falhar foi substituída pela verificação do comportamento
real: a própria migration define explicitamente o origin confiável. Validações
de prefixo/path, parser, rollback, permissões, limite e MIME não foram enfraquecidas.

`local-preservation.json` confirma, em fixture somente, 12 documentos, 4 URLs,
4 paths, zero pending, 4 objetos documentos e três assinaturas sintéticas.
Todos os dados de Empresas, Profiles, Colaboradores, Documentos, Treinamentos,
EPI/itens e todos os objetos/buckets permanecem idênticos após 021.
As suítes comparam também snapshots de catálogo antes/depois dos SQLs de leitura.
Isso não prova a identidade dos dados/bytes remotos.

## G. Baseline completa confirmada e validação incremental final

A baseline abaixo corresponde à última execução completa confirmada antes dos
dois testes finais. Não foi reexecutada a auditoria nem as suítes backend/frontend
nesta finalização. Não somar os resultados incrementais abaixo a essa baseline.

| Validação | Total | Passaram | Falharam |
|---|---:|---:|---:|
| Backend pytest | 381 | 381 | 0 |
| Frontend Vitest, 14 arquivos | 168 | 168 | 0 |
| SQL/RLS | 350 | 350 | 0 |
| **Total, sem dupla contagem** | **899** | **899** | **0** |
| Storage isolado, já incluído em SQL/RLS | 45 | 45 | 0 |
| 021 naquela baseline, já incluído em SQL/RLS | 53 | 53 | 0 |

Typecheck, build e `git diff --check`: **passaram**. Nenhum skip/cancelamento
nas suítes SQL. Nenhum teste de segurança/RLS vermelho ficou oculto ou excluído.
Baseline anterior à correção: 758 passes / 44 falhas / 802 testes. A baseline
completa confirmada acima contém 97 testes novos,
além da recuperação das 44 falhas. O teste de rotas continua uma allowlist exata,
com apenas os dois endpoints implementados adicionados.

Validação incremental executada nesta finalização (execuções separadas):

| Execução | Passaram | Falharam |
|---|---:|---:|
| Apenas os dois testes `semantic whitespace` | 2 | 0 |
| Suíte diretamente afetada `remediation.test.mjs`, versão final | 55 | 0 |

Os dois testes estão incluídos nos 55; não são 57 testes distintos. A execução
filtrada confirmou as duas adulterações antes da execução da suíte afetada.
Ambas terminaram com exit_code=0, sem skips/cancelamentos.
Logs: `final-incremental-tampering.log` e `final-incremental-remediation.log`.
Typecheck e build permanecem os anteriormente confirmados; não houve alteração
de código TypeScript/backend que justificasse executá-los novamente. `git diff
--check` foi executado novamente e passou (`final-diff-check.log`).

O processo SQL iniciado antes da interrupção também terminou em background:
`supabase/tests/remediation-sql.log` registra 352 passes / zero falhas. Essa
evidência recuperada não substitui a baseline solicitada nem constitui uma nova
execução conjunta de backend/frontend/SQL nesta finalização.

Mudanças desde a baseline: dois cenários negativos no teste da 021; comparação
estrita de expressões de policies/constraints; fingerprint de funções preservando
espaços significativos e normalizando somente CRLF; ajuste do manifesto/gerador e
regeneração dos dois SQLs read-only e evidências locais correspondentes. Isso
impede que `'assinaturas'` e `'ass inaturas'`, ou `'authenticated'` e
`'auth enticated'`, sejam considerados iguais. Nenhuma regra funcional, migration,
API ou frontend foi alterada por esses últimos ajustes.

Conferência final: os seis SHA-256 de 015–020 correspondem ao registro anterior;
021 é a única migration corretiva nova. A 020 já tinha alterações contra HEAD
antes desta fase; isso não representa edição retroativa pela remediação.
A 021 segue transacional, sem ALTER/ownership de tabelas gerenciadas de Storage;
CREATE/DROP POLICY dependem da autorização individual verificada no preflight.
Ambos os scripts permanecem READ ONLY e produzem os totais consolidados. Fixtures
usam exclusivamente PGlite local; os geradores escrevem arquivos locais, sem
cliente remoto ou carregamento de credenciais. Não foi incluído segredo nem
executado push, preflight/migration/pós-migration remoto ou Exames/ASO.

Evidências: `remediation-backend.log`, `remediation-frontend.log`,
`remediation-sql.log`, `remediation-storage.log`, `remediation-021.log`,
`remediation-typecheck.log`, `remediation-build.log`, `diff-check.log`.
A cópia histórica `remediation-sql.log` nesta pasta registra uma rodada anterior
com 349 passes; não é evidência da baseline de 350 confirmada na sessão. O log
SQL na pasta de testes foi posteriormente atualizado pela execução em background
de 352 descrita acima. As contagens foram mantidas separadas, sem reconstituir
uma execução conjunta que não ocorreu.
O diff inclui mudanças anteriores desta sessão; isso não significa que a fase
corretiva alterou retroativamente essas migrations/documentos.

Warnings mantidos, sem trabalho de melhoria nesta fase: TestClient/httpx,
cache de transforms e bundle principal >500 kB (1.150,07 kB / gzip 322,26 kB).
Avisos LF/CRLF não são falhas de whitespace; diff-check registra exit_code=0.

## H–I. Atenções e riscos restantes

| Atenção original | Estado após esta fase |
|---|---|
| AT01 — remoto/Auth/config/bytes | Pendente. Nenhuma conexão ao projeto; SQL local não certifica implantação, JWTs reais, Auth, CDN, exposed schemas ou blobs |
| AT02 — certificado ausente/substituição da referência | Pendente, não necessário para os cinco bloqueios. Arquivo imutável não equivale a referência imutável; validação atual de treinamento não exige existência do objeto |
| AT03 — arquivo geral removível enquanto referenciado | Pendente. Regra existente de Storage geral foi preservada; pode resultar em referência pendente depois de remoção autorizada |
| AT04 — search_path de helpers públicos | Corrigida nesta fase. Helpers qualificados, ACL e corpos verificados no postflight |
| AT05 — EPI/assinaturas | Acesso global de admin, empresa suspensa/inativa e vínculos cross-tenant corrigidos. Foto legada/getPublicUrl em bucket privado e ciclo de assinatura/histórico não foram redesenhados; precisam de revisão própria sem tornar bucket público |
| AT06 — FK simples documento/colaborador | Corrigida nesta fase com FK composta validada |
| AT07 — datas/horas e invariantes de negócio | Pendente. Não houve implantação de novas regras de negócio nesta correção |
| AT08 — janela de revogação durante provisionamento Auth | Pendente. O uso técnico da Admin API não foi substituído por CRUD privilegiado; corrida e reconciliação continuam exigindo análise própria |

M01/M02 não implementadas. Runbooks/preflights pré-cutover históricos não devem
ser usados para verificar o estado pós-021. A existência de dados vinculados a
outro tenant deve bloquear o preflight e ser investigada, nunca apagada automaticamente.
Fingerprints/deparse podem divergir em versões/formatação/comentários: revisar
o catálogo detalhado antes de interpretar um bloqueio; não relaxar a policy para
"adequar" o resultado. Não usar service_role como identidade funcional de admin.

## J. Homologação remota e sequência para o operador

**Tecnicamente pronto para revisão e homologação remota desta correção, com todas
as suítes locais verdes. Não declarar produção aprovada ou Exames/ASO liberado.**

1. Revisar código, migration e relatório, inclusive atenções restantes.
2. Executar manualmente `021_security_preflight_readonly.sql` inteiro, em sessão
   nova e com o mesmo papel previsto para a migration. Exigir TOTAL_BLOQUEIOS=0;
   avaliar cada atenção. Salvar inventários de documentos/objetos/buckets.
3. Aplicar manualmente a migration 021 inteira numa execução. Se houver erro,
   encerrar a transação abortada com ROLLBACK e investigar antes de repetir;
   nunca continuar trechos depois do erro. Não executar 015–020 de novo.
4. Executar manualmente `021_security_postflight_readonly.sql`, exigir zero
   bloqueios e comparar IDs/paths/metadata e demais evidências com o preflight.
5. Implantar/homologar a API nova antes do frontend que a consome, sob revisão
   operacional separada. Testar JWTs reais de dois tenants, empresa/gestor,
   operacional/admin/anon, suspensão, Storage e signed URLs, incluindo assinaturas.
6. Só após os resultados remotos e a avaliação dos riscos restantes decidir
   sobre Exames/ASO. Nenhuma implementação desse módulo foi iniciada.

Ambos os SQLs têm BEGIN READ ONLY/REPEATABLE READ, consultas detalhadas e uma
última tabela `CHECK | RESULTADO | STATUS`, encerrada por TOTAL_BLOQUEIOS e
TOTAL_ATENCOES. COMMIT encerra a transação e não produz outra tabela de dados.
Não criam objetos temporários, não fazem LOCK nem alteram papel/JWT/origin.

Na fixture: preflight **0 bloqueios / 5 atenções**; postflight **0 / 4**,
com 200 linhas no último resultado pós-021. Os totais remotos serão os que o
operador obtiver; nenhum desses resultados locais deve ser colado como evidência
do Supabase hospedado. Geradores e fixtures não fazem requisição de rede.
