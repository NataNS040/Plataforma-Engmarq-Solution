# Cadastro público Norveo — preparação, homologação e operação

## Estado da entrega

Código candidato preparado localmente. Nenhuma migration foi aplicada nesta preparação; nenhum dado ou configuração de produção foi acessado ou alterado, e não houve commit, push ou deploy. As alterações locais de domínio e infraestrutura foram preservadas. A candidatura continua **APROVADA COM RESSALVAS**, condicionada à homologação integrada e autorização específica de implantação/ativação.

024 e 025-A constam como aplicadas nas evidências locais. O SHA-256 da 025-A é `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5`, igual ao arquivo local; referência: `docs/audits/2026-10-09/APLICACAO_025A_RESULTADO.md`. Isso é evidência histórica, não leitura atual do catálogo remoto.

## Estruturas reaproveitadas e fluxo

Reaproveitados: Supabase Auth, `empresas`, `user_profiles`, RLS 015–023, `empresa_comercial`, `empresa_features`, `empresa_limites`, `empresa_uso`, auditoria e `engmarq_private.onboarding_solicitacoes`. Não há novo catálogo de planos, endpoint de cadastro ou tabela de reservas de CNPJ. As tabelas novas são o controle privado de abertura global e a admissão administrativa temporária; não constituem outro sistema de autenticação.

`/login` oferece `/cadastro` e `/recuperar-acesso`. O cadastro envia identificação e credenciais ao Auth com CAPTCHA. Tenant, papel e benefícios são constantes do banco. O perfil recebe `empresa`; `admin` representa Superadmin e nunca é atribuído publicamente. Cada cadastro cria um UUID novo, sem opção de aderir a empresa existente.

O gratuito é representado por sete features existentes e limite explícito de 100 ativos, não por uma assinatura. `plano_comercial_id` permanece nulo. EPI/assinaturas continuam em quarentena. Limites e benefícios dos tenants existentes não são alterados.

Empresa, perfil, benefícios, cota, uso e onboarding pertencem à mesma transação do INSERT em Auth. Falhas SQL fazem rollback do conjunto. Essa atomicidade **não garante entrega de e-mail, sucesso do SMTP ou recebimento da resposta HTTP**. Falhas externas exigem recuperação da mesma identidade, não um novo tenant.

## Preflight e privilégios

`supabase/pending/public_company_signup.sql` continua fora das migrations automáticas. O preflight exige executor `postgres` confiável, replicação `origin`, privilégios DDL, papel Auth capaz de inserir usuários e colunas Auth compatíveis. Não altera proprietário de `auth.users`. Um lock na tabela Auth serializa o inventário de triggers com o DDL. Timeouts: lock 5s e statement 60s.

O contrato estrutural vem do postflight 025-A revisado e fixado por hash. Confere relações/colunas, constraints, unicidade do CNPJ, RLS/policies, grants, proprietários, funções/corpos/configuração/ACLs e bindings/estado de triggers. Abrange empresas, perfis, colaboradores/catálogos, fundação comercial, onboarding, funções privadas de segurança/cota e a infraestrutura revisada `rls_auto_enable` com seus bindings de event trigger. Confere os sete registros de features. Detecta objetos extras nas categorias conferidas e aborta; não corrige estruturas.

Qualquer trigger não interna de INSERT em Auth, inclusive desabilitada, provoca erro. Nenhuma é removida/substituída. Outro provisionador exige revisão explícita de integração. O contrato não substitui inventário de hooks, providers, schemas expostos, outros fluxos administrativos e configurações externas.

Arquivos preparados, não executados em serviço persistente/remoto:

- `public_company_signup_preflight_readonly.sql`: catálogo antes da aplicação, sem reparos.
- `public_company_signup.sql`: candidata fechada com preflight embutido.
- `public_company_signup_postflight_readonly.sql`: dependências preservadas, função instalada por hash/proprietário/ACL, binding Auth e controle privado. Exibe estado da abertura; após aplicar deve ser `false`.
- `public_company_signup_activate.sql`: repete validações antes de abrir e exige referência aprovada em `norveo.signup_approval_reference`. A referência é trilha operacional, não substitui aprovação nem prova automaticamente SMTP/CAPTCHA.
- `public_company_signup_close.sql`: fechamento operacional conservador.
- `public_company_signup_recovery_review.sql`: triagem privada somente leitura de um CNPJ, definido por `norveo.support_cnpj`, sem divulgação pública ou mudança de titularidade.

O gerador `supabase/tests/public_signup_contract_generate.mjs` processa apenas arquivos, sem abrir banco/rede ou ler env. Tem pin do postflight fonte; não regenerar para silenciar drift. `npm run check:signup-contract` confere os candidatos gerados. As migrations 024/025-A e seus contratos publicados não foram modificados.

## Bloqueio no servidor e cadastro interno

O marcador `app_metadata.norveo_internal_provisioning` foi removido: o [Auth oficial](https://github.com/supabase/auth/blob/master/internal/api/admin.go) executa `tx.Create(user)` antes de `UpdateAppMetaData`. Não é possível usá-lo para autorizar o INSERT.

O backend gera UUID aleatório e chama `autorizar_auth_interno`, acessível somente a `service_role`, com ator autenticado, UUID e e-mail normalizado. A RPC verifica ator, empresa ativa e benefício `usuarios.gestao`. A tabela privada de admissões tem RLS e nenhum privilégio direto para clientes ou service_role. A admissão expira em dez minutos e é consumida na transação Auth, exigindo UUID/e-mail exatos, ator/empresa ativos, benefício habilitado e ausência de payload público. Metadados não autorizam esse caminho, que não cria empresa.

O perfil interno continua na RPC original `provisionar_perfil_interno` da 025-A: revalida ator, tenant e papel, recusando `admin`. Falha no perfil conserva a compensação existente, restrita à identidade recém-criada. Timeout de Auth não é repetido: pode deixar identidade sem perfil e exige reconciliação pelo UUID. Admissões abandonadas expiram sem conceder acesso ou reservar CNPJ; não há exclusão automática. Cadastros públicos continuam criando empresa, perfil e benefícios atomicamente.

Implantação coordenada: suspender temporariamente criação interna, publicar todos os processos de backend compatível, instalar candidata somente após autorização, validar postflight e criação interna, retomar o endpoint. A RPC nova não existe antes da candidata; não há fallback inseguro. OAuth, convites do Dashboard e outros processos sem admissão serão recusados e precisam ser inventariados. Rollback deve manter backend compatível e fechar somente o gate, preservando empresas, usuários e dados.

A versão instalada do Auth ainda precisa comprovar o UUID fornecido em `admin.createUser`. Os testes locais são PGlite descartável e transporte HTTP simulado. A concorrência da cota 025-A tem homologação histórica em PostgreSQL real; a integração do novo cadastro permanece pendente. Conforme a decisão operacional, não criar segundo projeto. Ensaios no projeto existente exigem autorização separada e plano controlado: gate fechado também impede cadastro público fictício; abertura global para teste não limita acesso à empresa de teste. Resolver o controle operacional antes da ativação pública.

`engmarq_private.public_signup_control` nasce com `enabled=false`, RLS, sem policies e sem privilégios para `PUBLIC`, `anon`, `authenticated` ou `service_role`. Só infraestrutura confiável altera sua linha. A função é privada, `SECURITY DEFINER`, `search_path=''`, execução pública revogada. Nenhum cliente escolhe tenant/papel/plano ou altera o controle.

A trigger recusa novos cadastros públicos mesmo por Auth direto, sem marcador ou com metadata falsificada. Identificação ausente é rejeitada também após abrir. Fechado, o INSERT Auth aborta sem deixar usuário/empresa/perfil. O controle é consultado com `FOR SHARE`; fechamento espera transações em andamento. Transações anteriores podem concluir e são preservadas. Se houver timeout, o fechamento NÃO está confirmado; investigar e executar novamente somente dentro da autorização operacional.



Manter também `Allow new users to sign up` desligado no Auth durante preparação. `VITE_PUBLIC_SIGNUP_ENABLED` controla somente a interface. O gate não bloqueia UPDATE de usuários existentes, login, reenvio ou recuperação; a integração disso precisa ser comprovada no Auth real.

## Recuperação e CNPJ reservado

Política implementada: **conservar a reserva e recuperar a mesma identidade**. Não há TTL que libere CNPJ, cron de limpeza, transferência automática, novo administrador ou mudança automática de e-mail/empresa. `completed` significa provisionamento do banco, não confirmação de e-mail. `expira_em` é prazo operacional de triagem; não muda direitos nem libera CNPJ.

`/recuperar-acesso` solicita reenvio de confirmação (`auth.resend`, tipo signup) ou recuperação de senha (`resetPasswordForEmail`). Só informa e-mail, sem empresa_id/CNPJ/user_id. Não consulta reservas/perfis e recebe mensagem neutra contra enumeração. Usa CAPTCHA quando configurado; cooldown visual de 60s é UX e não substitui limites Auth.

O link de senha leva a `/nova-senha`. A alteração exige identidade validada no servidor (`getUser`) e muda somente a senha dessa identidade (`updateUser`). Senha/confirmacão são validadas; erros internos não são exibidos. Após salvar, sessão local encerrada e retorno ao login. Link expirado exige novo envio. Vínculo/dados preservados. Invalidação de outras sessões segue o Auth e deve ser comprovada; não se promete revogação imediata de todos os access tokens.

Sem acesso ao e-mail original ou cadastro não reconhecido:

1. Abrir chamado pelo canal real em `VITE_SUPPORT_EMAIL`; não enviar senha/token/documentos sensíveis por formulário público.
2. Operador registra chamado, solicitante, representação da empresa, evidências, consentimentos e decisão em sistema de suporte restrito.
3. Em futura sessão autorizada somente leitura, usar a triagem de um CNPJ; conferir identidade original, confirmação, prazo, uso/histórico sem divulgar e-mail/identificadores a terceiros.
4. Buscar recuperação/contato com administrador original por canais verificados. Conhecer CNPJ, controlar outro e-mail ou confirmar e-mail NÃO comprova titularidade da empresa.
5. Em disputa ou necessidade de mudança de titularidade/e-mail, manter reserva. Mudança exige análise humana, autorização separada e procedimento auditado específico; não está implementada nem autorizada aqui. Não liberar/transferir para concluir solicitação pública.

Isso resolve retomada pelo titular do e-mail e encaminha disputas sem tomada de conta. Suporte deve ter responsável/canal operacional antes da abertura; disputa não é automatizada.

## Cota e concorrência

Limite: **100 ativos**, com histórico dos desligados. Cadastro, reativação, API e REST/lote usam triggers 025-A. Importação sequencial preserva sucessos e para no erro de cota com mensagem do backend. INSERT em lote excedente aborta integralmente. Limites pagos permanecem intactos.

Concorrência da 025-A **já homologada** em PostgreSQL real: 20 passes, zero skips/falhas, mesma migration/hash; `docs/audits/2026-10-05/RELATORIO_CONCORRENCIA_REAL_025A_POSTGRES16.md`. O último rerun pulou cenários por Docker indisponível; isso não invalida nem substitui a evidência histórica. Ela não homologa novo Auth, signup concorrente por CNPJ, abertura/fechamento, SMTP ou HTTP: estes permanecem pendentes em ensaio controlado autorizado.

## Configuracao externa e ordem segura

Plano vigente: docs/NORVEO_PRODUCTION_RELEASE.md. Publicacao no projeto atual, sem segundo projeto; preflight e backup aprovados, SMTP Brevo confirmado pelo usuario. Auth v2.197.0 identificado por GET health; UUID anterior ao INSERT confirmado no codigo dessa versao, sem criar usuario. Frontend raiz e workflow manual; backend com pausa operacional antes da migration. Antes da candidata nao existe gate no banco: conferir Auth fechado. Nao reaplicar 024/025-A. Comandos, autorizacoes e pontos de parada constam no runbook vigente.

## Rollback operacional preservando dados

Preferência: **fechar o recurso mantendo infraestrutura e dados**, não desfazer tenants:

1. Sob autorização, desligar cadastro no Auth e oferta na UI. Preservar login, SMTP/CAPTCHA e recuperação.
2. Executar candidato de fechamento aprovado: altera só controle privado para false, sem apagar ou remover trigger/policies. Timeout/erro não confirma fechamento; investigar transações.
3. Conferir gate e rejeição de signup em homologação; produção futura somente verificações aprovadas sem novos dados. Contas concluídas antes do fechamento são preservadas.
4. Manter backend com admissao previa/RPC 025-A. Reverter somente releases compatíveis com banco/CAPTCHA; frontend sem CAPTCHA pode bloquear login, backend sem admissao previa pode bloquear cadastro interno.
5. Postflight/inventário confirmam preservação de empresas/perfis/Auth/cotas/dados. Usuários existentes mantêm acesso; trigger é INSERT, não UPDATE.
6. Remoção futura da infraestrutura exige outro plano aprovado/testado com Auth fechado e validação exata da trigger. Não usar CASCADE/remover triggers alheias/apagar contas: FKs e auditoria podem impedir ou tornar destrutiva a limpeza. Não há remoção automática nesta entrega.

Se a configuração real do Auth impedir reenvio de confirmação quando signup estiver desligado, não prometer que isso continuará funcionando: homologar esse comportamento. Com o gate false e trigger íntegra confirmados, uma autorização operacional pode manter/reabrir somente a configuração Auth necessária ao reenvio, conservando o bloqueio de novos INSERTs públicos pelo banco e a UI fechada. Nunca fazer isso com trigger removida, desabilitada ou fechamento não confirmado.

Falha antes do COMMIT aborta DDL. Fechamento após COMMIT não desfaz cadastros nem e-mail enviado. Migration não idempotente; sua própria trigger rejeita reaplicação. Registrar versão no histórico só após aprovação.

## Arquivos e validação local

Correção local após o inventário remoto: o Auth atual usa `auth.users.email character varying(255)`. A candidata e o preflight gerado passam a aceitar `text`, `varchar` sem limite e `varchar(n)` com capacidade de pelo menos 255 caracteres. No catálogo PostgreSQL, `atttypmod` de varchar(n) é n+4; -1 indica ausência de limite. Tipos fixos `char`, limites menores, domínios e tipos não textuais continuam recusados, sem ampliar casts arbitrariamente. As verificações de UUID, JSONB, booleano, proprietário, privilégios, RLS e triggers permanecem intactas.

Nenhum ALTER de `auth.users` foi adicionado à candidata. Parâmetros `email text`, normalização `lower/btrim`, comparação da admissão e atribuição de e-mail aos perfis são compatíveis com varchar e permanecem iguais. A RPC da 025-A extrai e-mail com `to_jsonb(u)->>'email'`, produzindo text independentemente do tipo textual da coluna; a migration aplicada não foi modificada.

A fixture SQL padrão agora reproduz varchar(255). Os testes adicionais cobrem preflight e ambos os fluxos nos quatro tipos aceitos, preservação do tipo/capacidade e rejeição antes do DDL de varchar(254), char(255), integer, jsonb e text[]. A candidata está preparada para nova conferência somente de leitura, não para aplicação automática. O preflight completo ainda exige executor postgres em transação READ ONLY; o conector disponível anteriormente usava supabase_read_only_user. Versão/configurações reais do Auth e integração SMTP/CAPTCHA continuam pendentes.

Validação desta correção: `npm run test:signup` — 27 testes passaram em PGlite descartável; `npm run check:signup-contract` — passou; backend `python -m pytest tests/test_usuarios.py` — 37 testes passaram, com aviso de depreciação já existente do TestClient. Nenhum acesso remoto ou migration em banco persistente foi realizado. As contagens gerais abaixo registram a preparação anterior, não uma nova execução de todas as suítes nesta correção.

- Candidatos: `supabase/pending/public_company_signup*.sql`.
- Contrato/testes: `supabase/tests/public_signup_contract_generate.mjs`, `public_signup.test.mjs`, `package.json`.
- Backend: `backend/app/repositories/usuarios.py`, `backend/tests/test_usuarios.py`.
- Auth: `frontend/src/modules/auth/LoginPage.tsx`, `SignupPage.tsx`, `RecoveryPage.tsx`, `PasswordResetPage.tsx`, `recovery.ts`, `signup.ts`, `captcha.ts`, `useCaptcha.ts`.
- Rotas/config: `frontend/src/App.tsx`, `frontend/.env.example`.
- Testes frontend: `frontend/tests/captcha.test.ts`, `recovery.test.ts`, `recovery-ui.test.tsx`.
- Docs: este arquivo e `docs/PUBLIC_COMPANY_SIGNUP_HOMOLOGATION.md`.

Checklist bloqueante em `docs/PUBLIC_COMPANY_SIGNUP_HOMOLOGATION.md`. PGlite/mocks não substituem Auth/SMTP/JWT/PostgREST/API/browser reais. Testes SQL interpretam candidatos exclusivamente em harness descartável em memória, sem CLI de migrations ou banco persistente. Evidência histórica da cota é separada do novo signup.

Comandos de validação desta preparação: backend `python -m pytest` (459 passes); frontend `npm test` (223 passes), typecheck, build e lint dos módulos Auth; SQL `npm run test:signup` (18 passes) e `npm run check:signup-contract` (incluindo bloqueio, deriva de contrato, privilégio por coluna, reserva, ativação/fechamento e triagem). O build também é conferido com `VITE_BASE_PATH=/`. Lint global anterior permanece com problemas fora do escopo. Nenhum teste local conta como homologação real do novo Auth.
