# Relatório de implementação — Fundação 025-A

Data: 2026-10-04. Branch `main`. Baseline e HEAD preservados: `b8e6f3c270254ee37a73acc1c7829aad69fc8d5c`.

**Implementação somente local, para revisão. Concorrência PostgreSQL REAL DEFERIDA: Fundação 025 não está homologada nem encerrada.**

Documento-base: [DIAGNOSTICO_FUNDACAO_025.md](DIAGNOSTICO_FUNDACAO_025.md). A evidência remota da 024 não foi reutilizada como baseline de preservação pré-025.

## 1. Escopo e decisões aprovadas

Migration nova, transacional e forward-only: `supabase/migrations/025_entitlements_quota_hardening.sql`. Migrations 001–024 intactas. Implementados entitlement, quota, reativação, manutenção de uso, compatibilidade legada explícita e hardening de RLS/Storage/EPI. Backend existente atualizado para consultar entitlement antes de acessar os módulos.

Free futuro: 100 colaboradores ativos; inativos mantêm histórico e não contam; reativação depende de vaga. Conta empresarial, usuários internos e dependências mínimas de colaboradores ficam disponíveis mediante concessões explícitas. Plano comercial não é autorização técnica.

Não foi criada empresa Free de produto nem catálogo de planos inventado. Empresas das fixtures são sintéticas e locais. Nenhum frontend, signup, callback, CAPTCHA, confirmação pública de e-mail, onboarding ou bootstrap público foi implementado. Confirmação obrigatória e bootstrap atômico/idempotente continuam reservados à 025-B.

## 2. Schema e helpers

Reutilizados `features`, `empresa_features`, `empresa_limites`, `empresa_uso`, `empresa_comercial`, `auditoria_comercial` e `engmarq_private` da 024.

| Nova tabela privada | Finalidade |
|---|---|
| fundacao_025_legado | Manifesto do corte com tenant, origem, instante e decisões comerciais anteriores |
| colaborador_transicoes | Histórico transacional de atividade e datas anteriores de desligamento |
| documento_tipo_features | Mapeamento estável do ID do tipo para módulo |
| documento_objeto_features | Classificação de arquivos legados e reservas por módulo |

As tabelas novas têm RLS e não concedem acesso a PUBLIC/anon/authenticated/service_role. Helpers definer usam `search_path=''`. Helpers de lock/manutenção/trigger não têm EXECUTE público; helpers necessários às policies têm grants limitados.

Principais funções: `can_use_feature`, `lock_quota`, guards de colaborador/comercial/uso/documento, `reconciliar_uso`, `documento_feature`, `storage_features` e `can_use_documento_object`.

`reservar_arquivo_sst(feature,extension)` exige JWT/feature de escrita, deriva tenant e reserva apenas metadados de caminho aleatório. Não cria empresa, Auth, profile, concessão ou limite.

`provisionar_perfil_interno` adapta a criação de usuário interno já existente. É RPC no schema público com EXECUTE **somente service_role**, indisponível a anon/authenticated. Revalida actor real, atividade, empresa, role e `usuarios.gestao`; deriva tenant do actor e não aceita `empresa_id`. Não cria Auth/empresa nem serve como bootstrap. INSERT direto de profiles pelo service_role foi revogado para conduzir esse fluxo pelo guard. A role técnica continua distinta de um usuário funcional `admin`.

## 3. Entitlements e deny-by-default

| Chave real | Aplicação |
|---|---|
| empresa.cadastro | Cadastro empresarial e logos |
| usuarios.gestao | Administração interna; próprio profile permanece como contexto de sessão |
| colaboradores.gestao | Colaboradores, funções, setores e ambientes mínimos |
| treinamentos | Treinamentos, matriz, tipos e certificados |
| exames | Catálogo, ASO e arquivos correspondentes |
| documentos | Demais documentos SST e arquivos correspondentes |
| epi | Quarentena na 025-A, inclusive diante de concessão antiga ON |
| relatorios.sst | Views e backend de indicadores/alertas SST |

Ausência, OFF e chave desconhecida são deny. Não existe fallback de liberar tudo sem features. Policies novas são restritivas, somadas às anteriores de tenant, role e estado; UPDATE valida linha anterior/nova. O helper compartilhado de catálogos não foi indiscriminadamente convertido em gate de colaboradores, porque também suporta módulos pagos: cada relação recebe o gate adequado.

Empresa/gestor ativos do próprio tenant podem escrever. Operacional continua somente leitura. Admin comercial continua sem dados individuais ou operação de colaboradores, ASO, exames, treinamentos, documentos, EPI ou usuários internos.

## 4. Compatibilidade legada explícita

A migration bloqueia escritas concorrentes nas relações do corte e captura somente empresas existentes nessa transação:

- preserva decisões comerciais, features e limites existentes;
- insere `origem=legado` somente se situação comercial ausente, sem classificá-las como Free;
- insere concessões explícitas ausentes para acesso atual, exceto EPI;
- cria limite explicitamente ilimitado somente quando ausente;
- inicializa uso com a contagem real somente quando ausente;
- registra estado anterior/origem no manifesto e inserts na auditoria comercial da 024.

Limite existente abaixo do uso ou contador existente divergente bloqueia, sem reparo silencioso. Nenhum dado operacional, CNPJ, endereço, profile, documento, treinamento ou objeto Storage é reescrito. Empresas futuras não entram no manifesto nem recebem fallback.

O teste local comprova bloqueio de empresa futura sem grants e configuração explícita Free com três features e limite 100. A futura 025-B deverá provisionar atomicamente empresa, titular, situação/plano, features, limite, uso zero com `apurado_em`, diagnóstico e idempotência. Esse fluxo não existe nesta etapa.

## 5. Quota e reativação

Fonte de verdade: colaboradores com `active=true`. `empresa_uso.colaboradores_ativos` é materialização transacional, mantida pelo trigger sob lock; limite vem explicitamente de `empresa_limites`.

| Operação | Efeito |
|---|---|
| INSERT ativo | +1; rejeita acima do limite |
| Reativação | +1; active=true e data_demissao=NULL |
| Desativação | -1; exige data de desligamento |
| Edição sem transição | 0 |
| DELETE técnico | -1 se ativo; clientes não apagam histórico |
| Rollback | Reverte registro, uso e log de transição |
| Lote/importação | Validação por linha; erro aborta statement/transação sem confirmação parcial |

Update do contador condiciona piso zero e teto. Falta de uso/limite gera erro, nunca unlimited implícito. `empresa_id` é imutável inclusive em DML técnico comum. O trigger aplica quota também a operações normais de service_role/owner sobre colaboradores.

UPDATE direto do uso por clientes/service_role é bloqueado, incluindo grants de coluna. TRUNCATE é rejeitado. `reconciliar_uso` é owner-only: conta sob o mesmo lock e rejeita estado acima de limite. Auditores verificam contador=ativos. Um owner/superuser pode executar manutenção ou desabilitar objetos: é fronteira de confiança, não ator protegido por RLS.

Reativação limpa a data atual, mas a data anterior permanece no log privado transacional; nenhuma reescrita de histórico ocorre na migration. Backend aceita patch explícito `active=true,data_demissao=null`, mantendo extra=forbid e validação conjunta.

## 6. Locks e concorrência

DML adquire primeiro a linha alvo de colaborador/limite. Guard compartilha **empresa FOR NO KEY UPDATE → uso com lock de escrita**: o UPDATE do contador adquire esse lock no caminho de colaboradores; o guard comercial usa FOR UPDATE explícito. Criação, desligamento, reativação e mudança de limite serializam pela mesma empresa.

O caminho de colaboradores NÃO bloqueia a linha do limite: lê o limite após adquirir empresa no guard VOLATILE. Isso evita o ciclo em que um editor já segura limite e espera empresa enquanto colaborador segura empresa e espera limite. Não ocorre promoção de FOR SHARE para FOR UPDATE de empresa no guard de quota. NO KEY UPDATE é compatível com KEY SHARE das FKs.

Guard comercial atualizado na 025 usa o mesmo protocolo e compara uso real/materializado antes de reduzir teto. RPC técnica de perfil segura actor FOR SHARE antes de empresa e reconsulta após o lock, impedindo criação a partir de actor revogado durante a espera.

VOLATILE permite consultas com snapshots novos após esperar; helpers de leitura continuam STABLE. Referências: [volatilidade PostgreSQL](https://www.postgresql.org/docs/16/xfunc-volatility.html) e [isolamento de transações](https://www.postgresql.org/docs/16/transaction-iso.html). A implementação precisa da prova concorrente real ainda pendente. Operações técnicas multi-tenant devem usar ordem estável e tratar falhas de concorrência, sem retries cegos de writes.

## 7. Storage

Buckets privados e isolamento das migrations 020/022 preservados. Logo usa bucket `logos`, objeto `{tenant}/logo.ext`; referência cadastral `logos/{tenant}/logo.ext`. Free com `empresa.cadastro` mantém acesso. Não foi adicionada policy permissiva global.

Bucket `documentos` exige módulo correto, tenant e role de escrita quando aplicável. Mapeamento estável: ASO→exames; certificado→treinamentos; ficha EPI→epi; demais→documentos. Referências reais e classificação privada compõem exigências. Reserva de ASO não pode ser associada a documento genérico para trocar o módulo.

Objeto legado sem classificação suficiente exige documentos+exames+treinamentos; caminho de certificado também exige treinamentos. Legado com concessões completas mantém compatibilidade; uma única concessão parcial não abre todo o bucket. Reservas novas permitem acesso em contas com apenas um módulo habilitado. Classificação excepcional de objeto ambíguo depende de revisão técnica confiável, nunca de escrita cliente no mapeamento.

Exames reserva caminho antes do upload e usa JWT do caller. Signed URLs mantêm TTL existente de 60 segundos. URLs já emitidas podem sobreviver até expirar; SQL não as revoga instantaneamente. Testes locais exercitam policies sobre shims de Storage, não HTTP/bytes do serviço Supabase.

## 8. EPI/Assinaturas

Não foram criadas tabelas opcionais ausentes. Nas presentes: grants de tabela/coluna de clientes revogados, policies antigas removidas, RLS e policy restritiva false. Helpers opcionais correspondentes perdem EXECUTE de clientes. Bucket assinaturas negado em todas as operações, inclusive para admin funcional.

Dados e objetos preservados. Operador técnico confiável é fronteira distinta. Ausência opcional aparece como atenção; drift de objeto opcional presente fora do contrato conhecido bloqueia. Nenhum módulo, captura facial, assinatura funcional ou UI nova foi desenvolvido.

## 9. Backend e erros

Abstração central `backend/app/core/entitlements.py`: consulta concessão usando JWT do caller e tenant do profile verificado; OFF/ausência=403, falha de consulta=503. Aplicada em colaboradores, catálogos, usuários, treinamentos, exames, cadastro empresarial e dashboard.

Não havia router próprio de documentos/EPI a atualizar. Chamadas SDK/REST existentes são protegidas por RLS/Storage. Dashboard tenant exige relatórios e features das fontes SST; admin mantém indicadores comerciais sem consultas operacionais. Free fica bloqueado no endpoint SST, sem compliance artificial de 100%; UX será tratada depois.

| SQLSTATE | Código seguro |
|---|---|
| P2501 | feature_not_enabled |
| P2502 | collaborator_limit_reached |
| P2503 | tenant_forbidden |
| P2504 | company_inactive |
| P2505 | user_inactive |
| P2506 | usage_unavailable |

Repositórios compartilham tradução. Profile/empresa indisponíveis preservam resposta pública access_denied e distinguem internamente user_inactive/company_inactive. Erros não ecoam SQL, upstream, tokens ou dados de outro tenant.

Banco é autoridade de quota; backend não usa contagem própria para autorizá-la. Criação interna Auth já existente exige entitlement antes de abrir client privilegiado; profile passa pela RPC técnica e preserva compensação de exclusão do Auth em falha. Não foi aberto Auth público.

## 10. Preflight/postflight e contratos

Novos auditores `025_fundacao_preflight_readonly.sql` e `025_fundacao_postflight_readonly.sql`: REPEATABLE READ READ ONLY, um result set consolidado com totais/resultado. Inventariam relações, colunas, índices, constraints, views, funções/hash/owner/volatilidade/grants, policies, triggers, privilégios, buckets, executor, limites/uso e backfill.

Preflight informa empresas afetadas e bloqueia drift/inconsistência. Migration possui assertion do contrato e guard de estado antes de modificar schema. Expected JSON pré/pós gerado por fixture sintética: não é evidência de dados remotos. Não regenerar contrato para simplesmente aceitar drift desconhecido.

Postflight exige baseline REAL pré-025 para 18 fingerprints de relações operacionais/Storage/diagnóstico/ledger anteriores. Sem baseline, duplicado, corrompido, ausente ou divergente: BLOQUEIO. Utilitário offline `025_postflight_baseline.mjs` exige todos os checks, rejeita extras e cria arquivo novo com wx. Verifica manifesto, concessões/limites esperados, mapeamento e contador.

Os checks de manifesto completo/transições são para postflight IMEDIATO após migration, antes de retomar operações. Nenhum baseline real pré-025 foi obtido/embutido nesta tarefa. Postflight entregue está propositalmente bloqueado para preservação sem essa evidência. Resultado SQL de revisão não homologa concorrência nem autoriza exposição pública.

## 11. Aplicação futura e rollback

Procedimento documentado, NÃO executado:

1. Revisar código e executar concorrência real descartável; agendar manutenção.
2. Em futura tarefa autorizada, rodar preflight COMPLETO como auditor confiável no ambiente destino, exportar JSON e exigir zero bloqueios.
3. Revisar drift, inventário legado, decisões comerciais e EPI; não relaxar contrato por regeneração desconhecida.
4. Gerar offline postflight: `node supabase/tests/025_postflight_baseline.mjs PRE025_REAL.json POST025_COM_BASELINE.sql`.
5. Aplicar migration completa e coordenar backend. Backend novo antes do backfill bloquearia legado por ausência de grants, conforme deny-by-default.
6. Rodar postflight parametrizado imediatamente, exigir zero bloqueios, revisar atenções e provas externas antes de retomar operações.

Antes de COMMIT, erro reverte toda a transação; encerrar sessão/transação com ROLLBACK após erro. Após aplicação definitiva, reversão exige migration nova revisada e rollout coordenado. Não editar migrations anteriores nem reabrir EPI inseguro em rollback apressado. Inventários reais são evidência restrita, sem segredos/conteúdo operacional exportado.

## 12. Harness PostgreSQL REAL

`fundacao_025_concurrency.test.mjs` usa container postgres:16 aleatório, banco `engmarq_025_disposable`, **network none**, sem portas/volumes, trust somente dentro do container isolado. Não aceita DSN do app nem lê .env. Remove apenas container criado pelo harness. Imagem não é baixada automaticamente.

PGlite compila SQL das fixtures sintéticas; esse SQL é reproduzido no PostgreSQL real. Resultado PGlite não conta como concorrência. Teste auxiliar valida reprodução local do bootstrap, sem homologar ramo Docker.

Quando Docker estiver ativo e a imagem disponível:

```powershell
docker pull postgres:16
$env:REQUIRE_REAL_POSTGRES='1'
node --test supabase/tests/fundacao_025_concurrency.test.mjs
Remove-Item Env:REQUIRE_REAL_POSTGRES
```

REQUIRE_REAL_POSTGRES=1 transforma indisponibilidade em falha, para homologação não aceitar skip. Falhas após iniciar container são falhas reais do teste, não skips de conveniência.

Cenários com conexões independentes, barreira de lock e espera observada:

1. 99 ativos, duas criações: uma vaga;
2. 100 ativos, duas reativações: nenhuma vaga;
3. 99 ativos, criação+reativação: uma vaga;
4. 99 ativos, dois lotes de duas linhas: rollback atômico sem cruzar 100;
5. redução 100→99 concorrente com criação;
6. criação concorrente com redução, ordem inversa.

Verifica contador=contagem, contagem≤limite, winners/rejeições, SQLSTATE e ausência de deadlock detectado. Usa roles autenticadas de teste e admin funcional para limite. Não é teste do servidor PostgREST.

**Nesta máquina: seis cenários SKIPPED/DEFERRED. Docker CLI instalado, daemon indisponível; nenhum PostgreSQL descartável/psql utilizável. Zero cenários reais aprovados. Ramo Docker ainda não homologado. Fundação 025 não pode ser encerrada sem essa prova.**

## 13. Testes locais

| Grupo | Aprovados | Falhos | Skipped |
|---|---:|---:|---:|
| Backend completo, HTTP mockado | 458 | 0 | 0 |
| Banco/RLS/contratos completos, regressões 001–025 | 543 | 0 | 7 |
| Reprodução local adicional do bootstrap | 1 | 0 | 0 |
| **Total sem dupla contagem** | **1002** | **0** | **7** |

Sete skips: seis cenários reais 025 e CNPJ real 024 previamente deferido. Skips não são aprovados. Backend apresenta um warning de depreciação Starlette/httpx, sem falhas. Frontend não afetado; nenhuma suíte frontend executada.

Recorte 025-A: **40 testes locais aprovados**, incluindo pre/postflight com EPI presente/ausente e reprodução do bootstrap; **6 testes reais skipped**. Pre/postflight já entram na contagem banco/contratos e não são somados novamente.

Cobertura: A/B; roles; estados; ON/OFF/ausência; dependências; empresas futuras; Free explícito; 99/100/101; reativação/desligamento; mudança de teto; batches/rollback; DML direto; grants; dados preservados; EPI opcional; Storage/módulo/tenant; logos; RPC técnica; reserva sem troca de módulo; histórico de desligamento; baseline obrigatório; drift de policy e estado divergente bloqueando migration.

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q --tb=short -o addopts=
node --test --test-concurrency=1 supabase/tests/*.test.mjs
node --test supabase/tests/fundacao_025_harness.test.mjs
```

Teste auxiliar criado durante execução da suíte completa e executado separadamente, somado uma vez. Logs sintéticos no diretório temporário fora do Git. git diff --check sem erros de whitespace. Os auditores foram refinados após a suíte completa e revalidados na suíte específica, sem soma duplicada.

## 14. Atenções e limites

Preservação demonstrada somente em fixtures locais. PGlite verifica SQL/RLS e atomicidade sequencial, não sessões concorrentes reais. Não está homologada a afirmação de impossibilidade do 101º em todas as condições concorrentes sem o harness real. Código impede ultrapassagem nos caminhos locais exercitados, com concorrência ainda pendente.

Compatibilidade com catálogo remoto depende de preflight futuro. Operadores privilegiados e transações multi-tenant exigem disciplina de manutenção. URLs assinadas antigas expiram por TTL. Serviço HTTP Storage real não foi exercitado. Configuração de Auth/schemas expostos precisa ser revisada antes da 025-B.

## 15. Reservado à 025-B

Autocadastro, confirmação obrigatória de e-mail, callback, CAPTCHA/antiabuso, bootstrap atômico/idempotente após confirmação, retomada de cadastro interrompido, titularidade, provisionamento Free 100 com diagnóstico/ledger, UX de módulos bloqueados/dashboard Free e evolução comercial. Nenhum desses fluxos foi iniciado.

## 16. Confirmações

- Migrations 001–024 comparadas ao baseline e intactas.
- HEAD/branch preservados; nenhum commit/push.
- Nenhum Supabase remoto acessado/alterado; nenhum usuário/empresa remoto criado.
- Nenhum signup/bootstrap público; nenhum frontend ou Secret Key em frontend.
- Varredura dos arquivos novos/alterados sem chaves privadas, JWTs reais, access keys ou DSNs com senha. .env e backend/.env continuam ignorados e não foram modificados/exibidos.
- Tokens/credenciais em mocks são placeholders sintéticos sem validade operacional.
- Entrega somente 025-A, para revisão, com concorrência real deferida. Não iniciar 025-B.

## 17. Arquivos criados/alterados

Diagnóstico é artefato pendente da etapa anterior; os demais fazem parte desta implementação local.

- `backend/app/api/routes/usuarios.py`
- `backend/app/core/entitlements.py`
- `backend/app/core/errors.py`
- `backend/app/repositories/catalogos.py`
- `backend/app/repositories/colaboradores.py`
- `backend/app/repositories/dashboard.py`
- `backend/app/repositories/empresas.py`
- `backend/app/repositories/exames.py`
- `backend/app/repositories/treinamentos.py`
- `backend/app/repositories/usuarios.py`
- `backend/app/schemas/colaboradores.py`
- `backend/app/services/catalogos.py`
- `backend/app/services/colaboradores.py`
- `backend/app/services/dashboard.py`
- `backend/app/services/empresas.py`
- `backend/app/services/exames.py`
- `backend/app/services/profiles.py`
- `backend/app/services/treinamentos.py`
- `backend/app/services/usuarios_service.py`
- `backend/tests/test_dashboard.py`
- `backend/tests/test_empresas.py`
- `backend/tests/test_entitlements_025.py`
- `backend/tests/test_exames.py`
- `backend/tests/test_security.py`
- `backend/tests/test_usuarios.py`
- `docs/audits/2026-10-04/DIAGNOSTICO_FUNDACAO_025.md`
- `docs/audits/2026-10-04/RELATORIO_IMPLEMENTACAO_025A.md`
- `docs/audits/2026-10-04/expected-025-postflight-catalog.json`
- `docs/audits/2026-10-04/expected-025-preflight-catalog.json`
- `supabase/migrations/025_entitlements_quota_hardening.sql`
- `supabase/tests/025-catalog.mjs`
- `supabase/tests/025-postgres-fixture.mjs`
- `supabase/tests/025_contract_generate.mjs`
- `supabase/tests/025_fundacao_postflight_readonly.sql`
- `supabase/tests/025_fundacao_preflight_readonly.sql`
- `supabase/tests/025_postflight_baseline.mjs`
- `supabase/tests/fundacao_025.test.mjs`
- `supabase/tests/fundacao_025_concurrency.test.mjs`
- `supabase/tests/fundacao_025_harness.test.mjs`
- `supabase/tests/fundacao_025_security.test.mjs`
- `supabase/tests/package.json`

## 18. REVISÃO ADVERSARIAL PRÉ-PREFLIGHT

Esta seção substitui as descrições anteriores de backfill, atualização por linha do contador, locking e quantidade de cenários. Revisão da implementação local completa, incluindo assertion estrutural gerada, policies anteriores 001–024, backend alterado e auditores. Nenhuma evidência local representa baseline remoto.

### Vulnerabilidades e correções

1. **Contador como autoridade única:** o BEFORE trigger incrementava uso sem comparar colaboradores reais. Um contador reduzido por manutenção poderia autorizar ultrapassagem. Agora BEFORE conta `active=true`, sob lock de empresa; AFTER STATEMENT aplica delta das transition tables e exige contador=real. Divergência aborta atomicamente, sem reparo silencioso.
2. **ON CONFLICT:** BEFORE INSERT era capaz de incrementar uso mesmo quando a linha fosse descartada por DO NOTHING. Contabilização agora usa exclusivamente imagens efetivamente inseridas/alteradas/apagadas. Teste de regressão comprova contador preservado.
3. **Backfill comercial parcial:** preencher toda feature ausente poderia abrir módulos pagos de uma empresa já configurada, inclusive Free. Concessões novas somente quando `comercial_antes IS NULL AND features_antes='[]'`. Decisões anteriores permanecem exatas; ausência em empresa configurada permanece deny.
4. **Limite ilimitado indevido:** empresa configurada sem limite poderia herdar unlimited. Migration e preflight agora bloqueiam esse estado; exige decisão explícita anterior. Limites existentes permanecem intocados.
5. **EPI desnecessário:** removida criação de concessão EPI, inclusive OFF, quando não existia. ON anterior não habilita operação: helper nega EPI e objetos locais são colocados em quarentena.
6. **Logos UPDATE/DELETE:** completado gate da feature na linha antiga e no DELETE, para impedir operações após OFF/ausência mesmo com policy permissiva legado.
7. **Ordem de locks em UPDATE:** um cliente poderia adquirir linhas de colaboradores em ordem diferente antes de serializar empresa. BEFORE STATEMENT agora serializa o próprio tenant antes dos target tuples, incluindo UPDATE multi-row.
8. **Auditoria de objetos inesperados:** catálogo 025 agora inventaria todas as relações/funções públicas não pertencentes a extensões, além das superfícies privadas/Storage conhecidas. SECURITY DEFINER pública inesperada produz BLOQUEIO. Contrato sintético foi regenerado exclusivamente para as mudanças locais revisadas; não é baseline de preservação.
9. **Auditor incompleto:** preflight passou a exibir concessões atuais/propostas, elegibilidade exata, uso, contagem real e limite; acrescentadas verificações de CNPJ e referências tenant de colaboradores. Postflight mantém baseline real obrigatório e valida o backfill restrito.

### Quota e protocolo final

Fonte de verdade: `public.colaboradores WHERE active=true`. Limite: registro explícito em `empresa_limites`. Uso é derivado, nunca autorização suficiente.

- Cliente autenticado: `lock_colaborador_statement` obtém empresa do profile e adquire `empresas FOR NO KEY UPDATE` antes de qualquer linha alvo. `guard_colaborador_write` valida tenant imutável, role, estado e entitlement; read-lock de uso é FOR UPDATE; limite é lido SEM lock de tuple; conta estado real e exige `actual+delta<=limit` para transição positiva.
- Mudança comercial: PostgreSQL primeiro bloqueia seu target tuple comercial/limite; guard obtém a mesma empresa NO KEY UPDATE, depois uso FOR UPDATE, compara uso real/materializado e rejeita redução abaixo do uso. Caminho colaborador jamais espera tuple de limite, eliminando a inversão limite↔empresa desse par.
- AFTER STATEMENT: `account_colaborador_insert`, `account_colaborador_statement` (UPDATE) e `account_colaborador_delete` agregam transition tables, atualizam uso e timestamp e comparam estado real, tudo antes de concluir o statement. INSERT/UPDATE em várias linhas vê modificações anteriores no BEFORE VOLATILE; AFTER vê todas as modificações. Referência: https://www.postgresql.org/docs/16/trigger-datachanges.html e https://www.postgresql.org/docs/16/sql-createtrigger.html.
- INSERT ativo:+1; técnico inativo:0; INSERT inativo por usuário funcional:negado. Reativação:+1 e data nula; desligamento:-1 e data obrigatória; edição:0; DELETE técnico:-1 se ativo. Tenant imutável inclusive técnico. Clientes não apagam histórico.
- Lote/importação: cada linha é confrontada com contagem real e limite; qualquer falha desfaz statement, uso e transições. Rollback desfaz locks, dados, timestamps e histórico. TRUNCATE e escrita direta de uso permanecem negados.
- Materialização pode ficar temporariamente anterior à contagem dentro do statement; ela é conferida antes do retorno/commit. Leitores externos não veem essa fase não confirmada. ON CONFLICT DO NOTHING não altera uso. DO UPDATE e CTEs técnicas complexas podem ser recusadas conservadoramente se snapshots/deltas intermediários não permitirem comprovação; não há fallback de allow.
- Escopo comum do protocolo: empresa → uso. Target tuples comerciais e operacionais são distintos, e colaboradores não bloqueiam limite. Não se afirma uma ordem universal automática para SQL arbitrário multi-tenant de operadores privilegiados. Manutenção confiável e lote comercial multi-tenant devem pré-bloquear empresas em UUID crescente, depois target tuples e uso; caso contrário existe risco residual de deadlock/abort. Não relaxa quota nem autoriza retry cego. Prova concorrente real permanece pendente.

### Matriz de concessão legada

Quem recebe novas concessões: exclusivamente empresas presentes no manifesto de corte, sem registro comercial anterior e sem qualquer feature anterior. Status suspenso não muda; concessão não permite operar enquanto suspensa. Quem já tem configuração comercial ou concessão recebe ZERO features adicionais. OFF/ON e limites anteriores são preservados.

| FEATURE | MOTIVO DA CONCESSÃO LEGADA | QUEM RECEBE | RISCO | JUSTIFICATIVA |
|---|---|---|---|---|
| empresa.cadastro | Cadastro/logos disponíveis antes da 025 | Legado elegível acima | Baixo | Continuidade empresarial |
| usuarios.gestao | Gestão interna já existente | Legado elegível | Médio | Tenant/role/estado continuam obrigatórios |
| colaboradores.gestao | Operação já existente e catálogos mínimos | Legado elegível | Médio | Quota explícita e escrita limitada a empresa/gestor |
| treinamentos | Operação pré-025 acessível sem entitlement | Legado elegível | Comercial | Compatibilidade materializada; inventário remoto exige revisão |
| exames | ASO implementado pela 023 | Legado elegível | Comercial | Preserva acesso anterior, sem habilitar contas configuradas |
| documentos | SST implementado antes da 025 | Legado elegível | Comercial | Gate separado de tipos/objetos |
| relatorios.sst | Views/backend SST previamente existentes | Legado elegível | Comercial | Ainda exige módulos fonte e tenant |
| epi | Nenhuma concessão nova | Ninguém | Legado inseguro | Quarentena independente de eventual ON anterior; não concede ao Free |

Empresa futura não entra no manifesto. `has_empresa_feature` exige catálogo conhecido, registro `enabled=true`, profile ativo, empresa ativa, tenant igual e role operacional elegível. Ausente/OFF/desconhecida é false. `can_use_feature` acrescenta escrita empresa/gestor e nega EPI. Não existe allow por ser “legado” em runtime. Registros ilimitados novos são compatibilidade explícita do corte, nunca default para empresa futura/configurada sem limite.

### SECURITY DEFINER, Storage e EPI

Inventário completo de funções/owners/search_path/grants/argumentos: [INVENTARIO_SECURITY_DEFINER_025A.md](INVENTARIO_SECURITY_DEFINER_025A.md). Owner local é postgres e search_path é vazio. Contrato exige os owners/ACLs reais, incluindo privilégios herdados; executor/owners/membresias reais: **VALIDAR NO PREFLIGHT REMOTO**. Funções novas e triggers revogam PUBLIC EXECUTE. Helpers clientes retornam predicates/chave global, não dados individuais. RPC de reserva deriva tenant do profile; RPC de provisionamento é exclusiva de service_role confiável, deriva tenant do actor e não aceita empresa_id.

Storage é superfície independente: documentos/ASO/certificados exigem feature correspondente e tenant/path; ambiguidade exige documentos+exames+treinamentos. Logos exigem empresa.cadastro, identidade do objeto e role de escrita. Admin comercial, usuário inativo e empresa suspensa não obtêm acesso operacional. Restrictive policies se combinam por AND com policies permissivas legado. Signed URL depende de leitura autorizada no momento de emissão; URLs já emitidas podem continuar até TTL de 60s. Testes locais exercitam SQL/RLS de Storage, não emissão HTTP real ou bytes do serviço.

Inventário conhecido: 011 cria fichas_epi/fichas_epi_itens; 012 cria bucket assinaturas; 010 adiciona tipo de documento EPI. A 025 não desenvolve esses módulos, não cria relações ausentes e não apaga dados. Quarentena revoga grants de tabela/coluna/funções clientes, remove policies antigas dos objetos correspondentes presentes e nega assinaturas em Storage. Funções/objetos opcionais desconhecidos ou indiretos, exposição de schemas e URLs reais: **VALIDAR NO PREFLIGHT REMOTO**.

### Escritas e preservação

INSERTs da migration: manifesto privado de corte; empresa_comercial ausente (origem legado); features novas somente elegíveis; limites ausentes somente quando estado anterior não configurado; uso ausente derivado; mapeamento privado de tipos; mapeamento privado de objetos legado. Triggers 024 geram auditoria comercial desses INSERTs. CREATE OR REPLACE views altera definição, não conteúdo. Não há UPDATE/DELETE de linhas operacionais na aplicação da migration. UPDATEs de uso e INSERTs de histórico/reservas/profiles existem dentro de funções para operações futuras, não são executados como backfill operacional.

[Hashes e comparação 001–024](PRESERVACAO_001_024_025A.json): todas as 24 têm conteúdo Git idêntico ao HEAD b8e6f3c270254ee37a73acc1c7829aad69fc8d5c. Nenhuma foi escrita nesta revisão. Comparação bruta checkout↔blob é igual em 10; nas outras 14 há somente CRLF/mixed versus LF preexistente. Não foi normalizado nenhum arquivo. Hashes locais foram registrados; não existe hash bruto pré-turno para afirmar retrospectivamente igualdade byte a byte ao início. A afirmação anterior de igualdade bruta ao HEAD deve ser lida com essa ressalva.

### Preflight e postflight

READ ONLY, REPEATABLE READ, consulta consolidada e totais. Preflight inventaria estrutura, funções/ACLs/owner, policies, grants efetivos, limites/uso/real, riscos comerciais, Storage/EPI, CNPJ, referências tenant e fingerprints pré-025. Objeto inesperado gera BLOQUEIO. Incompatibilidade que impeça compilar a consulta pode produzir erro SQL antes do resumo: também é NO-GO para aplicar migration, nunca aprovação. Extensões são excluídas do inventário ampliado; não existe homologação indiscriminada de código de extensão instalado.

Postflight exige baseline REAL pré-025; sem ele, preservação é BLOQUEIO. Baseline sintético de testes é exclusivamente fixture local; nenhum baseline real foi criado. Os auditores não foram executados remotamente. Mudança de dado operacional, policy, manifesto/backfill ou contrato bloqueia. Resultado estático não comprova concorrência nem configurações externas de Auth/PostgREST/Storage.

### PostgreSQL real e testes

Detectados: Docker CLI e Compose 2.40.3; endpoint local named pipe. Daemon indisponível. Podman/postgres/pg_ctl/initdb/psql não encontrados no PATH, diretórios usuais ou serviço PostgreSQL local utilizável. Nenhuma dependência testcontainers foi identificada no projeto; ela dependeria de daemon disponível. Nenhuma instalação, DSN remoto, banco compartilhado ou serviço de produção foi usado.

Harness expandido para 11 cenários: A 99+duas criações; B criação+reativação; C 99+duas reativações; D 98+dois lotes de duas linhas que cabem isoladamente; E limite/criação nas duas ordens; F aumento/criação; G desligamento/criação; H rollback; I UPDATE multi-row; J tenants diferentes. Acrescentados statement_timeout e lock_timeout. Ramo real não homologado: cenários novos também permanecem SKIPPED.

**DEFERIDO — PostgreSQL real não disponível.** PGlite valida semântica sequencial/RLS/atomicidade de fixtures; não conta como PostgreSQL real concorrente.

Novos testes adversariais: tenant/UUID estrangeiro, catálogo estrangeiro, RPC privado, path/arquivo_path forjado, OFF/ausência em DML/RPC/logos, roles e estados em reativação, feature desconhecida, contador divergente baixo, ON CONFLICT, INSERT/UPDATE multi-row atômico, Free parcial sem grants pagos, configurada sem limite, função pública inesperada, preflight comercial e drift contra fingerprint prévio. Testes diretos na camada banco/RLS; testes REST/HTTP Supabase e emissão real de signed URL não foram executados.

Resultados definitivos serão registrados abaixo após a última execução completa. Frontend não alterado: NÃO APLICÁVEL.

### Riscos aceitos e itens remotos

Prova concorrente real pendente impede homologação final/aplicação da fundação. Operadores privilegiados são confiáveis e manutenção multi-tenant exige ordem explícita; comandos multi-tenant arbitrários podem abortar por deadlock. Concessões de módulos pagos a legado ainda sem configuração precisam de decisão comercial informada pelo inventário. Revogação não invalida URLs assinadas já emitidas nem desfaz statements já autorizados/em andamento. SQL não inspeciona todo o comportamento de serviços externos.

**VALIDAR NO PREFLIGHT REMOTO:** executor integral e owners/membresias; estrutura completa pré-025; objetos/policies/grants/funções adicionais; empresas elegíveis e decisões comerciais; limites ausentes/inferiores e contadores divergentes; CNPJ/integridade tenant; classificações de tipos e arquivos ambíguos; EPI/assinaturas opcionais e chamadas indiretas; buckets privados e policies reais; fingerprints reais anteriores. Schemas expostos, Auth e Storage HTTP exigem validação externa adicional antes de exposição pública.

**GO PARA PREFLIGHT REMOTO READ-ONLY**, exclusivamente execução manual futura para inventário e obtenção de baseline real, sujeita a revisar BLOQUEIOS/ATENÇÕES. Isso não autoriza migration, rollout, exposição pública ou 025-B. Nada remoto foi executado nesta tarefa. Nenhum commit/push; HEAD preservado; migration 025 não aplicada em banco real; somente fixtures locais descartáveis.
### Resultados finais da revisão

| Grupo | Aprovados | Falhos | Skipped | Escopo |
|---|---:|---:|---:|---|
| BACKEND | 458 | 0 | 0 | Suíte completa, HTTP mockado |
| BANCO/RLS + CONTRATOS | 574 | 0 | 12 | Suíte completa 001–025, PGlite + detecção real |
| CONTRATOS 025 e bootstrap | 4 | 0 | 0 | Recorte da suíte acima: preservação/contratos EPI presente/ausente, backfill, reprodução bootstrap |
| PREFLIGHT 025 | 4 | 0 | 0 | Recorte: EPI presente/ausente, função inesperada, configurada sem limite |
| POSTFLIGHT 025 | 3 | 0 | 0 | Recorte: baseline obrigatório EPI presente/ausente e fingerprint divergente |
| ADVERSARIAL NOVO | 30 | 0 | 0 | Novo arquivo fundacao_025_adversarial.test.mjs; inclui checks pre/post |
| POSTGRESQL REAL 025 | 0 | 0 | 11 | Todos DEFERIDOS; não são aprovados |
| FRONTEND | — | — | — | NÃO APLICÁVEL, não alterado |

Total sem dupla contagem: **1032 aprovados, 0 falhos, 12 skipped**. Recortes não são somados ao total. O skipped adicional é concorrência CNPJ 024 anteriormente deferida. Warning backend: depreciação Starlette/httpx, sem falha. Recorte completo 025: 70 aprovados + 11 skipped.

Comandos finais executados localmente:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q --tb=short -o addopts=
node --test --test-concurrency=1 supabase/tests/*.test.mjs
```

Uma execução intermediária reprovou uma expectativa antiga de treinamento liberado para tenant parcialmente configurado; a expectativa foi corrigida para deny. Outro teste detectou encoding incorreto do rótulo de check adicionado ao gerador; rótulo corrigido e auditores regenerados. A última suíte completa acima passou após todas as correções. Nenhuma falha intermediária foi convertida em skip.
