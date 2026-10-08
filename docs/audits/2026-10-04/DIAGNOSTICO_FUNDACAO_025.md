# Diagnóstico técnico da Fundação 025 — autocadastro, Free Tier e enforcement

Data: 2026-10-04. Repositório: NataNS040/Plataforma-Engmarq-Solution. Branch: `main`.
Baseline inspecionado: `b8e6f3c270254ee37a73acc1c7829aad69fc8d5c`
(`test: close foundation 024 remote validation`).

**Somente diagnóstico. Nenhuma implementação, migration, backfill, consulta remota,
infraestrutura, commit ou push foi realizado nesta tarefa.**

Legenda das decisões: **CONFIRMADO PELO USUÁRIO** = requisito recebido;
**RECOMENDAÇÃO TÉCNICA** = proposta sujeita à aprovação;
**DECISÃO PENDENTE** = escolha que não será assumida na implementação.
As descrições de comportamento atual abaixo são evidências de código, não propostas.

## 1. RESUMO EXECUTIVO

**CONFIRMADO PELO USUÁRIO:** abrir autocadastro empresarial, primeiro perfil com role
`empresa`, início gratuito, máximo de 100 conforme regra de quota, equipe própria e
cadastro de colaboradores. Treinamentos, exames/ASO, documentos SST, EPI e relatórios
SST ficam bloqueados no Free. Admin global administra conta/comercial e nunca opera
usuários ou dados individuais do tenant. Empresas existentes não serão convertidas
silenciosamente em Free. O escopo desta tarefa termina neste documento.

A 024 fornece a fundação SQL necessária, mas não implementa esse produto: catálogo
de oito features, concessões por empresa, limites, agregado de uso, diagnóstico,
ledger privado de onboarding, auditoria comercial e CNPJ canônico único. Não há
bootstrap, signup, manutenção de quota nem integração de features aos módulos.

**RECOMENDAÇÃO TÉCNICA:** Auth com confirmação de e-mail antes do bootstrap; uma
operação transacional estreita no banco cria empresa, primeiro perfil, concessões
Free, limite, uso, diagnóstico e conclusão idempotente. Backend verifica identidade
e abuso; banco protege chamadas diretas. Reutilizar as estruturas da 024, fechar
EPI/assinaturas, classificar anexos e preparar concessões legadas explícitas antes
de ativar gates. Abertura pública fica por último.

Os maiores riscos são bootstrap parcial via múltiplas chamadas HTTP, quota concorrente,
helpers compartilhados entre módulos, arquivos sem classificação, acesso legado
EPI/assinaturas e quebra dos tenants antigos ao ativar fail-closed sem concessões.

## 2. ESTADO ATUAL DO REPOSITÓRIO

HEAD e referência local `origin/main` correspondem ao baseline obrigatório; árvore
limpa no início. Não houve fetch. Não foram encontrados AGENTS.md no inventário do
repositório. Não foram lidos `.env` ou credenciais. A análise foi estática, de arquivos
versionados: migrations, contratos/auditores, testes, serviços, rotas e interfaces.

Fechamento remoto da 024, informado pelo usuário e registrado em
[024_postflight_baseline.md](../../../supabase/tests/024_postflight_baseline.md):
527 OK, 81 ATENÇÕES, 0 BLOQUEIOS, `024 VALIDADA — APROVADO PARA REVISÃO FINAL`.
Histórico local do fechamento: 87 aprovados, 0 falhos, 1 skipped. Nenhum teste foi
executado novamente nesta tarefa documental. Concorrência PostgreSQL real da 024
continua **DEFERIDA/SKIPPED**, não aprovada.

O diagnóstico anterior
[DIAGNOSTICO_AUTOCADASTRO_FREE_TIER.md](../2026-10-03/DIAGNOSTICO_AUTOCADASTRO_FREE_TIER.md)
é contexto histórico anterior à 024: suas afirmações de ausência de CNPJ canônico e
tabelas comerciais foram superadas. A autoridade atual é o baseline acima.

| Evidência inspecionada | Descoberta relevante |
|---|---|
| `supabase/migrations/001–014` | Estrutura inicial, campos empresariais, catálogos globais, EPI/assinaturas e grants legados |
| `015`, restaurada também pela `021` | Gestão de equipe somente empresa/gestor do próprio tenant; Admin excluído |
| `016` | Colaboradores com FK tenant composta e escrita controlada; reativação proibida |
| `017–018` | Catálogos organizacionais, treinamentos/matriz e certificados protegidos por tenant; helper compartilhado |
| `019–023` | Documentos privados, logos tenant, ASO dentro de documentos, views invoker e integridade |
| [024_fundacao_comercial.sql](../../../supabase/migrations/024_fundacao_comercial.sql) | Fundação comercial, sem backfill, provisionamento ou gates operacionais |
| [fundacao_024.test.mjs](../../../supabase/tests/fundacao_024.test.mjs) | Testa explicitamente ausência de quota/gates na 024 e preservação da dívida EPI |
| `fundacao_024_postflight.test.mjs`, `fundacao_024_consolidado.test.mjs` | Auditores read-only, preservação, contratos opcionais e drift |
| [fundacao_024_concurrency.test.mjs](../../../supabase/tests/fundacao_024_concurrency.test.mjs) | Opt-in PostgreSQL loopback, CNPJ concorrente; não é teste de quota |
| `backend/app/api/router.py` | FastAPI `/api/v1`: me, empresas, usuários, colaboradores, catálogos, treinamentos, dashboard, exames |
| `backend/app/core/dependencies.py`, `integrations/supabase.py` | Identidade por Auth `get_user`; cliente por request com JWT/RLS; client privilegiado separado |
| `frontend/src/App.tsx`, AuthProvider/ProtectedRoute | Só login público; sem callback/signup/onboarding; perfil obrigatório bloqueia identidade órfã |
| `frontend/src/services` e hooks | Arquitetura híbrida: FastAPI e Supabase/Storage diretos |

Não se afirma que o catálogo remoto atual foi inventariado aqui. Configurações de
Auth, redirects, CAPTCHA, schemas expostos, gateway e buckets não são dedutíveis
integralmente do Git. O hash opcional do baseline não permite reconstruir seu catálogo.
Uma captura read-only autorizada, em fase posterior, deverá fechar essas lacunas.

## 3. O QUE A 024 JÁ ENTREGA

| Objeto real | Contrato atual | Consequência para 025 |
|---|---|---|
| `empresas` | Razão social/CNPJ; cidade, UF, responsável, e-mail, telefone, setor, status; 024 acrescenta CEP, logradouro, número, complemento, bairro e `cnpj_canonico` gerado | Nenhum novo sistema de endereço/CNPJ paralelo |
| CNPJ | `cnpj_canonico(text)`, `cnpj_valido(text)`, CHECK e UNIQUE canônico; ASCII numérico/alfanumérico, máscara/compacto, zeros preservados | Banco continua autoridade; não recriar algoritmo autoritativo em TS |
| `features` | Oito chaves técnicas, PK e descrição; sem gestão pública do catálogo | Reusar nomes reais da seção 9 |
| `empresa_features` | PK empresa/feature, FK catálogo, `enabled NOT NULL` | ON explícito; ausência/OFF/desconhecida não concede |
| `empresa_comercial` | Origem autocadastro/administrativo/legado; `plano_comercial_id uuid` opcional sem FK/catalogo de planos; titularidade e verificação | Não existe `plano='free'` nem resolver de plano |
| `empresa_limites` | Limite positivo ou `ilimitado=true` com limite NULL; ausência não possui semântica Free | Bootstrap precisa inserir 100/false explicitamente |
| `empresa_uso` | Ativos bigint não negativo e timestamp finito; sem manutenção automática | Contador existe, mas não é autoridade confiável de quota hoje |
| `empresa_diagnostico_sst` | Todas as perguntas previstas, PK tenant, autoria e schema_version=1 | Reusar; distinguir autodeclaração de evidência SST |
| `engmarq_private.onboarding_solicitacoes` | Identidade Auth, chave UUID, hash 64 hex, estado, expiração, empresa apenas quando completed | Ledger pronto; não contém payload/senha; não possui endpoint nem provisionamento |
| `auditoria_comercial` | Histórico append-only para comercial/features/limites/status, anterior/novo, ator/executor | Reusar; alterações de origem/tenant vedadas; não é log completo de onboarding |

`has_empresa_feature(company,key)` é SECURITY DEFINER/STABLE, search_path vazio,
consulta perfil/empresa/concessão/catálogo e exige role SQL authenticated, perfil
ativo, tenant próprio, empresa ativa e role empresa/gestor/operacional. Admin não
obtém capacidade operacional por esse helper. `can_read_foundation` permite Admin
comercial ou tenant ativo ler fundação. `is_commercial_admin` exige perfil admin
ativo vinculado a empresa ativa. O enum tem `admin`, não uma role `superadmin` separada.

024 não atribui Free aos legados, não preenche uso/diagnóstico/comercial, não cria
Auth, não implementa signup e não modifica policies SST para ler concessões.
Seu trigger de limite rejeita redução abaixo de maior(contagem real, agregado),
mas inserir colaboradores acima do limite continua possível; há teste explícito disso.
Secret/service_role tem grants explícitos de manutenção de uso, não permissão geral
de escrita nas novas tabelas comerciais ou no ledger privado.

## 4. GAPS PARA AUTOCADASTRO

1. Identidade sem perfil não consegue passar `CurrentProfile`; falta dependência de
   onboarding baseada em identidade confirmada, sem exigir empresa já criada.
2. Login usa `signInWithPassword`; não há signUp, exchange de callback nem retomada.
   AuthProvider busca perfil diretamente e trata ausência como conta indisponível.
3. Criação empresarial atual exige Admin. Criar Auth não cria perfil por trigger
   versionado. `user_profiles.empresa_id` é NOT NULL e `id` é FK Auth.
4. Provisionamento interno atual cria Auth com `email_confirm=True`, aceita role
   interna e compensa falha de perfil apagando Auth. Não serve como fluxo público.
5. Falta unidade transacional para empresa/perfil/comercial/Free/diagnóstico/ledger.
   Chamadas `.insert()` sucessivas no SDK não constituem uma transação única.
6. Falta persistência/recuperação do rascunho: ledger armazena hash, não os dados.
7. Falta identidade comercial de Free aprovada: uuid de plano é referência opaca.
8. Falta entitlement em RLS, guards, Storage, endpoints e UX; falta quota universal.
9. Schema Python empresarial ainda aceita apenas CNPJ numérico mascarado, não
   expõe os novos campos de endereço e aceita status/fields administrativos.
10. Faltam rate limiter distribuído, política antiabuso de Auth direto, operação de
    recuperação segura e testes reais dos novos conflitos.

## 5. FLUXO PROPOSTO DE AUTOCADASTRO

**RECOMENDAÇÃO TÉCNICA**, ainda não implementada:

1. CTA público “Criar minha empresa”; formulário com identidade e dados empresariais.
2. Validar DTO estrito e limites de tamanho; coletar consentimentos apenas conforme
   política de produto aprovada. Não reservar CNPJ nem criar tenant antes de confirmação.
3. Criar identidade via Supabase Auth público com proteções configuradas no Auth.
   Senha permanece no Auth; jamais em empresa/ledger/diagnóstico/log.
4. Exibir aguardando confirmação; guardar rascunho conforme decisão da seção 26.
5. Callback obtém sessão; backend verifica identidade confirmada e estado de
   provisionamento. Se falta perfil, oferecer completar/retomar, não acesso SST.
6. Enviar dados completos e chave de idempotência à operação autenticada de bootstrap.
7. Banco valida de novo e conclui a transação; resposta devolve contexto efetivo.
8. Invalidar caches; entrar no dashboard Free. O perfil é sempre `empresa` no tenant
   recém-criado, sem seletor de plano/role/limite/features/empresa_id.

| Campo de entrada | Estrutura existente | Obrigatoriedade proposta e justificativa |
|---|---|---|
| Razão social | empresas.razao_social | Obrigatória: identidade cadastral, NOT NULL |
| CNPJ | empresas.cnpj/cnpj_canonico | Obrigatório: identidade única validada pelo banco |
| Nome responsável | empresas.responsavel / user_profiles.full_name | Obrigatório para identificar primeiro responsável; duas finalidades, sem sincronização automática posterior |
| E-mail Auth | auth.users/email de profile | Obrigatório; derivado da identidade verificada no bootstrap, não de actor_id/e-mail arbitrário no payload |
| CEP, logradouro, número, bairro, cidade, UF | empresas | Recomendado exigir no completar cadastro, sujeito à aprovação; não é requisito NOT NULL do legado |
| Complemento | empresas.complemento | Opcional: muitos endereços não possuem |
| Telefone, setor empresarial | empresas.telefone/setor | Opcionais até justificativa de produto; setor não equivale a CNAE |
| E-mail de contato empresarial | empresas.email | Inicialmente pode usar o Auth verificado; divergência futura exige regra própria |
| Logo | empresas.logo_url / Storage logos | Opcional e somente após tenant existir; sem upload pré-bootstrap |

**DECISÃO PENDENTE:** número “s/n”, CEP não localizado e necessidade de endereço
completo no primeiro passo. Não inventar CNAE, cargo, data de nascimento, CPF do
responsável, cartão ou documentos de titularidade obrigatórios nesta etapa.
Cadastro autodeclarado não prova propriedade do CNPJ. Não marcar `verificado`
automaticamente nem transformar confirmação de e-mail em verificação empresarial.

## 6. FLUXO DE CONFIRMAÇÃO DE E-MAIL

**RECOMENDAÇÃO TÉCNICA:** confirmação antes de criar empresa; manter Auth e bootstrap
como fases diferentes. A escolha final depende da aprovação e das configurações
Auth a verificar posteriormente, sem consulta remota nesta tarefa.

Planejar callback em rota pública sob o basename `/Plataforma-Engmarq-Solution/`.
Validar fluxo de confirmação compatível com os SDKs instalados e template do Auth:
PKCE/exchange quando aplicável, tratamento de token/OTP conforme configuração,
allowlist de redirect exata por ambiente, HTTPS em produção e rejeição de redirects
arbitrários. O client atual foi criado sem opções explícitas de fluxo, portanto não
se afirma que já esteja configurado para PKCE. Abrir confirmação em outro navegador
precisa de UX de login/retomada; não depender exclusivamente de rascunho/verifier local.

Backend conserva verificação por `get_user(token)` e adiciona confirmação confiável;
schema AuthenticatedUser atual só expõe id/email. A operação de banco privilegiada
também verifica `auth.users` da identidade vinculada e seu estado de confirmação,
sem confiar em `user_metadata`, boolean `email_confirmed` enviado pelo cliente ou
JWT apenas decodificado. Identidade já vinculada a profile, inativa ou suspensa não
pode usar onboarding para obter segundo tenant ou recuperar acesso indevidamente.

| Situação | Resultado proposto |
|---|---|
| E-mail já usado | Resposta pública neutra e caminhos login/recuperação; não confirmar existência |
| Link vencido/inválido | Reenvio limitado e mensagem segura; zero tenant criado |
| Link aberto duas vezes | Sessão/login ou status existing; bootstrap retorna mesmo resultado |
| Auth criado sem empresa | Estado autorizado de completar cadastro; dados SST continuam negados |
| Cadastro interrompido | Login confirmado e retomada do ledger; expiração e retenção aprovadas |
| Auth indisponível | 503 seguro, sem criar empresa nem repetir criação cega |
| Confirmação em outro dispositivo | Login verificado + novo preenchimento/rascunho recuperável autorizado |

Não aproveitar `email_confirm=True` da criação interna. Recuperação de senha e
usuário interno convidado são fluxos próprios, sujeitos à decisão, não pretexto
para autorizar Admin comercial a criar equipe.

## 7. BOOTSTRAP ATÔMICO/IDEMPOTENTE

**RECOMENDAÇÃO TÉCNICA:** núcleo em `engmarq_private`, SECURITY DEFINER com owner
controlado, search_path vazio, nomes qualificados, validação completa e grants
mínimos. Uma fachada RPC estreita em schema exposto, se necessária para PostgREST,
executável somente por infraestrutura autorizada; nunca expor o schema privado
inteiro. Alternativa é conexão PostgreSQL backend com role dedicada e EXECUTE na
função. Decidir transporte; não habilitar INSERT amplo em tabelas para service_role.

O caminho recomendado usa backend mediador, após Auth verificado/antiabuso. O banco
recebe auth_user_id somente do backend confiável, valida Auth e estado e fixa todas
as autoridades. Um RPC executado com Secret Key não conserva automaticamente o JWT
do usuário e não deve chamar `has_empresa_feature` como se fosse o tenant. Separar
verificação do ator humano, autorização comercial e contexto técnico.

Unidade de transação proposta:

1. Serializar por identidade Auth (lock dedicado/linha Auth, conforme contrato de
   owner aprovado), evitando duas chaves simultâneas para o mesmo usuário.
2. Consultar profile e conclusão existente; profile fora do onboarding não é criado
   novamente. Repetição completed retorna empresa original, sem nova provisão.
3. Criar/bloquear ledger `(auth_user_id,chave_idempotencia)` e comparar hash canônico
   calculado pelo servidor. Mesma chave/dados diferentes => conflito seguro.
4. Verificar expiração/estados e dados estritos; backend e função não aceitam campos
   privilegiados. Validar CNPJ com funções existentes, preservando string original.
5. Inserir empresa com UUID gerado e status fixado pelo sistema; inserir profile
   com ID Auth verificado, role empresa, active definido pelo sistema.
6. Inserir empresa_comercial origem autocadastro, titularidade autodeclarado e
   referência Free aprovada; três features básicas ON e cinco restritas OFF.
7. Inserir empresa_limites 100/false, empresa_uso 0/timestamp; diagnóstico com
   empresa gerada e informado_por autenticado, se integrante do bootstrap aprovado.
8. Marcar ledger completed/empresa_id e devolver mesmo resultado em retries.
9. Falha em qualquer inserção => rollback de todas as linhas da unidade. Auth
   permanece para recuperação, pois sua criação anterior não participa da transação.

O ledger atual já tem UNIQUE por identidade/chave e um índice parcial de uma conclusão
por usuário. Isso é defesa adicional, não substitui serialização e lógica de retry.
Não fazer `ON CONFLICT DO NOTHING` genérico e declarar sucesso sem verificar dono,
hash e resultado. Duas identidades com mesmo CNPJ disputam a UNIQUE canônica:
apenas uma transação pode concluir; a perdedora não deixa profile/comercial parciais.

Quando a transação falha, estado `failed_retryable` não pode ser salvo dentro dela
e sobreviver ao rollback. Se preciso, registrar resultado técnico por operação
separada autorizada, sem PII, preservando a invariância de completed. Timeout HTTP
é resultado desconhecido: consultar ledger antes de tentar novamente; jamais apagar
Auth/empresa em compensação cega depois de resposta perdida.

**DECISÃO PENDENTE:** guardar rascunho privado com retenção curta ou reenviar após
confirmação. O ledger só tem hash; não resolve isso. Recomendação inicial: reenviar
dados, com persistência do estado mínima e sem senha. Rascunho servidor requer
estrutura adicional limitada, ACL, expiração e finalidade explícita.

Auditoria atual aceita ator_id via auth.uid(); chamada técnica pode não preenchê-lo.
Projetar atribuição de ator de onboarding e request_id verificados sem GUC livre
controlável pelo browser. Auditoria comercial não deve receber payload completo,
senha, JWT ou questionário por conveniência.

## 8. FREE TIER

**CONFIRMADO PELO USUÁRIO:** autocadastro inicia gratuito, conta própria, usuários
internos necessários e colaboradores, sem SST pago. **RECOMENDAÇÃO TÉCNICA:** seed
de concessões explícitas no bootstrap, independente de resolver plano no acesso.

Free deve ter ON: empresa.cadastro, usuarios.gestao, colaboradores.gestao.
OFF: treinamentos, exames, documentos, epi, relatorios.sst. Limite 100 e ilimitado=false.
Ausência de empresa_comercial/features/limite no novo tenant é falha de provisão,
nunca fallback ilimitado. Uso começa em zero e diagnóstico não modifica uso.

Não existe catálogo de planos. **DECISÃO PENDENTE:** criar catálogo comercial mínimo
com identificador Free estável e referência válida por plano_comercial_id, ou aprovar
representação transitória explícita. Recomendação: catálogo mínimo versionado e
template Free que gera snapshots de concessões; não hardcode UUID inexistente nem
inferir Free a partir de plano NULL/origem. Billing, checkout e Premium não entram.

Ao atingir 100, manter leituras, edição sem aumento e desativação; rejeitar novos
ativos com erro de quota e CTA comercial neutro. Upgrade automático, bloqueio da
conta, exclusão de histórico e preço não estão aprovados. O papel operacional
continua leitura, inclusive no Free; feature ON não amplia escrita por role.

## 9. FEATURE ENTITLEMENTS

| Chave REAL da 024 | Free proposto | Superfícies que precisam do gate |
|---|---|---|
| `empresa.cadastro` | ON | Dados próprios permitidos, logo; não confere poderes comerciais |
| `usuarios.gestao` | ON | Lista/gestão de equipe; provisionamento interno backend com rechecagem |
| `colaboradores.gestao` | ON | Colaboradores, funções/setores/ambientes mínimos |
| `treinamentos` | OFF | Tipos, matriz, registros, certificados, alertas/views |
| `exames` | OFF | ASO em documentos, exames_catalogo, anexos, endpoints |
| `documentos` | OFF | Documentos SST genéricos e seus anexos/catálogo |
| `epi` | OFF | Fichas/itens, assinaturas e representação legada em documentos |
| `relatorios.sst` | OFF | Relatórios/exports oferecidos pelo produto, com gates das fontes |

Permissão efetiva = identidade válida + perfil ativo + empresa ativa + tenant do
recurso + role da operação + feature ON + integridade/quota. Admin comercial segue
outro predicado e nunca passa no predicado operacional. Plano apenas comercial;
alterá-lo sozinho não concede acesso, como os testes 024 já verificam.

Não acrescentar `colaboradores.gestao` ao helper compartilhado como gate universal:
018 usa `can_access_catalogos` em treinamentos/matriz e 021 em documentos. Separar
base tenant/role de gates por recurso, preservando signatures quando útil. Backend
precisa fachada RPC segura de consulta/permite contexto próprio ou queries RLS nas
tabelas, pois engmarq_private não é schema REST exposto. Não chamar `.rpc()` privado
sem considerar exposição/grants.

Revogação deve valer nas novas operações de banco; cache de UI não autoriza. Escritas
precisam rechecagem/serialização de feature, profile e status no protocolo escolhido.
Uma leitura iniciada antes da revogação pode refletir seu snapshot; prometer revogação
instantânea de bytes já entregues ou URLs assinadas seria incorreto.

`relatorios.sst` limita funcionalidades do produto, não impede usuário de computar
um relatório por conta própria com dados que já está autorizado a ler. Para métricas
exclusivas, usar endpoint/RPC agregado protegido; revogar fontes necessárias apenas
para impedir cálculo local quebraria o próprio acesso contratado.

## 10. QUOTA DE 100 COLABORADORES

**DECISÃO PENDENTE:** ratificar recomendação de 100 **ativos**; usuário fixou o teto
100, mas pediu aprovação explícita de ativos versus histórico. `active` já existe;
inativos com data_demissao podem permanecer como histórico sem consumir uso.
Não inferir quota de diagnóstico.quantidade_aproximada_colaboradores.

Hoje `guard_colaborador_write` e ColaboradorUpdate proíbem reativação. A futura 025
precisa alteração deliberada da função/schema/serviço/UX para reativar e regra de
data_demissao/admissão/histórico; não basta ligar o contador. Transferir empresa_id
continua vedado, inclusive por operação ordinária técnica.

**RECOMENDAÇÃO TÉCNICA:** contador transacional protegido em empresa_uso e trigger
universal para INSERT/UPDATE/DELETE, sem exceção automática de quota para service_role.
Sem contador/limite provisionado => erro; manutenção privilegiada excepcional deve
ser estreita, auditada e reconciliada, não bypass normal de importação.

Definir um protocolo único por tenant para todos os escritores (colaborador,
alteração de limite, contador, suspensão e concessões relevantes): locks ordenados
na empresa, limite/uso e dependências necessárias. Substituir explicitamente a
interação dos guards 016/024, que hoje usam SHARE e UPDATE em ordens diferentes;
empilhar novo trigger que promove locks pode criar deadlocks. Trigger PostgreSQL
por nome/ordem não substitui desenho único de lock.

Operação que aumenta uso efetua atualização condicional atômica do agregado sob o
mesmo protocolo do limite; se a capacidade já foi consumida, nenhuma linha atualizada
e erro de quota. A reserva de +1 e inserção/reativação devem pertencer à mesma
transação: qualquer erro de FK/CPF/dados desfaz reserva. Desativação reduz uma vez;
edição sem delta não aumenta; reativação aumenta uma vez; exclusão técnica de ativo
reduz quando autorizada. TRUNCATE não pode deixar agregado incorreto: revogar no
papel técnico ordinário ou guard explícito, sem conceder DELETE histórico ao cliente.

Uma estratégia “lock empresa + SELECT count(*)” isolada exige cuidado com snapshot
após espera; não é prova suficiente de concorrência. Preferir update condicional de
linha de contador e validar READ COMMITTED, REPEATABLE READ/erros de serialização
em PostgreSQL real. O contador precisa ser inicialmente reconciliado com count real
sob quiescência/locks; clientes e client Secret ordinário não podem alterá-lo livremente
depois. Grants service_role atuais de uso precisam ser estreitados para funções
de manutenção. Redução de limite usa mesmo agregado/locks, rejeita abaixo do uso e
confere contagem real quando necessário; divergência bloqueia e exige reconciliação,
não reinicializa contador para zero.

Importador atual faz POST sequencial por linha, preservando sucessos parciais; UI
anuncia 500 por arquivo. Cada linha deve entrar pelo mesmo trigger e parar/rejeitar
ao atingir capacidade. Limite de linhas de arquivo e quota de ativos são distintos.
Um futuro endpoint de lote atômico é opção de produto; não é necessário para impedir
overshoot. Importações concorrentes e multi-row INSERT direto também devem respeitar
o gate. Locks multi-tenant precisam ordenação estável e retries limitados de transação
idempotente para deadlock/serialization; não repetir POST comum de resultado desconhecido.

## 11. DEPENDÊNCIAS DE CATÁLOGOS

Colaborador exige funcao_id e setor_id (FK/NOT NULL); ambiente_id é opcional.
016 usa FKs compostas empresa/id e 017 restringe catálogos ao próprio tenant.
Backend valida existência no tenant; banco mantém autoridade. Não é necessário
liberar treinamento_tipos, matriz, documento_tipos ou exames_catalogo para criar pessoa.

**RECOMENDAÇÃO TÉCNICA:** funções/setores e ambientes básicos seguem
colaboradores.gestao, com SELECT empresa/gestor/operacional e INSERT/UPDATE empresa/
gestor, sem DELETE ou poderes extras. Reusar catálogos existentes, não duplicá-los.
Descrições/riscos em funcoes não são permissão para PGR, NRs, matriz ou laudos.
**DECISÃO PENDENTE:** permitir riscos na edição Free ou limitar campos básicos;
projeção/column grants/RPC serão necessários se existir dado pago a ocultar, pois RLS
por linha não esconde coluna e frontend sozinho não resolve.

Detalhes do colaborador hoje consultam exames, treinamentos, matriz e fichas EPI
(`ColaboradoresPage.tsx`). Desabilitar esses hooks e abas por permissão central antes
de mount; criar colaborador não deve consultar SST bloqueado nem exigir módulos pagos.
Importador resolve/cria catálogos organizacionais; isso pode deixar catálogos criados
se a pessoa falhar, mas nunca deve consumir quota fictícia ou liberar SST.

## 12. ONBOARDING SST

Todas as perguntas solicitadas já possuem estrutura na 024; não faltam colunas para
o questionário descrito. Faltam contrato UX/API, obrigatoriedade e momento definidos.

| Pergunta / coluna | Tipo atual | Recomendação sujeita à aprovação |
|---|---|---|
| PGR / possui_pgr | sim/nao/nao_sei, nullable | Resposta obrigatória com não sei permitido |
| PCMSO / possui_pcmso | Mesmo triestado | Idem |
| Treinamentos / possui_treinamentos | Mesmo triestado | Idem |
| Programas/documentos atualizados / programas_documentos_em_dia | Mesmo triestado | Idem, esclarecer se não possui |
| Treinamentos atualizados / treinamentos_em_dia | Mesmo triestado | Idem |
| Quantidade aproximada / quantidade_aproximada_colaboradores | Inteiro >=0, nullable | Solicitar no completar; decidir não sei/recusa sem usar zero como ausência |
| Conhece risco / conhece_grau_risco | Boolean nullable | Resposta obrigatória; não calcular risco pelo setor textual |
| Qual risco / grau_risco_informado | 1–4 apenas se conhece=true | Condicional, nunca obrigatório quando não conhece |

**RECOMENDAÇÃO TÉCNICA:** coletar após confirmação, antes do bootstrap, e inserir
diagnóstico na mesma transação. Alternativa aprovada: bootstrap completo e diagnóstico
posterior com indicador de pendência, sem bloquear cadastro de colaboradores. Não
chamar isso de “empresa parcialmente provisionada”: é pendência de questionário,
não ausência de features/profile/limite. Não introduzir required global em legados.

empresa_id e informado_por vêm do ator/resultado do bootstrap; depois, RLS
diagnostico_insert/update + guard_diagnostico_write existentes limitam autoria ao
tenant e empresa/gestor. Admin pode ler diagnóstico comercial, não escrever respostas
em nome do tenant. Quantidade aproximada é dado autodeclarado comercial, não count
real, limite, compliance nem comprovação de PGR/PCMSO.

## 13. RLS / GRANTS / TRIGGERS / RPC

| Objeto | Acesso atual relevante | Mudança proposta para 025 |
|---|---|---|
| empresas | 021 policies select/insert/update e guard restritivo; tenant próprio, Admin comercial; 024 guard impede CNPJ cliente e estende endereço | Gate de cadastro próprio sem bloquear consulta mínima status/contexto; bootstrap estreito; revisar campos permitidos ao Admin |
| user_profiles | 014/015/021: próprio profile legível mesmo inativo; equipe/update só managers próprios, sem self-update, INSERT/DELETE cliente | Preservar leitura mínima própria sem depender de feature; gate usuarios.gestao para equipe/edição e provisionamento técnico revalidado |
| colaboradores | 016 SELECT/INSERT/UPDATE, grants por coluna, FK composta, guard | colaboradores.gestao + quota universal, reativação deliberada, imutabilidade tenant |
| funcoes/setores/ambientes | 017 SELECT/INSERT/UPDATE; helper e guards tenant | Dependência básica colaboradores.gestao; separar uso do helper pelos SST |
| treinamentos/matriz | 018 SELECT/INSERT/UPDATE; matriz DELETE, tipos globais e view invoker | treinamentos em todas as operações, incluindo catálogo e certificado |
| documentos | 021 select/insert/update/delete + restrictive all; guards de referência/metadata; 023 ASO | Gate por tipo estável: ASO/exames, EPI/epi, certificado/treinamentos, demais/documentos; verificar OLD e NEW |
| documento_tipos | 007 read para authenticated; catálogo inclui ASO, Certificado de Treinamento e Ficha de EPI (010) | Filtrar catálogo por feature; sem escrita cliente; mapeamento estável de tipo/módulo |
| exames_catalogo | 023 SELECT de tenant ativo/roles operacionais | exames ON, sem gestão Free |
| features | 024 features_read, SELECT fundação | Preservar catálogo técnico; não deixar tenant/Admin adicionar feature arbitrária |
| empresa_comercial/features/limites | SELECT próprio ou Admin; commercial_insert/update Admin e guards; sem DELETE cliente | Preservar comercial; provisionar somente via operação técnica aprovada; limite segue protocolo quota |
| empresa_uso | SELECT fundação; escrita service_role explícita | Manutenção transacional por trigger/função, revogar escrita livre ordinária; Admin lê só agregado |
| empresa_diagnostico_sst | Leitura fundação; insert/update managers próprios/autoria | Reusar sem entitlement SST pago; revalidar autoria no bootstrap |
| auditoria_comercial | Só Admin lê, triggers append-only | Preservar; atribuição técnica/humana verificável para onboarding |
| onboarding_solicitacoes | RLS habilitado, sem grants clientes/service_role na 024 | Acesso somente núcleo privilegiado mínimo; estado próprio por fachada, sem SELECT geral |
| views dashboard | security_invoker em 018/021/023 | Gates nas tabelas/fontes e RPCs agregadas; sem novas views definer que bypassam |
| Storage | Gates tenant/role/path e guards restritivos, sem entitlements | Entitlement específico por recurso/vínculo, inclusive old/new update, arquivos legados e assinaturas |

Fachadas propostas: bootstrap técnico, estado próprio de onboarding, contexto efetivo
próprio, operações comerciais e eventualmente reativação/lote. Não passar actor_id
cliente à autorização. Sem RPC genérica `execute_sql`, payload json livre para tabelas
ou parâmetro `bypass`. Revogar EXECUTE default PUBLIC das funções novas e grants
de coluna históricos; função privada segura pode ter EXECUTE authenticated para uso
em RLS sem tornar schema REST público. Owners, memberships, RLS enabled e exposure
devem entrar nos futuros auditores.

Policies permissivas combinam alternativas: acrescentar apenas outra policy não
fecha uma legada ampla. Substituir conjunto conhecido ou compor guard restritivo
específico, com WITH CHECK/USING por operação e teste de policy permissiva acidental.
Manter triggers de integridade como segunda defesa para escrita; eles não protegem
SELECT. Helpers get_user_role/get_user_empresa_id continuam sem active/status;
não usá-los isoladamente como autorização final.

ASO antigo não pode mudar tipo para escapar de exames (023 já proíbe saída de ASO).
Para outros tipos, exigir OLD e NEW e checar campo/arquivo coerente para impedir
camuflar EPI/certificado ou usar documento genérico como ASO. O mapeamento não deve
depender de regex em nomes livremente alteráveis; decidir metadado técnico em
documento_tipos ou mapa estável privado. Free nega todos os tipos SST.

## 14. BACKEND

Arquitetura existente: rotas → schemas Pydantic → services → repositories → cliente
Supabase por request. `CurrentProfile` exige profile ativo e empresa ativa. JWT é
validado via Auth get_user; role/empresa vêm do profile. Preservar esse caminho nos
módulos; nunca transformar client Secret no padrão das dependências.

| Endpoint proposto sob /api/v1 | Responsabilidade e proteção |
|---|---|
| POST /onboarding/iniciar, se houver mediação de signup | Contrato público restrito, antiabuso, resposta neutra; não cria tenant nem confirma e-mail automaticamente |
| GET /onboarding/estado | Identidade Auth válida, estado próprio, sem CurrentProfile obrigatório |
| POST /onboarding/bootstrap | Identidade confirmada, DTO estrito, idempotência, uma operação DB atômica; não aceita role/tenant/plano/feature/limite |
| POST /onboarding/reenviar-confirmacao, se escolhido | Limitador + Auth; sem revelar existência de e-mail |
| GET /me/acesso (ou extensão versionada /me) | Contexto próprio efetivo, comercial separado, plano/limite/uso/capacidades |
| GET/PATCH /comercial/empresas/... | Admin comercial por JWT/RLS; plano, features, limites, suspensão; sem dados pessoais de colaboradores |

Nomes são propostas, não endpoints existentes. Não há necessidade de duplicar
signup num endpoint FastAPI se SDK Auth público já for o transporte aprovado;
proteção de Auth direto permanece obrigatória. Não criar endpoint anônimo de
consulta “CNPJ existe”. Erros de CNPJ inválido podem informar formato; conflito de
unicidade no bootstrap confirmado pode usar “não foi possível concluir com os dados
informados; revise ou procure suporte”, sem dados da empresa/e-mail já existente.

Revisar enforcement em serviços/rotas atuais: empresas (self x comercial), usuários,
colaboradores, catálogos, treinamentos/tipos/matriz, exames/catalogo/arquivos,
dashboard/kpis/alertas. Documentos genéricos e EPI não possuem router correspondente
no router.py: alterações exclusivas no FastAPI não protegem seus serviços diretos.
Não é obrigatório migrar toda essa arquitetura híbrida para API na 025; RLS e
Storage devem ser suficientes independentemente do transporte.

Criar service/repository de onboarding e schemas separados de EmpresaCreate e
UsuarioCreate; dependency de identidade confirmada e verificação de feature central.
Atualizar DTO empresarial para endereço/CNPJ compatível sem duplicar algoritmo.
Erros padronizados existentes (`core/errors.py`) já ocultam valores/upstream; usar
codes estáveis para quota, feature negada, idempotency_conflict, retry/status unknown.
Não esconder autorização negada como sucesso vazio na API quando a intenção é escrita.

Provisionamento interno precisa gate usuarios.gestao e rechecagem transacional do
ator ativo/tenant/empresa antes da inserção privilegiada: hoje ocorre autorização
Python e INSERT service_role, sem essa autorização funcional no banco. Fechar janela
de revogação entre check HTTP e escrita; preservar que Admin não cria equipe. Ainda
há fronteira Auth/DB para usuários internos; fluxo de convite/senha inicial exige
decisão própria. Não reutilizar rollback de usuário interno no bootstrap confirmado.

## 15. FRONTEND

| Tela/rota futura | Mudança necessária |
|---|---|
| Login | CTA criar empresa; redirecionar conforme estado real, não apenas session |
| Criar minha empresa | Formulário público sem campos privilegiados |
| Aguardando confirmação | Reenvio limitado, mensagem neutra, nenhum acesso ao app |
| Callback de confirmação | Fora de ProtectedRoute que exige perfil; obter/verificar sessão sem duplo bootstrap |
| Completar cadastro | Identidade confirmada sem profile, recuperação da chave/estado |
| Diagnóstico inicial | Perguntas da 024 com não sei e campos condicionais |
| Erro/retry | Consultar resultado antes de retry; preservar mesma chave/dados |
| Empresa criada/primeiro acesso | Atualizar profile/contexto e limpar queries antigas |
| Dashboard Free | Conta, equipe, ativos/limite; sem compliance fictício nem consultas SST |
| Comercial Admin | Empresa/plano/features/limites/status, sem seletor “entrar no tenant” |

Fonte central proposta: query/contexto `effectiveAccess` vindo do backend/banco com
user_id, tenant, role, status, estado onboarding, resumo do plano, features,
limites/uso e capabilities específicas read/write. Um hook central alimenta menu,
guards, botões e enabled de queries; sem copiar `plan === free` em componentes.
Schema Zod valida contrato. Ausência/erro => indisponível, nunca todos os módulos ON.

AuthProvider hoje só valida active do profile, não status empresarial; mensagens de
ProtectedRoute falam empresa ativa sem esse check explícito. Convergir contexto com
/me/acesso. Preservar a leitura mínima própria para onboarding/conta suspensa.
Cache atual de profile tem staleTime de cinco minutos; chaves precisam identidade/
tenant, limpeza ao logout/troca de sessão, refetch após bootstrap/concessão/revogação.
Cache não deve tornar dados de sessão anterior visíveis ao próximo usuário.

`useCurrentProfile.canWrite` ainda inclui admin genericamente; substituir uso por
capacidade concreta, sem conceder operacional ao Admin. Sidebar Admin ainda exibe
SST e Relatorios tem seletor empresarial legado; ajustar à experiência comercial,
sem ampliar queries para preencher telas. Relatórios/dashboard/detalhes de colaboradores
consultam SST; bloquear hooks por feature, não apenas esconder item de menu.

Frameworks existentes: React/Vite/React Router, TanStack Query, Zod, Vitest. Planejar
testes de componente e browser de callback; o basename e hosting de SPA precisam
suportar URL de confirmação e refresh profundo sem cair em 404.

## 16. SUPER ADMIN COMERCIAL

**CONFIRMADO PELO USUÁRIO:** Admin opera comercial/conta, não equipes nem SST.
024 já permite leitura de fundação/diagnóstico, INSERT/UPDATE de concessões e limites,
alteração de plano opaco e status com auditoria. 015/021 negam gestão funcional de
profiles; módulos remediados e has_empresa_feature excluem Admin operacional.

Faltam APIs/UX comercial, contrato de plano, motivo/ator das mudanças conforme
política aprovada e locks compatíveis com quota/revogação. Não implementar essas APIs
com service_role irrestrito; JWT do Admin e RLS comercial permanecem a autoridade.
Não promover Admin ao role empresa nem emitir token impersonado para operação.

Guard empresarial permite Admin editar diversos campos cadastrais (exceto CNPJ pela
024); delimitar DTO comercial para não confundir cadastro/conta com SST. O próprio
perfil Admin precisa empresa ativa hoje; não relaxar esse requisito silenciosamente.
EmpresasRepository.list inclui `colaboradores(count)` sem active; não usar esse embed
como contador comercial confiável nem ampliar SELECT de colaboradores para corrigir.
Usar empresa_uso reconciliado, que já é agregado comercial legível, sem CPF/nome/ASO.

## 17. EMPRESAS EXISTENTES

**CONFIRMADO PELO USUÁRIO:** preservar acesso equivalente autorizado até decisão
comercial explícita; não tornar legados Free. **RECOMENDAÇÃO TÉCNICA:** corte em duas
fases, com inventário offline/revisão e concessões legadas explícitas antes dos gates.

Preparar manifesto por tenant existente: origem legado, features correspondentes
à capacidade funcional legítima atual, limite ilimitado explícito se aprovado,
agregado real de ativos. Empresa suspensa continua suspensa; perfil inativo não ganha
acesso. A existência de dado de módulo não é prova de contratação, e não usar
diagnóstico para definir acesso. Não preservar a falha Admin global EPI como se
fosse capacidade legítima contratada.

Nenhum backfill executado nesta tarefa. **DECISÃO PENDENTE:** manifesto/concessões
e limite dos legados, tenants administrativos e eventuais exceções EPI. Aplicação
futura exige revisão explícita, auditoria e pré/pós de dados/uso. Falta de linha no
novo modelo nega; não implementar fallback “sem features libera tudo”, nem conceder
features futuras automaticamente para antigos.

Evitar intervalo com gates ativos e legados sem concessões: preencher manifesto
aprovado e validar cobertura antes do cutover atômico/quiescido; se cobertura divergir,
abortar sem inferir permissões. Repetição reconhece estado aplicado e não sobrescreve
revogações comerciais feitas depois. Capturar baseline próprio pré-025; não reutilizar
baseline pré-024 como se representasse o estado pré-025.

## 18. EPI/ASSINATURAS

Inventário com níveis de evidência separados:

- **Evidência remota fornecida:** `024_preflight_baseline_remoto_real.json` registra
  fichas_epi e fichas_epi_itens ausentes antes da 024. Postflight sem bloqueios
  informado indica preservação dessa ausência pelo auditor. Não criar as tabelas
  automaticamente na 025 para “completar” o módulo.
- **Contrato versionado condicional:** 011, se aplicada/presente, permite Admin
  global em SELECT/FOR ALL de fichas/itens, helpers sem active/status e FKs simples,
  sem vínculo tenant composto ficha/item/colaborador. 012 permite Admin ler/inserir
  assinaturas e tenant por prefixo, sem gate feature. Bucket declarado privado,
  limite 2 MB, JPEG/PNG, sem UPDATE/DELETE intencionais.
- **Limitação de inventário:** hash opcional e resumos não dizem se bucket/policies/
  outras views ou funções de assinatura estão presentes. Não afirmar presença ou
  ausência atual desses objetos sem exportação futura autorizada.
- **Frontend real:** já existem fichasEpiService, useFichasEpi, FichaEpiModal,
  FichaEpiDetailModal, AssinaturaFichaFlow e FacialCapture integrados a documentos/
  detalhes de colaborador. Código existente não equivale a módulo homologado/pronto.
  Há getPublicUrl em bucket previsto privado, autoria/tempo vindos do cliente e
  proteção de exclusão de ficha assinada apenas no serviço/UI, não no contrato 011.
- **Legado alternativo:** documento_tipos contém Ficha de EPI; negar somente tabelas
  dedicadas deixaria representação em documentos sem gate epi.

**RECOMENDAÇÃO TÉCNICA:** bloco de hardening pequeno e verificável dentro da 025,
ou migration anterior separada se aprovado, sem desenvolvimento funcional. Para
objetos presentes, retirar policies Admin globais, grants cliente desnecessários,
negar Free/anon/inativo/suspenso e aplicar guards restritivos no bucket. Ausentes
permanecem ausentes. Catalogar drift inesperado e abortar, sem “corrigir” desconhecido.
Preservar linhas, fotos, caminhos e bucket privado; não recriar, excluir ou tornar
assinaturas públicas. Não alterar ownership/DDL do Storage gerenciado.

**DECISÃO PENDENTE:** quarentena total de acesso browser a EPI/assinaturas até futura
homologação (mais segura), ou manter apenas tenants legitimamente existentes com
epi explícito e tenant/role/active/status corrigidos. Segunda opção exige inventário
de integridade/FKs, imutabilidade de assinatura e autoria server-side como segurança,
sem adicionar novas telas. Se essas garantias não puderem ser demonstradas, quarentena
é o caminho recomendado. Conflito com compatibilidade deve ser aprovado, não escondido.

## 19. STORAGE

documentos é privado com limite 10 MB; certificados em tenant/certificados/arquivo,
outros arquivos em tenant/arquivo. 018/020 mantêm gates tenant/role e imutabilidade
de certificados; 022 protege logos privados com path `logos/{empresa}/logo.ext`,
tipos/tamanho/identidade e sem Admin operacional. Assinaturas requer hardening separado.

Path com UUID tenant não identifica ASO versus documento genérico. Backend Exames
e resolver de arquivos ainda aceitam raiz e certificado; arquivos históricos podem
ser compartilhados por referências. Free deve negar todo Storage SST. Para tenants
com concessões parciais, não usar `documentos OR exames` universal no bucket.

**RECOMENDAÇÃO TÉCNICA:** classificação autoritativa de módulo/tenant por vínculo
de objeto, metadado técnico protegido ou registro privado de anexos; usar caminho
segregado em novos uploads e mapear referências legadas sem mover bytes. Exigir
todos os entitlements necessários quando arquivo é compartilhado por tipos com
autorizações diferentes. Objetos legados ambíguos ficam bloqueados até revisão;
concessões amplas legadas podem preservar acesso legítimo durante classificação,
sem liberar Free ou Admin.

Upload ocorre antes de associar arquivo ao documento hoje: resolver a janela com
reserva/upload intent estreito, tenant/módulo/expiração autenticados, ou endpoint
autorizado que cria vínculo seguro; não abrir upload apenas porque objeto ainda não
tem referência. Nenhuma reserva cliente pode declarar módulo genérico para anexar
ASO posteriormente. Enforce USING/WITH CHECK e identidade antiga/nova em UPDATE,
list/download/sign/upload/delete e certificados; não criar triggers no Storage
gerenciado como solução padrão. RLS Storage direto permanece obrigatória.

Signed URLs atuais expiram em 60 segundos. Bloquear nova emissão após revogação;
URLs já emitidas podem continuar válidas até sua expiração. Não prometer revogação
retroativa. Logs/telemetria não devem armazenar essas URLs. Testes via API Storage
real descartável são diferentes de simulação SQL; planejar validação própria.

## 20. SEGURANÇA DO ENDPOINT PÚBLICO

DTO separado, `extra=forbid`, tipos estritos, strings com limites, tamanho de body
antes de parse, content-type JSON e duplicação de parâmetros rejeitada. Fixar
allowlist de campos; rejeitar role/admin/empresa_id/plan/features/max_colaboradores/
status comercial, não simplesmente ignorá-los e depois persistir payload livre.
Banco revalida os parâmetros da função e define valores comerciais internamente.

Auth get_user verifica token; bootstrap confirmado verifica estado Auth no banco.
JWT de A só permite A: quem possui JWT válido de B é indistinguível de B naquele
canal, portanto também planejar proteção de sessão, XSS, refresh/revogação e ausência
de tokens em logs. Não afirmar que payload/RLS detecta roubo de credencial por si só.

CORS atual usa origens explícitas, allow_credentials=false e bearer; apiRequest
usa credentials=omit. CSRF clássico por cookie não é o transporte operacional
atual; se cookies forem introduzidos, exigir SameSite/CSRF/Origin e revisão. CORS
não bloqueia Postman nem Auth/Supabase direto. Callback exige proteção do fluxo de
Auth/state/verifier e rejeição de redirect externo, não só CORS.

Erros não expõem nomes de constraint, corpo upstream, IDs de tenants, existência
de e-mail/CNPJ ou dados comerciais. Evitar checagem pública de disponibilidade;
unicidade decide na transação. E-mail confirmado não comprova titularidade de CNPJ,
permitindo ocupação abusiva: decisão de verificação/contestação comercial é necessária.

Logging com request_id, fase/código/status/latência e identidade pseudonimizada quando
necessário; sem senha, Authorization, cookies, links de confirmação, respostas
Auth, questionário ou body integral. Até UUID pode ser identificador pessoal;
retencão/acesso devem ser limitados. Core/errors atual já oculta valores de validação.

Secret Key/service_role só no servidor. Não acessar .env neste diagnóstico, não
emitir chave VITE_, não incluir segredo em fixtures/documento. Grant SQL e RLS são
camadas distintas: BYPASSRLS não concede automaticamente privilégios revogados
pela 024. RPC dedicada evita depender de grants amplos de owner/serviço.

## 21. RATE LIMITING / ANTIABUSO

Não há limiter/CAPTCHA no app inspecionado. **RECOMENDAÇÃO TÉCNICA:** limites
distribuídos no gateway/backend, combinando IP validado do proxy, identidade, fluxo
e reenvio, com expiração e limite global, 429/Retry-After e proteção antes de Auth/DB.
Não usar cache por processo como controle principal em múltiplos workers. Não confiar
em X-Forwarded-For enviado livremente pelo cliente. Limitar tentativas inválidas,
replays, consultas de estado e custo de bootstrap.

Também proteger Auth público: SDK pode ignorar FastAPI e chamar signup/resend/login
diretamente. Verificar em fase autorizada políticas de Auth signup, confirmação,
CAPTCHA, rate limits e SMTP; limiter FastAPI não resolve spam de identidades órfãs.
Se optar por backend-only signup, confirmar configuração Auth e fluxo de convite
sem desligar confirmação; não afirmar que esconder anon key fecha Auth público.

**DECISÕES PENDENTES:** valores numéricos por IP/identidade/período, orçamento global,
CAPTCHA/Turnstile obrigatório ou adaptativo, acessibilidade e tratamento de falha.
Recomendação é começar com orçamento baixo e medir em ambiente de homologação,
ajustado a NAT corporativo e carga esperada; nenhum número escolhido silenciosamente.
CAPTCHA não substitui limites/replay e deve ser verificado server-side, com validade/
uso único conforme provedor aprovado. Planejar expiração de cadastros não concluídos,
limite de rascunhos e retenção de Auth órfão, sem apagar usuários vinculados.

## 22. CONCORRÊNCIA

**CONFIRMADO PELO USUÁRIO:** PostgreSQL real necessário; PGlite não homologa race.
024 concorrência CNPJ segue deferida; resolver essa prova junto à suíte 025, sem
converter skipped em aprovado. Não foi iniciada infraestrutura nesta tarefa.

**RECOMENDAÇÃO TÉCNICA:** serviço PostgreSQL descartável local (container/Compose
ou instância dedicada loopback), com versão equivalente ao Supabase-alvo confirmada
na implantação. CI com service container isolado e sem credenciais de produção.
Database exclusiva `engmarq_025_*`, DSN opt-in que rejeita hosts remotos/redireção,
fixtures sintéticas de Auth/roles/storage e migrations em sequência. Não usar dump
PII nem DSN da aplicação. Para flows completos Auth/PostgREST/Storage, stack Supabase
local descartável separada, se aprovada, sem associação ao projeto remoto.

Dois ou mais processos/conexões reais, barreiras explícitas e coordenação por locks,
timeouts, comprovação de overlap e contagem final após commits. Não usar apenas
Promise.all com um client que serializa nem sleeps como única prova de sobreposição.

| Disputa | Preparação | Invariante após commit/rollback |
|---|---|---|
| Dois inserts | 99 ativos, limite 100 | Um vence; outro quota/erro transacional tratado; nunca 101 |
| Duas reativações | 99 ativos + 2 inativos | No máximo uma ativa; contador consistente |
| Insert + reativação | 99 ativos | Mesmo resultado de capacidade única |
| Importações concorrentes | Restam N vagas, lotes distintos | Soma não supera N; verificar parcial/atomicidade definida |
| Alteração de limite + insert | 99 e redução para 99/100 | Serialização: redução/inserção compatível ou rejeitada; nunca limite abaixo do uso aceito |
| Desativação + insert | 100 ativos | Vaga só é liberada pelo commit; rollback não libera |
| Mesma identidade, chaves iguais/diferentes | Auth confirmado sem profile | Uma empresa/perfil; resultados repetidos estáveis |
| Dois Auth, mesmo CNPJ | Dados canonicamente iguais | Um tenant; perdedor sem provisão parcial |
| Revogação/suspensão + escrita | Operação ainda pendente | Política de ordenação definida e testada; nenhum bypass por check anterior no backend |

Repetir cenários com authenticated, writer técnico autorizado, multi-row SQL e
isolamentos suportados. Assert count real = agregado, FK/unique, ledger e auditoria.
Deadlock/serialization são possíveis resultados a tratar com retry limitado da
unidade idempotente; não aceitar teste que só mascara erros e confere count final.
Uma job obrigatória de CI deve falhar se infraestrutura de concorrência não estiver
disponível no aceite público; skipped local permanece declarado e impede homologação.

## 23. PLANO DE TESTES

Reusar `supabase/tests` (PGlite para contrato), pytest/httpx mocks em backend/tests
e Vitest/frontend/tests; acrescentar integração PostgreSQL real e navegador/Auth/
Storage local. Mocks de backend não provam enforcement DB nem configuração real Auth.

| Nº | Caso mínimo exigido | Camadas e resultado |
|---|---|---|
| 1 | A não acessa B | SQL/RLS, REST, API: list/get/write/FK/storage negados |
| 2 | Free sem Treinamentos | SQL/REST/API/UI: tipos, matriz, registros, certificados e hooks bloqueados |
| 3 | Free sem Exames/ASO | SQL direto em documentos, catálogo/API/upload/URL: nega |
| 4 | Free sem Documentos SST | SQL/SDK/Storage/UI: nega inclusive tipos globais restritos |
| 5 | Free sem EPI | Objetos presentes/ausentes, assinaturas e representação documental: nega |
| 6 | Free até limite | DB/API/UI: 100 ativos aceitos; histórico não consome se aprovado |
| 7 | Ativo 101 | API e INSERT REST/SQL: erro, sem reserva de uso residual |
| 8 | Reativação acima quota | DB/API: rejeita, mantém histórico e uso |
| 9 | Importação | UI POSTs e lote SQL: nunca overshoot; sem esconder falhas |
| 10 | Concorrência quota | PostgreSQL real: cinco disputas solicitadas + rollback |
| 11 | Supabase direto quota | PostgREST authenticated/SQL e writer técnico: mesmo teto |
| 12 | Supabase direto feature | REST/tabelas/views/RPC/Storage: sem backend, ainda nega |
| 13 | Payload role | DTO público e RPC: role=admin/gestor/operacional rejeitada; sistema fixa empresa |
| 14 | Payload empresa_id | DTO/RPC: não escolhe tenant, actor nem auth_user_id |
| 15 | Payload plano | DTO/RPC: plan/premium/plano_comercial_id rejeitados |
| 16 | Payload feature | DTO/RPC: flags/concessões inesperadas rejeitadas |
| 17 | Payload limite | DTO/RPC: max/ilimitado/contador/status rejeitados |
| 18 | Primeiro usuário | DB/Auth/API: role empresa, vínculo correto, e-mail confirmado real |
| 19 | Admin sem colaboradores | API/SQL/embed/views: zero dados individuais, nenhum client Secret operacional |
| 20 | Admin sem ASO | API/SQL/Storage/URL de arquivo: nega |
| 21 | Operacional sem escrita | Todos módulos liberados: feature ON não amplia role |
| 22 | Empresa suspensa | JWT antigo, REST/Storage e writes pendentes: política de suspensão cumprida |
| 23 | Usuário inativo | Mesmas superfícies; leitura mínima própria não vira acesso SST |
| 24 | CNPJ duplicado | SQL/bootstrap concorrente: formas canônicas iguais, um vencedor atômico |
| 25 | Bootstrap repetido | Mesma chave/hash retorna resultado; hash diferente conflito |
| 26 | Callback repetido | Browser/Auth/DB: não cria segunda empresa nem duplica grants |
| 27 | Falha intermediária | Injetar falha em cada etapa SQL e timeout após commit: zero tenant parcial, retomada segura |
| 28 | Storage | Entitlement + tenant + tipo + path + old/new; assinatura prévia expira conforme contrato |
| 29 | URL direta Free | Browser de rota/módulo/arquivo e HTTP sem UI: gate servidor persiste |
| 30 | Abuso público | 429/distribuído, body grande, replay, captcha inválido, proxy spoof, resposta neutra/sem PII |

Adicionais: identidade sem perfil, confirmação falsa em metadata, e-mail já usado,
Auth órfão, link vencido/outro dispositivo, múltiplas chaves por identidade, perfil
existente não se reprovisiona, empresa criada/profile falhando no mesmo transaction,
último gestor, concessões ausentes/OFF/desconhecidas, plano sem feature, legacy
compatibility sem virar Free, casos EPI parcialmente presentes, drift catalog/grants,
policy permissiva acidental, schema privado exposto indevidamente e counter adulterado.

Preservar suíte 024 como prova histórica. Testes de contrato pós-025 devem reconhecer
alterações deliberadas (gates/quota/reativação) com expectativas próprias; não editar
baseline real 024 nem tratar novos fingerprints como evidência de preservação antiga.
Auditores 025 com pré/pós, um result set, summaries e fingerprints, READ ONLY; dados
operacionais preservados, alterações comerciais aprovadas avaliadas separadamente.

## 24. MIGRATION 025 PROPOSTA

Nenhum arquivo SQL foi criado. Proposta lógica, sujeita a aprovação:

1. Preflight de contrato efetivo 024, exposure/owners/ACL, Auth fora do SQL, integrações,
   catálogos/document types, presença EPI/assinaturas, contagens/limites e integridade.
2. Estrutura estritamente adicional necessária para representar Free comercial,
   atribuição estável tipo→feature/anexo→módulo e eventual rascunho aprovado. Não
   recriar tabelas comerciais/CNPJ/endereço da 024.
3. Núcleo/fachada de bootstrap/estado/contexto com grants estreitos e idempotência.
4. Hardening EPI/assinaturas condicional à presença, sem criar módulo ausente.
5. Preparação explícita legada revisada: concessões/limites/uso e validação de cobertura.
   Pode ser artefato separado aprovado; não mistura defaults Free com legado.
6. Gates RLS/guards/catalogs/views/Storage e quota universal com protocolo de lock
   compatível; reativação apenas se contrato de histórico for aprovado.
7. Postflight 025 específico e baseline próprio, sem reaplicar 024/015–023.

**DECISÃO PENDENTE:** uma migration transacional 025 com blocos auditáveis ou separar
hardening pequeno e cutover em migrations sequenciais. Evitar reutilizar número 025
para vários arquivos ambíguos. Se separar, numerar após aprovação; não criar 026
silenciosamente. Autocadastro público continua desligado até todos os gates/testes.
Não abrir schema privado, alterar owners Storage ou introduzir grants operacionais
Admin para facilitar migração. SQL Editor remoto só em etapa futura autorizada.

## 25. RISCOS

| Risco | Gravidade | Tratamento proposto |
|---|---|---|
| Publicação de signup antes dos gates | Crítica | Abertura pública como última etapa |
| Quota com pré-count/cache/snapshot inadequado | Crítica | Contador update atômico e PostgreSQL real |
| Secret reutilizado como Admin funcional | Crítica | JWT/RLS ordinários; RPC técnica estreita e validação de ator |
| Policies EPI/Storage globais | Crítica | Hardening/quarentena antes de exposição |
| Módulos liberados via helper compartilhado | Alta | Base tenant separada de gates específicos |
| ASO/EPI/certificado camuflado em documento genérico | Alta | Classificação estável e OLD/NEW/vínculos protegidos |
| Tenants antigos bloqueados no cutover | Alta | Manifesto explícito e cobertura antes dos gates |
| Cadastro de CNPJ de terceiros | Alta | Autodeclarado, contestação/verificação comercial aprovada |
| Signup direto contorna limiter FastAPI | Alta | Controles Auth + gateway, orçamento de identidades |
| Falha entre Auth e banco | Alta | Estado incompleto explícito e bootstrap atômico recuperável |
| Deadlock em guards/limites | Alta | Ordem de locks única e retries/testes reais |
| Counter escrito livremente por serviço | Alta | Grants estreitos e reconciliação auditada |
| Último gestor perdido | Alta | Regra/proteção de último responsável a aprovar |
| Cache e URL já assinada | Moderada | Cache como UX, RLS por operação e TTL curto |
| Diagnóstico parecer compliance ou consumo real | Moderada | Rotular autodeclarado, manter uso separado |

Sem raw postflight remoto e settings Auth não é possível classificar todos os 81
avisos ou afirmar configuração pronta para exposição. Isso não impede o diagnóstico,
mas é requisito de revisão posterior antes do rollout.

## 26. DECISÕES QUE PRECISAM DE APROVAÇÃO DO USUÁRIO

| Decisão pendente | Recomendação técnica | Já confirmado |
|---|---|---|
| Ativos versus histórico | 100 ativos; inativos históricos fora da quota | Teto 100 |
| Reativação e datas | Operação explícita com quota e preservação de história; definir data_demissao/novo vínculo | Precisa rejeitar reativação acima do limite |
| Confirmação de e-mail | Obrigatória antes de tenant; allowlist/callback | Mapear fluxo, sem implementação automática |
| Bootstrap/transporte | Função DB atômica com backend mediador e RPC técnica estreita | Atômico/idempotente, sem privilégios no payload |
| Identificação comercial Free | Catálogo mínimo + template/snapshot | Autocadastro começa gratuito; plano separado de acesso |
| Cadastro/endereço obrigatórios | Razão/CNPJ/responsável/Auth obrigatórios; endereço no completar; complemento opcional | Coletar endereço, sem inventar campos obrigatórios |
| Questionário obrigatório/momento | Após confirmação; não sei permitido; quantidade destacada | Perguntas previstas e finalidade comercial |
| Recuperação/rascunho/expiração | Reenvio de dados sem senha; retenção curta aprovada | Idempotência e recuperação necessárias |
| Usuários internos Free | Reusar empresa/gestor sem Admin; definir quantidade, convite/credencial e último gestor | Equipe própria necessária, sem operação Admin global |
| Legados | Concessões explícitas equivalentes + ilimitado aprovado | Não converter silenciosamente em Free |
| EPI presente e assinaturas | Quarentena até segurança demonstrada; alternativa gate tenant autorizado | Hardening mínimo, sem desenvolvimento de módulo |
| Rate limits/CAPTCHA | Distribuído + Auth; valores e desafio após decisão | Análise antiabuso obrigatória |
| Quota atingida/comercial | Negar aumento, manter edição/leitura/desativação; CTA sem cobrança automática | Não ultrapassar teto |
| Catálogos/riscos no Free | Somente campos organizacionais necessários; decidir riscos | Não liberar módulo SST inteiro |
| Lote | Preservar sucesso parcial atual com erros explícitos; batch atômico se desejado | Importação nunca excede quota |
| Migrations/cutover | Blocos auditáveis, manifesto aprovado, abertura final | Não alterar migrations atuais nesta tarefa |

Nenhuma dessas recomendações constitui autorização para implementar. Produto já
confirmado não precisa ser perguntado de novo; aprovar somente os pontos pendentes.

## 27. ORDEM RECOMENDADA DE IMPLEMENTAÇÃO

1. Aprovar decisões de produto/segurança desta seção 26 e contrato de aceite.
2. Preparar PostgreSQL descartável/CI obrigatório e cenários de concorrência.
3. Obter em etapa autorizada inventário read-only pré-025 e settings Auth/redirect/
   schemas/buckets; produzir manifesto legado e classificação de anexos.
4. Desenhar e testar protocolo de lock, manutenção de uso e autorização universal.
5. Implementar hardening EPI/Storage e gates, com compatibilidade legada aprovada.
6. Implementar núcleo transacional de bootstrap, idempotência/contexto e Free.
7. Implementar backend, contratos estritos e antiabuso, preservando JWT/RLS.
8. Implementar UI/callback/retomada, centralização de capacidades e dashboard Free.
9. Homologar suítes DB/API/Storage/Auth/frontend e concorrência real; rever auditores.
10. Revisar diff/artefatos, aprovação de implantação, aplicar etapa autorizada, executar
    pós-validação e somente então liberar autocadastro público de forma controlada.

As etapas podem ser trabalhadas em ambiente isolado, mas a ordem de exposição não
pode deixar Free ativo com gates parciais. Não iniciar automaticamente após este diagnóstico.

## 28. CRITÉRIOS DE ACEITE

- Baseline 024 preservado; nenhuma reescrita de 015–024 para acomodar a 025.
- Bootstrap confirmado resulta em exatamente uma empresa/profile role empresa,
  três features básicas, SST OFF, limite/uso/diagnóstico/ledger coerentes.
- Nenhum valor privilegiado é controlado pelo payload, metadata ou chave idempotente.
- Banco/RLS/Storage bloqueiam bypass sem FastAPI e Admin continua só comercial.
- 100/101, reativação, lotes, writer técnico e redução de limite passam em PostgreSQL
  real com count/uso consistentes; skipped não permite homologação pública.
- CNPJ canônico concorre com um vencedor e perdedor sem empresa parcial.
- Repetição/callback/timeout/rollback não duplicam tenant nem apagam provisão concluída.
- Free funciona sem consultar catálogos/SST pagos; histórico/reativação conforme aprovação.
- Legados mantêm capacidades aprovadas sem virar Free e sem manter falhas de segurança.
- EPI/assinaturas presentes hardenizados/quarentenados; objetos ausentes não criados.
- Anexos classificados, links privados e janela de TTL explicitamente aceita.
- Auth direto e endpoints possuem proteção antiabuso verificada; logs não expõem PII/segredos.
- Plano comercial não vira autorização técnica; mudança comercial é auditada.
- Preflight/postflight específicos, revisão de 81 atenções históricas pertinentes,
  plano de cutover/rollback e todas as decisões pendentes resolvidos antes de rollout.

## 29. PLANO DE ROLLBACK

**RECOMENDAÇÃO TÉCNICA:** ativação por controle servidor/configuração, não somente
botão UI. Antes do corte, backup/versionamento de contratos/configs e baseline
pré-025; ensaio em ambiente descartável. Não copiar PII para logs/fixtures.

Falha antes do COMMIT da migration => rollback transacional do banco; configurações
Auth/SMTP/gateway e deployments são unidades externas, com reversão própria. Falha
do bootstrap => rollback DB, Auth permanece em estado retomável; investigar sem
apagar identidades/tenant por suposição. Depois do COMMIT, preferir forward fix
revisado à remoção destrutiva de esquema.

Em incidente, desligar novos cadastros/bootstraps no servidor e conter uso afetado;
não remover gates para que a UI antiga “volte a funcionar”, nem reabrir EPI/Admin
global ou Storage público. Preservar empresas criadas, perfis, histórico, ledger e
auditoria. Não deletar empresa/Auth em massa como rollback de produto.

Reversão parcial de app deve ser compatível com schema/gates novos, mantendo
quota e concessões; ensaiar versões anterior/nova no staging. Mudanças de limites/
concessões legadas revertem somente com manifesto e auditoria, sem sobrescrever
alterações comerciais posteriores. Rascunhos expirados e contadores divergentes
exigem rotina técnica explícita; não resetar dados para recuperar disponibilidade.

## 30. ITENS EXPLICITAMENTE FORA DO ESCOPO

Nesta tarefa: qualquer código funcional, migration 025/026, alteração de 015–024,
backend/frontend, execução de testes/infraestrutura, SQL ou consulta remota, Auth
settings, dados/backfill, commit e push. A única escrita é este Markdown.

Na proposta de Fundação 025: desenvolvimento funcional de EPI/facial/assinatura,
novo frontend EPI, billing/checkout/preços Premium, módulos SST novos, impersonação
de tenant, gestão interna por Admin global, correção/fusão automática de CNPJ,
normalização de PII legada e concessões comerciais sem aprovação.

Validação final do diagnóstico: baseline correto analisado; Super Admin funcional
separado de service_role técnico; Free desenhado com enforcement servidor/banco e
Supabase direto; concorrência PostgreSQL real planejada e dívida 024 deferida;
EPI tratado como hardening condicional; legados sem conversão silenciosa em Free.
Nenhuma implementação executada. A Fundação 025 aguarda aprovação explícita.
