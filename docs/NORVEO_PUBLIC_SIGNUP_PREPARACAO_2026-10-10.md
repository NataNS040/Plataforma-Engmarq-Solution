# Preparação do cadastro público gratuito — 10/10/2026

Decisão: candidata revisada e preflight remoto aprovado; aplicação NÃO autorizada nem executada. Cadastro público e CAPTCHA não foram ativados. Nenhum DDL/DML, alteração Auth, deploy, commit ou push nesta revisão. As confirmações manuais de login, Superadmin, empresas, isolamento e Storage fornecidas pelo usuário são a referência funcional atual.

## Escopo e evidências

Projeto: kkjckayiqvlqpdjyoxyv. Candidata: `supabase/pending/public_company_signup.sql`, SHA-256 `b3faa96cbc60a8ee2cadffedc6d9c1c655edf2d10c7a1576ca01ed532ceecd60`. Arquivo preservado, fora de migrations.

Preflight remoto executado via psql 17, serviço engmarq_backup, `-X -w -v ON_ERROR_STOP=1`, com `default_transaction_read_only=on` adicional. Script usa REPEATABLE READ READ ONLY: BEGIN / DO / DO / ROLLBACK, exit 0. Contrato fixado da 024/025-A passou: funções, corpos, proprietários, ACLs, políticas, colunas, constraints e triggers das dependências selecionadas; não houve regeneração para aceitar drift.

Baseline adicional `supabase/pending/public_company_signup_impact_readonly.sql`: exit 0, read_only=on e ROLLBACK. Uma primeira execução falhou na referência ambígua a id no SELECT de buckets; a sessão encerrada desfez a transação somente de leitura. Consulta corrigida e reexecutada integralmente.

| Verificação atual | Resultado |
|---|---|
| Empresas | 3, sendo 2 ativas |
| Perfis ativos | 1 admin e 1 empresa |
| Usuários Auth | 2 |
| Limites existentes | 3 ilimitados, max_colaboradores_ativos NULL |
| Divergências empresa_uso vs colaboradores ativos | 0 |
| Triggers não internos em auth.users | 0 |
| Storage documentos | privado, 4 objetos |
| Storage logos | privado, 0 objetos |
| Gate e RPC de admissão da candidata | ausentes, conforme esperado |

Testes locais: 27/27 em `node --test public_signup.test.mjs`; `node public_signup_contract_generate.mjs --check` exit 0, sem escrita; backend `pytest tests/test_usuarios.py -q` 38/38; frontend signup.test.ts e signup-ui.test.tsx 5/5. Log da migration: `supabase/tests/signup-review-tests.log`. PGlite simula Auth e papéis; não valida GoTrue/SMTP real nem concorrência entre conexões PostgreSQL reais.

## Revisão e impacto

Dependências: fundação 024/025-A, schema privado, normalização/validação e unicidade de CNPJ, registro das sete features, RLS, RPC de perfil interno e contador/quota transacional. O contrato remoto selecionado passou; não representa um fingerprint de todos os dados nem de todas as configurações da plataforma.

A instalação cria duas tabelas privadas com RLS e sem grants aos clientes, RPC de admissão executável apenas por service_role, função trigger SECURITY DEFINER com search_path vazio e execução direta revogada, e trigger AFTER INSERT em auth.users. Gate nasce enabled=false. Dados, limites, usuários e permissões das empresas existentes não recebem UPDATE/DELETE/backfill. Nenhuma política Storage é substituída. Apenas empresas criadas pelo novo fluxo recebem 100 colaboradores ativos e ilimitado=false; o limite é imposto pela infraestrutura 025-A existente, com bloqueio e contagem transacionais.

Os metadados do cliente fornecem identificação, nunca role/tenant/features/limites. Perfil novo é sempre empresa, ativo, em tenant novo. CNPJ inválido/duplicado, payload inválido e falha intermediária desfazem a criação transacional. Reservas não expiram liberando CNPJ automaticamente. `completed` indica provisionamento, não confirmação de email.

Impacto operacional relevante: trigger intercepta TODA inserção Auth. Com gate fechado, novas contas sem admissão interna falham; login e reset de identidades existentes não inserem auth.users. OAuth primeiro login, convites e criação manual/Admin API precisam ser inventariados/homologados antes da instalação. O backend já chama autorizar_auth_interno antes de admin.create_user com UUID fixado e depois provisionar_perfil_interno. A publicação documenta INTERNAL_USER_CREATION_ENABLED=false: manter assim até homologação e autorização própria. Confirmar que o GoTrue real aceita/preserva o UUID enviado; se falhar, interromper, sem afrouxar o trigger.

Admissão e criação de perfil ocorrem em chamadas distintas: há compensação no backend, não atomicidade entre todas as chamadas HTTP. Homologar timeout, falha de perfil e limpeza de Auth. A função de admissão confia no backend privilegiado para identificar actor_id; service_role deve continuar apenas no servidor.

Instalação usa LOCK auth.users SHARE ROW EXCLUSIVE: bloqueia inserções simultâneas durante a transação. lock_timeout=5s e statement_timeout=60s limitam espera/execução; não garantem duração total de 60s. Se existir trigger INSERT, mesmo desativado, a candidata aborta. Não remover nem substituir para contornar. Migration não é reexecutável: nenhuma repetição automática após resultado incerto.

## Backup e recuperação

Disponibilidade física confirmada por leitura em `C:\Backups\EngMarq\engmarq_pre025a_20261008_234739`. Nove entradas SHA256SUMS conferidas, todas iguais: dump, manifestos, status, TOC e quatro arquivos privados Storage. Dump 556519 bytes; pg_restore --list exit 0. Originais não modificados.

Status preservado: BACKUP CRIADO MAS RESTORE NÃO TESTADO. Backup anterior à 025-A e à publicação; não é snapshot atual. A aceitação anterior desse risco para 025-A não é tratada como aprovação desta nova migration. Dump não inclui roles globais, segredos/configurações de plataforma nem garante recuperação de Vault; Storage bytes estão salvos separadamente, sem snapshot atômico com banco.

Recuperação adequada para esta fase deve priorizar preservação de dados: antes do COMMIT, erro implica rollback integral; depois da instalação, manter gate fechado e interromper a etapa; depois de futura abertura autorizada, usar `public_company_signup_close.sql` somente com autorização de fechamento, preservando trigger, contas, empresas e arquivos. Esse fechamento NÃO desfaz instalação nem corrige incompatibilidade no fluxo de criação interna. Nesse caso, preparar reparo específico após diagnóstico, sem remover proteções automaticamente.

Antes de aplicar: obter backup atualizado pós-025-A de banco e bytes Storage, manifestos/hashes, configurações relevantes sem segredos em Git, e validar recuperação em ambiente isolado Supabase/PostgreSQL 17 compatível com roles/extensões. Não foi criado banco nem executado restore nesta rodada. Restore integral em produção é último recurso e exige autorização específica: causa indisponibilidade e perde alterações posteriores ao snapshot. Restaurar primeiro em ambiente isolado e planejar reconciliação dos dados posteriores, preservando originais. A documentação oficial confirma que backup de banco não inclui bytes Storage: https://supabase.com/docs/guides/platform/backups.

## Plano exato, condicionado a autorização futura

1. Manter Auth disable_signup=true, frontend VITE_PUBLIC_SIGNUP_ENABLED=false, CAPTCHA desativado e criação interna pausada. Reconfirmar configurações por leitura na janela de aplicação. Não confundir configuração Auth com o gate SQL.
2. Homologar em Supabase isolado: instalação com gate fechado; admissão interna via backend/GoTrue; payloads inválidos, duplicidade de email/CNPJ, spoof de role/tenant; confirmação email e recuperação; tenant A não lê/escreve tenant B; Storage privado; 100 ativos aceitos e 101º rejeitado, inserção em lote, inativação e reativação, duas conexões concorrentes no limite. Abertura do gate apenas no ambiente isolado. Comparar dados/permissões dos tenants de fixture antes/depois. Não criar contas de teste em produção nesta preparação.
3. Preparar e verificar backup atual/recuperação acima. Registrar baseline com fingerprints por empresa e objetos Storage em destino protegido, além das contagens agregadas; repetir imediatamente antes/depois da instalação para provar ausência de alteração, distinguindo tráfego legítimo concorrente. Não registrar PII no relatório Git.
4. Congelar arquivo/hash revisado e repetir preflight READ ONLY na produção, incluindo inventory Auth e estado origin. Qualquer drift exige revisão, sem regenerar contrato ou reparar automaticamente. Obter autorização específica para instalar esta versão com gate fechado.
5. Após autorização, executar SOMENTE o arquivo completo `supabase/pending/public_company_signup.sql`, uma vez, como postgres pelo serviço SSL confirmado, usando psql `-X -w -v ON_ERROR_STOP=1 -f`. Respeitar BEGIN/COMMIT internos; não usar --single-transaction por fora, não fracionar, não rodar activate.sql. Conferir hash antes/depois e registrar exit/status COMMIT. Se conexão cair, consultar catálogo/postflight antes de decidir qualquer retry.
6. Executar `public_company_signup_postflight_readonly.sql` e baseline de impacto em READ ONLY; confirmar enabled=false, novas ACLs/owners/triggers corretos, empresas/perfis/limites anteriores intactos, RLS/Storage preservados. Comparar com baseline protegido. Confirmar login, Superadmin e acessos atuais com sessões autorizadas. Nenhum teste de inserção persistente em produção sem escopo autorizado.
7. Se houver falha, parar rollout e manter controles fechados; antes do COMMIT rollback automático, após COMMIT diagnóstico/reparo específico autorizado. Não restaurar backup antigo nem apagar novas entidades como rollback habitual.
8. Entregar resultados da instalação fechada e pedir autorização separada para abertura. Somente nessa etapa futura definir ordem do gate SQL, configuração Auth e publicação frontend, com referência explícita em norveo.signup_approval_reference, postflight e smoke. CAPTCHA permanece uma decisão separada, sem ativação implícita.

Limitações: Auth settings/container foram documentados no deploy, não reconsultados nesta rodada. Changelog markdown Supabase não pôde ser recuperado (web não aceita content-type; tentativa HTTP local sem conexão); documentação oficial de RLS e backups consultada. Nenhuma implementação Supabase foi alterada com base em suposição de versão.
