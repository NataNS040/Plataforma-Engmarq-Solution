# Auditoria final de prontidão — Fundação 025-A

**GO PARA SOLICITAR AUTORIZAÇÃO MANUAL**

Data: 2026-10-08. Os requisitos técnicos verificáveis no repositório e nas evidências recebidas foram atendidos. Este GO permite solicitar autorização para execução controlada; não autoriza apply, não atesta o backend implantado e não antecipa aprovação POST. As condições operacionais abaixo devem ser confirmadas antes da execução. Nenhuma operação remota foi realizada.

## Conferências

| Item | Evidência e resultado |
|---|---|
| Baseline real | PRE025_REAL.json integral, 909757 bytes, JSON válido, envelope v2 aprovado e PRE; 1123 checks, 28 snapshots, 18 fingerprints, elegibilidade das 3 empresas |
| Totais PRE | 941 OK, 182 ATENÇÃO, 0 BLOQUEIO; 47 colaboradores ativos, 0 inativos e 0 estados nulos |
| Concorrência real | 025-concorrencia-real-resultados.json e 025-concorrencia-real-final.log concordam: PostgreSQL 16.15, 20 PASS, 0 FAIL, 0 SKIP, 0 cancelados; ambiente Docker descartável, network none, production=false |
| Compatibilidade da homologação | migration025_sha256 do relatório real é exatamente o hash atual/congelado da migration; não foi necessário repetir os 20 testes |
| Migrations 001–024 | Recalculados os 24 hashes; 24 correspondências com PRESERVACAO_001_024_025A.json, nenhuma divergência |
| SQL POST real | Reconstrução offline com withBaseline(template, JSON real) corresponde exatamente ao SQL entregue; payload não vazio e íntegro |
| READ ONLY | Parser existente executado isoladamente, sem iniciar testes: exatamente BEGIN READ ONLY, WITH/SELECT consolidado, COMMIT; verificação de funções/SELECTs dinâmicos permitidos e ausência de chamada remota CNPJ |
| Regressões existentes | Logs de importação/regressão: 96/0/0 e 13/0/0; não repetidos, não somados como testes únicos |
| Backend local atual | Verificação curta nesta auditoria: 428 PASS, 0 FAIL, 0 SKIP, exit code 0; testes HTTP com mocks explícitos, sem chamadas a Supabase |
| Isolamento | Contratos SQL, testes RLS/adversariais e gates do backend preservam tenant derivado do JWT/profile e exclusão do admin funcional das operações SST |

SHA-256 conferidos:

- Migration 025, antes/depois e evidência de concorrência: `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5`.
- PRE025_REAL.json: `48411545910eddfff40896d368a2d6028d2303c3b2c602a4b44262b33094829f`.
- 025_postflight_REAL_readonly.sql: `5d6c6fb5dda12ed250a523bfd1387ca860e7a0c98926023e251ab64a8691ef75`.
- Preflight remoto aprovado, preservado: `98ad6566523286e25c3eaf3a677d85786197c45edea803b2235436a455021d86`.

Os impedimentos documentados em 2026-10-07 sobre baseline vazio, elegibilidade ausente, importador incompleto e chamada remota de CNPJ foram resolvidos pelos artefatos de 2026-10-08. O freeze histórico permanece como registro daquela revisão; seus campos sobre baseline/postflight não descrevem a prontidão atual. Nenhum histórico foi sobrescrito para simular aprovação anterior.

## Concorrência e limites da evidência

Os 20 casos cobrem criação/reativação/offboarding, alterações comerciais concorrentes, limites 99/100, rejeição de redução abaixo do uso, batches atômicos, rollback, retry, isolamento entre empresas, serialization failure e manutenção multitenant com prelocks em UUID ascendente. Contagem real e empresa_uso permanecem coerentes nos resultados; quota não excede o limite. Há captura real de bloqueadores e locks em pg_locks. Erros esperados: 13 P2502 e um 40001; unexpected_sqlstates vazio. Não houve deadlock inesperado registrado. Não se afirma que qualquer SQL administrativo arbitrário está livre de deadlocks: o protocolo de prelocks determinísticos continua obrigatório para operações que abrangem várias empresas.

O bootstrap Auth/Storage usado nessa homologação é local/sintético; as transações de concorrência executaram PostgreSQL real e migrations reais 001–025. Essa distinção não invalida a homologação de quota, mas ela não testa serviços HTTP hospedados, rede ou configuração do projeto real.

## Segurança e backend

O cliente operacional do backend usa JWT do chamador e anon key por requisição. require_feature aceita apenas empresa/gestor/operacional ativos; não aceita admin funcional e não habilita EPI. A criação de usuários autoriza empresa/gestor antes de usar cliente técnico privilegiado e chama provisionar_perfil_interno com actor_id. O SQL valida o ator/papel/tenant; service_role técnico não equivale ao Super Admin comercial. A rotina compensa falhas do provisionamento Auth/perfil e informa necessidade de reconciliação quando a compensação falha, sem retry cego.

RLS, policies restritivas, grants, funções definer com search_path protegido e views security_invoker mantêm a fronteira tenant. Super Admin permanece na camada comercial, sem acesso operacional SST concedido por esta fundação. Storage é auditado por namespace, buckets privados, referências e gates; EPI/assinaturas permanecem em quarentena. Não há autorização para usar service_role como substituto de JWT em rotas operacionais.

A sequence exames_catalogo_id_seq passa de SELECT/UPDATE/USAGE PRE para nenhum privilégio dos clientes e somente USAGE técnico POST. INSERT SERIAL técnico segue possível; consumidores externos de SELECT direto ou setval devem usar a identidade administrativa apropriada e ser revisados. rls_auto_enable e seu event trigger permanecem preservados e sujeitos ao contrato auditado, sem remoção.

## Riscos e condições antes de executar

| Condição | Risco e medida na execução controlada |
|---|---|
| Janela sem escritas | PRE foi capturado em 2026-10-08T03:24:56.6548+00:00. Não há comprovação local de ausência de alterações posteriores. Suspender API/usuários/jobs/uploads/manutenção desde o corte PRE definitivo até a coleta POST. Locks da migration terminam no COMMIT e não substituem essa janela |
| PRE atual | Se houve escrita/DDL/grant desde a captura ou não for possível confirmar ausência de drift, recolher exportação PRE completa na janela. Novo pacote exige validação e recompilação POST explícitas; o importador recusa sobrescrita com hash diferente. Não comparar POST atual com corte obsoleto |
| Backend implantado | Código local está validado, mas não existe atestação da release implantada. Confirmar identificação da versão que usa RPC/gates/tratamento de quota antes de reabrir tráfego; versão antiga pode falhar no provisionamento ou na apresentação de erros. Não atribuir aos mocks homologação HTTP real |
| Serviços externos | Confirmar consumidores Auth/PostgREST/Storage, cache/exposição da RPC, políticas de jobs, importadores e manutenção de sequences. A implantação SQL não valida disponibilidade HTTP; não contornar erro com grants amplos ou bypass de RLS |
| Executor/permissões | Usar executor confiável com capacidades administrativas requeridas e leitura integral de public, engmarq_private e Storage. Dados filtrados por RLS ou executor insuficiente invalidam a comparação. Não usar cliente anon/authenticated como auditor integral |
| Locks e timeouts | lock_timeout=5s, statement_timeout=120s. DDL/locks podem esperar transações abertas. Drenar transações e impedir novas escritas; erro/timeout exige investigar, não reaplicar automaticamente |
| Recuperação | Confirmar backup recuperável, responsável e escopo antes de executar. A migration é transacional; após COMMIT não existe rollback genérico autorizado. Correção forward/restore exige diagnóstico e aprovação separados |
| Resultado POST | O SQL real ainda não foi executado remotamente. Só POST preservado, contrato íntegro e zero bloqueios permitem encerrar 025-A. Antes da migration ele falha por ausência do manifesto, conforme teste local; isso não significa drift do PRE |

São condições da execução autorizada futura, não alegações de que elas já foram atendidas no ambiente remoto. Se qualquer condição não puder ser comprovada no momento da execução, suspender a aplicação e retornar a NO-GO operacional.

## Procedimento manual exato, condicionado à autorização

1. Solicitar autorização explícita identificando projeto, executor, janela, release do backend, escopo somente 025-A e os hashes acima. Nenhuma operação remota foi autorizada por esta auditoria.
2. Após autorização, confirmar projeto correto, executor, backup e responsáveis; suspender escritas de usuários/API/jobs/Storage/manutenção e drenar transações abertas. Registrar início da janela.
3. Conferir os hashes locais com Get-FileHash -Algorithm SHA256. Não rodar geradores que possam reescrever a migration. Reexecutar manualmente o preflight READ ONLY aprovado `supabase/tests/025_preflight_remoto_manual.sql`, completo, e guardar o resultado. Qualquer bloqueio interrompe o procedimento.
4. Confirmar o corte PRE. Se houver drift ou incerteza, executar manualmente `supabase/tests/025_baseline_pre025_export_readonly.sql`, salvar o pacote integral e validar antes de qualquer apply. Não sobrescrever PRE025_REAL silenciosamente: preservar o anterior e compilar um novo SQL com caminho novo usando `node supabase/tests/025_postflight_baseline.mjs CAMINHO_ABSOLUTO_PRE_NOVO.json CAMINHO_ABSOLUTO_POST_NOVO.sql`. Validar pacote/totais/parser, registrar hashes e revisar diferenças. A autorização deve abranger o corte definitivo; mudanças materiais exigem nova revisão.
5. Somente com autorização e condições satisfeitas, abrir no Supabase SQL Editor **o arquivo completo** `supabase/migrations/025_entitlements_quota_hardening.sql` com o hash congelado. Executar uma vez; não selecionar trechos, não acrescentar BEGIN/COMMIT, outras migrations, seeds ou postflight ao lote.
6. Salvar resposta integral, timestamps, executor, hash e eventuais SQLSTATEs. Em erro/timeout, não executar o restante nem repetir automaticamente. Transação aberta/aborted deve ser encerrada com ROLLBACK na mesma sessão. Resposta ambígua exige investigação READ ONLY do estado, não novo apply cego.
7. Após COMMIT confirmado, em outra sessão, executar o arquivo completo `docs/audits/2026-10-08/025_postflight_REAL_readonly.sql`, ou o novo POST recompilado do corte definitivo. Guardar o único resultado consolidado. Não executar o template `supabase/tests/025_fundacao_postflight_readonly.sql` com `[]`.
8. Com zero bloqueios e preservação confirmada, verificar integração Auth/RPC/PostgREST/Storage e release compatível antes de reabrir tráfego, usando verificações controladas separadas da comparação de fingerprints. Verificações que escrevam só depois de salvar POST e dentro da autorização correspondente. Se houver falha, manter escritas afetadas suspensas, preservar evidências e investigar sem ampliar grants nem liberar Super Admin operacional.
9. Registrar encerramento ou impedimento. Commit/push e Fundação 025-B permanecem fora deste procedimento.

## Verificações desta auditoria e arquivos produzidos

Recalculados SHA-256; JSON.parse dos pacotes/manifests; validação offline withBaseline e igualdade byte a byte do SQL recompilado; parser READ ONLY extraído do módulo de testes e executado isoladamente para evitar suites caras. O primeiro comando de inspeção do freeze encontrou BOM UTF-8; leitura ajustada somente em memória, sem alteração da evidência. A chamada inicial do parser teve erro de quoting PowerShell e foi repetida corretamente, com três statements aprovados.

Backend, em backend/:

```text
.venv/Scripts/python.exe -m pytest -q tests/test_entitlements_025.py tests/test_security.py tests/test_usuarios.py tests/test_usuarios_admin.py tests/test_colaboradores.py tests/test_catalogos.py tests/test_treinamentos.py tests/test_exames.py tests/test_empresas.py tests/test_dashboard.py
```

Exit code 0; 428 marcadores de aprovação, zero falhas/skips; uma depreciação Starlette/httpx existente. A configuração quiet do projeto suprime o resumo numérico; o total foi contado dos marcadores do log UTF-16LE. Não foram repetidas a concorrência PostgreSQL nem as suites SQL extensas, pois as evidências correspondem ao hash congelado e aos artefatos inalterados.

Criados exclusivamente nesta auditoria:

- `docs/audits/2026-10-08/AUDITORIA_FINAL_PRONTIDAO_025A.md`.
- `docs/audits/2026-10-08/025-prontidao-final-evidencias.json` (hashes, resultados e condições operacionais).
- `docs/audits/2026-10-08/025-prontidao-backend-tests.log`.

Nenhuma alteração em migration, contrato, baseline, SQL postflight ou código de aplicação. Nenhuma conexão/SQL remoto, apply, commit/push ou início de 025-B. Aguardando autorização explícita antes de qualquer operação remota.
