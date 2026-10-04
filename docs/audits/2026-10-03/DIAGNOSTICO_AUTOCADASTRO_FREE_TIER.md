# Fase 024 — Diagnóstico de autocadastro, Free Tier e funcionalidades

Data: 03/10/2026. Base auditada: `ba7e645af7887995b442edd3fc3b3b1bd9cf3717`.

**Documento de proposta, sujeito à aprovação. Nenhuma implementação ou migration foi criada.**

## 1. Escopo, evidências e estado atual

HEAD local e referência local origin/main coincidem com o commit informado. A árvore de trabalho estava limpa no início. Não foi feito fetch, commit, acesso ao Supabase remoto ou execução de SQL. A única escrita desta etapa é este relatório. Não foram encontrados arquivos AGENTS.md no inventário do repositório. A auditoria combina leitura estática do frontend, backend, migrations e testes existentes; não comprova configuração ou catálogo efetivo do ambiente remoto.

As migrations versionadas 015–023 são a referência contratual, consideradas consolidadas conforme informação do usuário. O relatório anterior da 023 registra inventário remoto fornecido pelo usuário, não uma inspeção remota desta etapa. Antes da implementação, será necessário preflight autorizado para confirmar grants, policies, owners, schemas expostos, configurações Auth e possíveis divergências.

### Frontend

| Componente | Estado observado | Impacto futuro |
|---|---|---|
| `frontend/src/App.tsx` | React Router com basename `/Plataforma-Engmarq-Solution/`; login público em `/login`; demais páginas sob ProtectedRoute | Cadastro, confirmação e retomada precisam existir fora do guard que exige perfil |
| `modules/auth/LoginPage.tsx` | Login via `supabase.auth.signInWithPassword`; não há fluxo implementado de signUp | CTA “Criar minha empresa” e fluxo de confirmação |
| `modules/auth/AuthProvider.tsx` | Sessão via getSession/onAuthStateChange; consulta direta ao próprio user_profiles; perfil inativo gera erro; cache de cinco minutos | Distinguir identidade confirmada sem tenant, conta bloqueada e onboarding; atualizar contexto de acesso |
| `modules/auth/ProtectedRoute.tsx` | Exige sessão e perfil; allowedRoles opcional; não consulta entitlements nem status empresarial explicitamente | Guard por role + funcionalidade; tratamento de suspensão e onboarding |
| `hooks/useCurrentProfile.ts` | Capacidades por role/active; canWrite inclui admin; não há funcionalidades por empresa | Substituir uso genérico por capacidades específicas; admin jamais recebe capacidade operacional |
| `components/layout/Sidebar.tsx` | Menu Admin ainda contém treinamentos/documentos/exames/relatórios; menu tenant mostra todos os módulos | Menu comercial separado; menu tenant filtrado pelas permissões efetivas |
| `modules/configuracoes/ConfiguracoesPage.tsx` | Tenant tem dados, equipe e catálogos; equipe depende de canManageUsers; plano/faturamento é “em breve” | Separar dados empresariais e base de colaboradores das configurações SST pagas |
| `services/api/client.ts` e `services/api/auth.ts` | Cliente FastAPI com token da sessão e contrato de `/me` | Contexto autorizado com features, limites e estado; cache por identidade/tenant |
| Serviços de empresas/usuários/colaboradores/catálogos/treinamentos/exames | Facades predominantemente usam FastAPI | Adicionar validação amigável e contratos de entitlements |
| `services/documentosService.ts`, `fichasEpiService.ts`, `documentosStorage.ts`, `empresasService.ts` | Documentos genéricos, EPI e Storage ainda têm acessos diretos ao Supabase; logos também usam Storage diretamente | Enforcement SQL/Storage obrigatório; não basta alterar FastAPI |
| `modules/colaboradores/ColaboradoresPage.tsx` | CSV/XLS/XLSX; UI anuncia até 500 por importação; serviço faz POST individual com sucesso parcial; detalhes consultam exames/treinamentos | Limite contratado real; desligar queries SST sem feature e mostrar resultado parcial compreensível |

Não há autocadastro, entitlements, planos persistidos ou enforcement de quantidade identificados no código auditado. O placeholder de plano não representa autorização comercial existente.

### Backend

Arquitetura FastAPI: rotas → services → repositories → Supabase. `app/api/router.py` registra `/api/v1` com health, me, empresas, usuários, colaboradores, catálogos, treinamentos, dashboard e exames. Documentos genéricos/EPI não possuem router equivalente registrado.

| Área / arquivos | Autorização atual |
|---|---|
| `core/security.py`, `core/dependencies.py`, `integrations/supabase.py` | Bearer obrigatório; identidade validada por Auth get_user; cliente por requisição com anon key + JWT do chamador; RLS preservada |
| `services/profiles.py`, `repositories/profiles.py` | Perfil derivado do ID autenticado; exige active e empresa com status ativa; role/tenant vêm do banco, não do payload |
| `services/empresas.py`, `repositories/empresas.py` | Admin cria/lista empresas; tenant acessa própria empresa; status só Admin; logos só gestores da própria empresa; sem DELETE |
| `services/usuarios_service.py`, `repositories/usuarios.py` | Só empresa/gestor ativos administram equipe própria; admin global proibido; sem autoedição de role/active ou promoção a admin |
| Provisionamento de usuário interno | Única exceção administrativa explícita: secret/service_role cria Auth com email_confirm=true, insere perfil e tenta compensar deletando Auth se perfil falhar; falha ambígua requer reconciliação |
| `services/colaboradores.py`, `schemas/colaboradores.py` | Leitura empresa/gestor/operacional; escrita empresa/gestor; empresa_id derivado do ator; extra=forbid; catálogos validados no tenant; criação ativa; desativação exige data; reativação não suportada |
| `services/catalogos.py`, `services/treinamentos.py`, `services/exames.py` | Autorizações operacionais por role/tenant; nenhum entitlement adicional |
| `services/dashboard.py` | Admin recebe apenas métricas empresariais e nenhum acesso operacional; tenant consulta colaboradores ativos, documentos e treinamentos sem verificar feature |
| `core/errors.py`, `main.py` | Erros estruturados sem eco de valores sensíveis; CORS configurado; não foi identificado rate limiter distribuído/CAPTCHA para cadastro |

O mecanismo de criação interna não deve ser reutilizado como endpoint público: confirmação automática de e-mail, seleção de role e compensação de Auth têm pressupostos diferentes. CurrentProfile também não serve para iniciar onboarding: por definição rejeita usuário sem perfil/empresa ativa.

`EmpresasRepository.list` faz embed `colaboradores(count)`. Como RLS nega colaboradores ao Admin, essa consulta não implementa uma contagem comercial privilegiada confiável; não ampliar SELECT de colaboradores para resolver. O count também não filtra active, diferentemente do dashboard do tenant.

### Banco, dados e migrations

| Objeto | Contrato identificado |
|---|---|
| empresas | UUID gerado, razao_social, cnpj TEXT UNIQUE NOT NULL, logo_url, created_at; 002 acrescenta setor, cidade, uf, responsavel, email, telefone, status |
| Status empresarial | TEXT NOT NULL com CHECK `ativa`, `pendente`, `suspensa`; não há coluna active empresarial |
| user_profiles | ID é FK auth.users ON DELETE CASCADE; email/full_name; role enum; empresa_id obrigatório FK empresas; active boolean; created_at |
| Roles | admin global, empresa, gestor, operacional; empresa acrescentada na 005; não há role superadmin distinta |
| colaboradores | Tenant FK; CPF único por empresa; active/data_demissao; função e setor obrigatórios, ambiente opcional; não há teto contratado |
| Catálogos | funcoes/setores/ambientes por tenant; treinamento_tipos, documento_tipos e exames_catalogo possuem contratos próprios |
| Documentos/ASO | ASOs permanecem em documentos, identificados pelo tipo ASO; resultado_aso nullable na 023; não há nova tabela principal de exames |
| Auth → perfil | Não foi identificado trigger de autocadastro em auth.users nas migrations versionadas; criar Auth não cria empresa/perfil automaticamente |

O CNPJ hoje tem unicidade de texto exato. Não há canonicalização nem verificação de dígitos identificada no banco; o schema FastAPI e formulário empresarial exigem máscara numérica. Formatação distinta pode representar o mesmo identificador e escapar da constraint textual quando inserida por outro caminho permitido.

| Migration | Proteção consolidada e relação com a fase |
|---|---|
| 015 | Admin removido da administração funcional de perfis; can_manage_profile e guard_profile_update tenant-only; mantém estrutura de RLS/grants/trigger da 014 |
| 016 | RLS tenant de colaboradores; grants por coluna; empresa_id/CPF/identidade imutáveis no cliente; FK composta de função/setor/ambiente; guard de escrita; sem DELETE e sem reativação |
| 017 | Catálogos tenant-only; can_access_catalogos; guard de escrita; grants e policies explícitos |
| 018 | Treinamentos/matriz tenant-only; FK compostas; tipos com acesso controlado; view invoker; proteção de certificados no Storage |
| 019 | arquivo_path compatível com referência legada; conversão controlada, sem reinterpretar livremente URL |
| 020 | Bucket documentos privado, paths e referências protegidos, policies permissivas e guards restritivos; função can_access_documento |
| 021 | Remedia empresas/documentos, restaura semântica 015; Admin comercial, documentos tenant-only; FK documental composta; view invoker; helpers legados com search_path seguro; EPI/assinaturas explicitamente fora do escopo |
| 022 | Logos privados e tenant-only; path canônico por empresa; tipos/tamanho/identidade controlados; Admin sem operação de logos |
| 023 | Exames/ASO na tabela documentos; resultado explícito, guard de integridade, catálogo protegido, compatibilidade legada e janela de vencimento da view |

Funções privadas recentes usam SECURITY DEFINER com search_path vazio e referências qualificadas; grants de execução delimitados. Vários guards retornam imediatamente para papéis diferentes de authenticated: service_role/owner continuam sendo infraestrutura privilegiada, não autorização funcional. Helpers antigos get_user_role/get_user_empresa_id preservam semântica, sem verificar active/status; não devem ser usados como autorização completa de novos módulos.

## 2. Riscos encontrados e componentes afetados

1. **EPI/assinaturas legados:** 011 permite admin global em fichas_epi/fichas_epi_itens; 012 permite Admin ler/inserir assinaturas. Essas policies também não exigem perfil ativo/empresa ativa. 021 declara expressamente a exclusão desses módulos de sua remediação. É lacuna do contrato versionado, não prova de exploração remota. Precisa ser fechada antes de liberar autocadastro, pois “demais módulos OFF” inclui EPI. Avaliar ainda FK composta ficha/item/colaborador e grants reais. O frontend chama getPublicUrl para assinaturas embora a migration declare bucket privado: há incompatibilidade legada a inventariar, sem tornar o bucket público.
2. **Helpers compartilhados:** can_access_catalogos é reutilizado por treinamentos e documentos. Acrescentar uma única feature nesse helper liberaria ou bloquearia módulos indevidamente. Preservar base de autorização tenant e compor verificações específicas por recurso.
3. **ASO/documento no mesmo domínio:** API de ASO separada não impede uso direto de documentos. Grants compartilhados exigem policy/trigger que distinguem tipo anterior e novo. Não permitir disfarçar ASO mudando tipo para contornar exames OFF.
4. **Storage comum:** ASOs e documentos podem ter path raiz semelhante; certificados possuem subpasta, mas prefixo empresarial não identifica todos os módulos. Sem classificação confiável, documentos ON poderia expor anexos de exames OFF.
5. **Limite ausente:** a contagem prévia no FastAPI não fecha concorrência, PostgREST e importações. Todos os caminhos precisam convergir para enforcement transacional.
6. **CNPJ:** unicidade textual, máscara numérica, falta de validação empresarial e possibilidade de cadastro indevido de CNPJ pertencente a terceiros.
7. **Bootstrap:** perfil exige empresa e rotas exigem perfil. Inserções HTTP separadas gerariam órfãos; signup público pode gerar identidades sem tenant.
8. **Regressão comercial:** backfill indiscriminado Free revogaria acesso existente; fallback “sem feature = todos os módulos” liberaria funcionalidades futuras.
9. **Cache/JWT:** revogação de feature e suspensão não podem aguardar expiração do token ou cache do frontend. Links assinados já emitidos podem continuar válidos até expirar.
10. **Primeiro gestor:** proteção atual impede autoalteração, mas não demonstra regra universal de último gestor ativo. Uma equipe pode perder todos os administradores por desativações/demissões cruzadas; avaliar proteção adicional sem atribuir gestão ao Admin global.

Frontend afetado: App/AuthProvider/ProtectedRoute/useCurrentProfile/sidebar, login, contexto `/me`, caches, configurações, importador, detalhes de colaboradores, dashboard, relatórios, todos os serviços diretos e controles de arquivos. Backend: novas rotas de onboarding, dependências de identidade sem perfil, services/repositories de provisionamento/comercial, schemas de CNPJ, autorização por feature e erros de limite. Banco: entitlements, contadores, identificação empresarial, RLS/guards/views de módulos e Storage; preservação das assinaturas dos helpers quando possível.

## 3. Modelo de dados proposto (A)

### Dados empresariais e identidade

Reutilizar empresas.razao_social/cnpj/cidade/uf/responsavel/email/telefone e user_profiles.full_name/email. O contato empresarial e o e-mail de autenticação têm funções distintas: podem iniciar com o mesmo valor, mas não devem ser sincronizados automaticamente depois. Não acrescentar senha, role solicitada ou IDs de autenticação ao cadastro empresarial. Senha pertence exclusivamente ao Auth e não deve ser persistida em rascunhos/logs.

Cidade/UF não constituem endereço completo. Se obrigatório, acrescentar somente os componentes ausentes: cep, logradouro, numero, complemento, bairro; campos opcionais para legados e validadores específicos no onboarding. Evitar armazenar simultaneamente endereço livre e estruturado sem finalidade definida. setor existente não equivale automaticamente a CNAE ou grau de risco.

Propor `cnpj_canonico`, derivado do cnpj original por função determinística: trim, letras ASCII maiúsculas, remoção apenas de pontuação permitida da máscara; rejeitar caracteres estranhos em vez de apagá-los indiscriminadamente. Preservar zeros iniciais; nunca converter para número. Unicidade global do CNPJ completo, não só raiz, incluindo empresas suspensas/pendentes. Não autorizar troca de CNPJ pelo tenant como atualização comum: recomendar operação de correção empresarial auditada, sujeita à aprovação, pois hoje ela é permitida.

**Formato atual:** o CNPJ alfanumérico já foi introduzido em 2026; os numéricos anteriores permanecem válidos. A Receita registra a primeira emissão em 31/07/2026. A validação deve atender os dois formatos: 12 posições alfanuméricas e dois dígitos verificadores, conforme cálculo oficial. Não usar replace de “não dígitos”, que destruiria as letras. Referências: [programa oficial](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico) e [primeira emissão](https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico).

Antes de criar índice único canônico: inventariar formatos, valores inválidos e colisões normalizadas. Abortá-lo diante de conflitos, sem fundir empresas, trocar tenant ou excluir dados. Validar novas entradas no FastAPI e banco; para legado inválido, decidir saneamento explícito antes de aplicar CHECK global. Coluna derivada/indexada não é segunda informação empresarial independente; é mecanismo de integridade. A constraint única é autoridade para dois cadastros simultâneos; consulta prévia só melhora UX e não reserva identificador.

### Separação comercial e autorização

| Entidade proposta | Campos/conceito | Autoridade |
|---|---|---|
| `empresa_comercial` | empresa_id PK/FK, origem (autocadastro/administrativo/legado), plano_comercial_id opcional, metadados de contratação mínimos | Admin comercial lê/altera campos autorizados; tenant lê resumo próprio |
| `features` | chave estável PK, descrição, classificação/dependências conhecidas; catálogo técnico | Infraestrutura adiciona feature junto à implementação, não payload público |
| `empresa_features` | PK (empresa_id, feature_key), enabled boolean, origem/concessão, ator/data/motivo da mudança | Admin ativo altera; tenant apenas lê suas concessões |
| `empresa_limites` | empresa_id PK, max_colaboradores_ativos inteiro positivo ou NULL explicitamente ilimitado | Admin altera; Free recebe 100 em provisionamento |
| `empresa_uso` (privado) | empresa_id PK, colaboradores_ativos bigint >= 0 | Atualizado somente pelo banco; expor resumo controlado, nunca escrita de cliente |
| `planos` / `plano_features` | Templates comerciais versionados, opcionais na primeira entrega | Não substituem entitlements efetivos |
| `onboarding_solicitacoes` (privado) | id servidor, auth_user_id, chave de idempotência/hash de payload, estado/expiração, resultado empresa_id, dados validados mínimos | Provisionador; usuário consulta apenas sua solicitação por API |
| `empresa_diagnostico_sst` | empresa_id único, respostas tipadas, schema_version, informado_por/data | Gestor do tenant informa; Admin comercial consulta |
| `auditoria_comercial` | ator, empresa, feature/limite/status anterior/novo, motivo/data/request_id | Append-only controlado; sem conteúdo operacional |

Caso seja preciso manter histórico do diagnóstico, usar versões explícitas com identificação de versão atual; não duplicar a mesma resposta em empresas e documentos. Recomendo inicialmente um diagnóstico atual com origem e data, sem anexos, e histórico somente mediante decisão comercial.

### Diagnóstico inicial de SST

Campos tipados: possui_pgr, possui_pcmso, possui_treinamentos, programas_documentos_em_dia e treinamentos_em_dia com respostas `sim/nao/nao_sei` e ausência para não respondido; quantidade_aproximada_colaboradores inteira >= 0 (ou faixa, se aprovada); conhece_grau_risco e grau_risco_informado 1–4, com consistência entre as respostas. Registrar autodeclaração, autor e instante. Não calcular grau de risco a partir de setor, nem inferir conformidade.

A quantidade declarada não alimenta limite/uso real. Uma empresa pode declarar 500 e começar Free com teto de 100 cadastrados ativos; onboarding não deve fingir que o número declarado é cadastrado. Não criar documentos PGR/PCMSO, status vigente, evidências técnicas ou compliance do dashboard a partir dessas respostas. Label obrigatório: “Diagnóstico inicial de SST — informações autodeclaradas, sem comprovação técnica”. Admin pode ler esse diagnóstico comercial sem acesso a documentos operacionais.

## 4. Fluxo completo de autocadastro e primeiro usuário (B/C)

**Recomendação: Auth e confirmação primeiro; empresa operacional somente no commit de uma transação de provisionamento após identidade confirmada.** Evita tenants ativos sem responsável e reserva de CNPJ por e-mail não confirmado.

1. Tela pública apresenta dados de conta e onboarding, com validação limitada de tamanho/formato e CAPTCHA. Não aceita role, empresa_id, features, plano, limite, active, status, auth_user_id ou flags de confirmação. Campos extras são rejeitados. Se houver rascunho antes do Auth, ele tem token opaco, TTL e não reserva CNPJ; pode-se simplificar coletando detalhes empresariais após confirmar o e-mail.
2. Criar identidade via fluxo oficial Auth signUp, sem email_confirm=true e sem trigger que confie em user_metadata. Confirmação de e-mail deve estar habilitada. Resposta pública uniforme, sem afirmar existência de conta. Auth pode retornar resultado ofuscado para conta existente dependendo da configuração; a UI não deve interpretar sucesso como criação nova. Ver [signUp](https://supabase.com/docs/reference/javascript/auth-signup) e [configuração de confirmação](https://supabase.com/docs/guides/auth/general-configuration).
3. Callback público processa a confirmação pelo SDK, com redirect permitido e basename correto. Tokens não entram em logs/analytics/URLs compartilhadas. Sessão sem perfil vai para onboarding, não para os módulos nem para erro genérico definitivo.
4. FastAPI usa dependência exclusiva de identidade (get_current_user, sem CurrentProfile), verifica confirmação real no Auth e bloqueio da identidade; exige CAPTCHA/limites apropriados para provisionar. Se já existe perfil, não criar segundo tenant nem mover vínculo: oferecer login/retomada autorizada. Modelo atual é um usuário → uma empresa, não memberships multiempresa.
5. Endpoint idempotente registra solicitação vinculada ao ID retornado pelo Auth e ao hash dos dados validados. E-mail da conta vem de Auth. Campo email empresarial é contato, não autoridade. Repetição da chave com payload diferente é conflito; chave de outro usuário não revela resultado.
6. Provisionador técnico chama uma única função SQL transacional com execução restrita ao papel técnico de provisionamento (se disponível) ou service_role. Sem GRANT a anon/authenticated/PUBLIC. Se precisar de wrapper no schema exposto para RPC, o wrapper tem a mesma restrição; núcleo privado permanece não exposto. A função recebe ID de solicitação servidor, não parâmetros livres de role/plano/tenant. Revalida dados, confirmação em auth.users, ausência de perfil existente e condições da solicitação sob locks. O chamador técnico é uma fronteira de confiança: todos os IDs de identidade têm origem em Auth validado, nunca no JSON público.
7. Na mesma transação: reservar solicitação/identidade contra concorrência; inserir empresa com UUID gerado e origem autocadastro; inserir perfil com role **empresa** e active=true; inserir Free com três features base e limite 100, contador zero, diagnóstico e auditoria de criação; concluir solicitação; status empresarial final ativa. Campos privilegiados são constantes do servidor/banco. Constraint CNPJ canônico arbitra concorrência.
8. Commit disponibiliza tenant completo. Timeout de resposta exige consultar resultado pelo mesmo usuário/chave; nunca repetir cegamente inserções nem apagar Auth. Recarregar `/me`, perfil e acesso, invalidar caches e entrar na gestão de colaboradores.

### Falhas, rollback, retry e idempotência

| Situação | Comportamento recomendado |
|---|---|
| Auth falha antes de existir identidade | Nenhuma empresa existe; tentativa com resposta neutra/erro de disponibilidade conforme caso |
| Auth cria usuário e confirmação não acontece | Nenhum tenant; expiração de rascunho; reenvio protegido; política de retenção/reconciliação de identidades pendentes |
| Identidade confirmada, transação empresarial falha | Rollback de empresa/perfil/features/limites/diagnóstico; identidade fica sem acesso operacional e pode retomar |
| Empresa criada mas resposta de Auth falha | Ordem recomendada impede criar empresa antes de Auth confirmado; eventual falha de consulta posterior não desfaz tenant já confirmado |
| Provisionamento commitou e resposta se perdeu | Mesmo auth_user_id e chave retornam resultado original; status consultável; nenhuma duplicação |
| Duas solicitações do mesmo usuário | Lock por identidade + PK de user_profiles impedem duas empresas; uma conclusão válida, outra retoma/conflita |
| Duas identidades disputam CNPJ | Unique canônico permite somente um tenant; perdedor não recebe vínculo à empresa existente nem seus dados |
| CNPJ existente/suspenso | Não reativar, não anexar usuário automaticamente, não revelar contatos; canal de revisão de titularidade |

Não existe rollback ACID envolvendo chamadas HTTP ao Auth e gravações PostgREST separadas. Auth e tabelas podem residir no mesmo Postgres, mas a API pública Auth não participa da transação da RPC. Não escrever auth.users diretamente. A recomendação é transação única para o tenant e identidade sem privilégios operacionais em caso de falha; não deletar automaticamente identidade preexistente/confirmada. O mecanismo compensatório do cadastro interno permanece separado. Reconciliação técnica só remove identidade comprovadamente criada por essa solicitação, sem perfil/vínculos, após prazo aprovado e checagem de resultado ambíguo.

O primeiro usuário recebe `empresa`, papel existente apto a gerir equipe própria, nunca admin global. Não criar enum proprietário só para representar fundador. Auditoria de fundador pode ficar na solicitação de origem; papel e vinculação autorizativa continuam em user_profiles. Recomendação adicional: impedir a perda do último perfil ativo empresa/gestor por trigger transacional, com política de recuperação pelo titular e infraestrutura restrita, sem painel global de administração interna.

### Estados sem conflito com o modelo existente

Manter empresas.status (`ativa/pendente/suspensa`) e user_profiles.active. `pending_email`, `onboarding`, `completed`, `expired`, `failed_retryable` descrevem **a solicitação**, não uma segunda máquina de acesso empresarial. Empresa passa a existir no commit final como ativa; pendente permanece com o sentido legado, sem converter empresas existentes. Não acrescentar cancelled sem definir efeito contratual e retenção; suspensão continua status=suspensa. Usuário inativo/empresa suspensa nunca usa onboarding para trocar de tenant ou recuperar acesso automaticamente. A identidade pode autenticar, mas o uso operacional continua negado pelo banco/API.

## 5. Funcionalidades e autorização efetiva (F/H/I)

Modelo recomendado inicialmente: catálogo técnico `features` e concessões explícitas `empresa_features`; limite numérico separado. Plano é informação comercial e template de concessão, não decisão de acesso em cada endpoint.

Regra efetiva: identidade válida + perfil ativo + empresa ativa + role permitida + vínculo ao recurso + feature habilitada + integridade/limite aplicável. Para operações comerciais: admin ativo e contexto administrativo válido, sem concessão operacional, mesmo que a empresa vinculada ao perfil admin possua features. A regra de empresa ativa do perfil Admin hoje existe na dependência backend; preservá-la ou alterá-la requer decisão explícita, não exceção implícita.

**Feature ausente, desconhecida ou sem concessão = OFF.** Empresa A/B/C são representadas por linhas enabled por empresa. OFF explícito registra revogação; ausência também nega. Novas features entram desligadas para todos, inclusive legados, até concessão revisada. Tenant não escreve catálogo, plano, features, limite ou contador.

`planos/plano_features` fazem sentido quando houver catálogo comercial real, preferencialmente versionado. Recomendo snapshots das concessões ao contratar/criar empresa. Alterar template de plano não muda silenciosamente todas as empresas. Overrides individuais escrevem a concessão efetiva auditada. Se futuramente optar por resolução dinâmica plano + overrides, definir precedência (deny explícito prevalece), versão, janela de validade e invalidadores antes de mudar o modelo. Não manter duas fontes efetivas ao mesmo tempo.

### Matriz de enforcement por recurso

| Recurso | Feature / decisão |
|---|---|
| Dados próprios da empresa, logo próprio | empresa.cadastro; respeitar contrato 021/022; Admin continua sem logo operacional |
| Equipe própria | usuarios.gestao + empresa/gestor; preserva 015, sem inserts públicos de perfil |
| Colaboradores e catálogos básicos necessários | colaboradores.gestao; leitura/escrita conforme role existente e teto |
| treinamento_tipos, matriz_treinamentos, treinamentos, certificados, view/alertas | treinamentos; não depende da liberação dos catálogos básicos |
| documentos não-ASO, documento_tipos pertinentes, anexos genéricos | documentos |
| documentos do tipo ASO, exames_catalogo, upload/download ASO | exames; documentos ON não concede exames |
| fichas_epi/fichas_epi_itens/assinaturas e catálogos pertinentes | epi separado, inicialmente OFF; fechar políticas legadas |
| Relatórios e indicadores SST | feature própria se comercializados; em qualquer caso exigir features das fontes consultadas |
| Novos módulos | Nova chave + mapeamento de API/tabela/Storage/views + testes; nenhum fallback de autorização |

Banco: criar helper específico has_empresa_feature que consulta concessão sem depender de metadata JWT; compor com helpers de tenant existentes. Não acrescentar features pagas ao helper genérico can_access_catalogos. Revisar RLS permissiva (OR), guards restritivos (AND), grants de tabela/coluna, functions e views de cada superfície. Aplicar gates a SELECT/INSERT/UPDATE/DELETE e funções de exportação/RPC, sem ampliar privilégios atuais. Para troca de tipo documental, exigir permissão correspondente a OLD e NEW e aos campos ASO; SQL direto não pode transformar recurso pago em genérico. Caches no backend não podem continuar concedendo após revogação; recomenda-se consulta do banco na operação e rechecagem transacional nas escritas.

FastAPI: acrescentar dependência/service de feature após identidade e tenant; operações normais mantêm cliente anon+JWT. Mapear feature_denied 403, tenant_inactive 403, employee_limit_reached 409, conflitos transacionais 409, payload inválido 422 e indisponibilidade 503. Não converter ausência de autorização em lista “sem dados” no contrato da API; PostgREST pode retornar lista vazia por RLS e isso precisa de teste próprio. CORS não protege contra chamada direta.

## 6. Free Tier (D)

Novo autocadastro recebe somente empresa.cadastro, usuarios.gestao e colaboradores.gestao, com teto de 100 conforme decisão abaixo. Treinamentos, exames, documentos, EPI, relatórios SST e features futuras ficam OFF. Diagnóstico é onboarding comercial, sem abrir módulos SST.

**Dependência necessária para aprovação:** colaboradores exige funcao_id e setor_id; ambiente é opcional. Free precisa cadastrar/usar catálogos organizacionais mínimos de função/setor/ambiente para cumprir “cadastro de colaboradores”. Recomendo incluí-los como parte de colaboradores.gestao, sem matriz de treinamentos, programas, evidências ou workflows SST. Campos riscos de funções e abas SST devem ter escopo comercial decidido: não liberar funcionalidade técnica adicional só por reutilizar um catálogo. Alternativa é reduzir campos obrigatórios, mas isso altera o contrato da 016 e não é recomendada para esta fase.

Página inicial Free deve mostrar acesso e uso do cadastro, sem indicador de conformidade “100%” produzido por zero documentos visíveis. Dashboard, sidebar, detalhes de colaborador e relatórios não consultam módulos OFF nem apresentam dados operacionais. Dados históricos de módulo desligado são preservados e inacessíveis; política de exportação após downgrade precisa de decisão separada.

Não há requisito de teto de usuários/armazenamento total informado: não inventar limite contratual, mas definir controles antiabuso técnicos de criação de equipe/arquivos compatíveis com o Free. Logo permanece recurso do cadastro próprio se aprovado, com tamanho/tipo do contrato 022.

## 7. Limite de 100 colaboradores (E)

| Interpretação | Consequência |
|---|---|
| 100 registros históricos totais | Cada admissão consome capacidade permanentemente; desligamentos não liberam vaga; empresa com rotatividade esgota Free; incentivo indevido à exclusão, que hoje não é permitida ao cliente |
| 100 colaboradores ativos | Desativação com data libera vaga; históricos permanecem; contador corresponde ao dashboard atual; total histórico pode crescer e demanda gestão de custo/retensão separada |

**Recomendo 100 ativos, contabilizados por active=true, sem mudar a semântica de data_demissao. Depende da aprovação do usuário.** Datas ou respostas comerciais não substituem active. Não ativar recontratação/reativação nesta fase: 016 e API a proíbem; CPF permanece único por tenant, inclusive após desligamento. Se reativação futura for aprovada, ela também consome vaga transacionalmente.

### Enforcement transacional recomendado

Usar linha privada de uso por empresa, inicializada com contagem real no preflight/backfill aprovado; novo tenant inicia zero. Trigger obrigatório em colaboradores calcula delta de ativos: INSERT ativo +1, desativação -1, transição futura inativo→ativo +1, DELETE técnico de ativo -1. UPDATE irrelevante delta zero. Transferência de tenant continua proibida; se manutenção técnica específica precisar transferir, bloquear/ordenar as duas empresas e aplicar os dois deltas, sem bypass silencioso.

A reserva de vaga faz atualização atômica condicional do contador sob lock da linha de limite da empresa: somente incrementa se uso + delta <= teto, ou teto for explicitamente ilimitado. Falha aborta a escrita inteira. Todas as inserções, importações e alteração comercial de limite usam a mesma ordem de locks por empresa; mudanças de limite e desligamentos também serializam. Não confundir lock de leitura FOR SHARE dos guards atuais com reserva de capacidade. A atualização do contador deve ocorrer na mesma transação que grava o colaborador; rollback desfaz a reserva. Esse desenho evita depender de COUNT sobre snapshot anterior após esperar lock. Referência sobre snapshots e atualizações concorrentes: [PostgreSQL — isolamento](https://www.postgresql.org/docs/current/transaction-iso.html).

Trigger de quota separado do guard de autorização: **não repetir a saída antecipada de service_role presente nos guards atuais**. Cota/integridade deve aplicar também a inserções técnicas e COPY com triggers habilitados; exceção apenas manutenção explicitamente auditada e reconciliada. Owner/superuser pode desabilitar triggers e service_role pode executar operações privilegiadas: nenhum mecanismo de aplicação protege de administrador do banco que deliberadamente desativa a proteção. Isso não é um caminho disponibilizado ao cliente.

Impedir grants de UPDATE/INSERT/DELETE/TRUNCATE em empresa_uso para cliente. Impedir DELETE/TRUNCATE de colaboradores como hoje. Para manutenção owner, definir rotina que reconcilia contador e dados sob locks; não editar contador por painel comercial. Contador negativo é erro de integridade. Checagem periódica read-only compara contador com dados reais, com alerta técnico e sem listagem de pessoas no painel Admin.

Downgrade para limite abaixo do uso: recomendar bloqueá-lo com conflito comercial até regularização, ou aprovar explicitamente estado de excesso que bloqueia somente novos ativos e permite desligar/editar os existentes. Nunca desativar pessoas automaticamente. Teto ilimitado é NULL autorizado, não número mágico nem ausência silenciosa de configuração. Feature/limite ausente no novo tenant nega criação.

API faz pré-checagem amigável de uso para UX, mas aceita que banco arbitre disputa. Importador atual tem sucesso parcial: preservar essa semântica, informar importados/rejeitados por quota, interromper novas tentativas após teto e atualizar uso; não reservar 500 vagas só pelo limite da planilha. Se futuramente houver importação atômica em lote, reservar delta total na mesma transação. Testar inclusive multirow INSERT e ON CONFLICT/upsert; um contador em BEFORE INSERT ingênuo pode reservar para linha ignorada. Recomenda-se manutenção por eventos de linhas realmente inseridas/atualizadas (AFTER) e rollback em estouro, ou algoritmo equivalente comprovado para esses comandos. Não conceder upsert de campos imutáveis para habilitar importação.

## 8. Administração comercial pelo Super Admin (G)

Super Admin continua sendo role `admin`, sem impersonação e sem role operacional. Painel comercial permite listar empresas, origem de cadastro, plano, diagnóstico autodeclarado, concessões, limites e status. Não listar/editar colaboradores individuais, equipe interna, ASOs, treinamentos, documentos, fichas EPI ou arquivos operacionais.

Contagem comercial usa `empresa_uso` agregado ou função estreita de agregado, nunca SELECT privilegiado de colaboradores no repositório administrativo. Retornar somente empresa_id, quantidade ativa, eventualmente total histórico aprovado, limite e instante; sem nomes, CPF, IDs de pessoas, filtros por pessoa ou inferência de pequenos segmentos. Admin não recebe GRANT operacional para conseguir count. Tenant vê apenas seu resumo. O contador agregado é leitura comercial expressamente limitada, não ingresso no tenant.

Endpoints comerciais autenticados usam JWT/RLS de Admin, validação de catálogo e auditoria. Ao alterar feature/limite/status, banco revalida ator e trava configuração; frontend não fornece autoridade. Não usar service_role como cliente genérico de painel. Tenant não muda plano/limite/concessões/status, mesmo por PATCH direto. A revogação impede novas operações; escritas já em curso precisam de ordem de lock compatível para decisão serializada. Links assinados existentes exigem tratamento abaixo.

## 9. Segurança da superfície pública e Storage

| Ameaça | Controle proposto |
|---|---|
| Spam/signup massivo | CAPTCHA no Auth e provisionamento; limites distribuídos por IP confiável, identidade, e-mail/CNPJ pseudonimizados e teto global; alarmes e bloqueio progressivo |
| Bypass chamando Auth direto | Proteção Auth configurada no projeto; tenant nunca nasce de user_metadata/trigger automático; provisionamento passa pelo gate do servidor |
| Rate limit só em memória | Gateway/store compartilhado com TTL; não confiar em X-Forwarded-For arbitrário; orçamento de reenvio/confirm/provision/retry distinto |
| Enumeração de e-mail/CNPJ | Respostas públicas neutras, sem endpoint “CNPJ existe”; não devolver contatos/nome da empresa; limitar diferenças de mensagens/tempos |
| Conta/CNPJ existente | Login/recuperação legítima ou revisão de titularidade; não fazer upsert/vinculação automática |
| Payload malicioso | Allowlist, extra=forbid, limites de tamanho e listas, tipos estritos, CNPJ/DV no banco e API; nunca confiar em metadata de usuário |
| JWT adulterado/expirado | Auth get_user como hoje; não confiar em decode local sem assinatura; papel funcional e tenant do banco; confirmação e bloqueio reais |
| RPC/SECURITY DEFINER | Search_path vazio, nomes qualificados, owner mínimo, sem SQL dinâmico de payload, revogar EXECUTE público, grants por assinatura e wrapper; testes diretos por anon/authenticated |
| service_role | Somente servidor e provisionamento explícito; segredo fora de browser/logs; função de provisionamento com valores comerciais fixos; operações normais JWT/RLS |
| CNPJ em concorrência | Índice único canônico e transação; sem pré-reserva longa anterior à confirmação |
| Feature/status revogados | Consulta efetiva no banco, locks em escrita, invalidar cache, negar APIs e Storage; user_profiles.active permanece autoridade |
| Identidade confirmada de terceiro | Confirmação prova controle do e-mail, não titularidade do CNPJ; política de disputa/verificação empresarial antes de tratar titularidade como verificada |

Supabase possui limites próprios de Auth e suporte a CAPTCHA; os valores efetivos e SMTP devem ser conferidos antes do rollout, sem presumir configuração remota. Os limites do Auth não cobrem automaticamente o novo provisionador FastAPI. Referências: [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [produção](https://supabase.com/docs/guides/deployment/going-into-prod). Não registrar senha, tokens, corpos Auth nem dados pessoais completos; trilhas técnicas usam request_id e identificadores restritos. Definir TTL e retenção de rascunhos/identidades pendentes com finalidade comercial clara.

### Storage: classificação é requisito para features independentes

Preservar buckets privados, objetos, logos e referências legadas 019–023. Certificado requer treinamentos; logo é cadastro empresarial; assinaturas requerem EPI. Para arquivos raiz usados por documentos e ASO, recomendar registro de objetos com empresa, bucket/path e **classe de acesso imutável** atribuída pelo backend/banco, com política Storage consultando essa classificação. Reserva de upload requer a feature correspondente; um path novo ou sem classificação não recebe acesso do cliente. Registro não contém conteúdo clínico, mas metadado de autorização. Se compartilhado entre classes, exigir todas as features envolvidas ou impedir nova associação entre classes; nunca permitir que documento genérico referencie objeto ASO para desbloqueá-lo.

Alternativa é mover novos arquivos para namespaces separados; sozinha não resolve os objetos legados e altera contrato de paths. Antes de escolher: inventário autorizado de todas as referências, objetos sem vínculo, referências duplicadas/cross-class e URLs. Mapear legados sem mover/deletar arquivos; casos ambíguos bloqueiam ativação independente até resolução. O gate de Storage precisa valer também para download direto, listagem, signed URL, upload, copy/move e associação de arquivo em documentos/treinamentos. Não confiar em metadados definidos pelo cliente para classificar conteúdo.

Links assinados já emitidos são capacidade temporária: suspensão/revogação não garante invalidação instantânea do link previamente entregue. Recomendar validade curta e limite explícito de latência de revogação; necessidade de revogação imediata exige proxy autenticado por requisição ou mecanismo de invalidação suportado e testado. ASO atual emite URL de 60 segundos. Confirmar demais consumidores e comportamento real na homologação. Não prometer revogação instantânea apenas com RLS.

## 10. Mudanças frontend (J)

Criar cadastro/confirmar e-mail/retomar onboarding com indicação de etapa e resposta pública segura. Identidade sem perfil acessa apenas esse fluxo; usuário já vinculado não passa por bootstrap novamente. Novos formulários validam CNPJ numérico/alfanumérico, sem alterar leitura de legados.

Obter permissões e limites efetivos pelo backend; guards e navegação usam role + feature. Invalidar perfil/acesso/queries na troca de sessão, conclusão de onboarding e mudanças comerciais; não reutilizar cache de outro tenant. Admin recebe somente dashboard/painel comercial/configuração da conta global autorizada. Remover referências de conformidade operacional da sidebar Admin.

Minha empresa/equipe/colaboradores permanecem acessíveis no Free, com catálogos mínimos aprovados e logo conforme 022. Desabilitar consultas antecipadas a treinamentos/exames no detalhe de colaborador e consultas SST globais da sidebar/dashboard. UI de uso mostra ativos/teto/vagas disponíveis; erro definitivo do banco atualiza uso, sem revelar outro tenant. Não calcular conformidade sobre módulos inacessíveis nem vender diagnóstico como evidência. Relatórios/exportações filtram por autorização das fontes, não só pelo botão.

## 11. Compatibilidade e rollout (K)

Nenhuma empresa existente vira Free automaticamente. Antes do backfill, listar empresas e recursos autorizados existentes em preflight de agregados, com decisão comercial explícita por empresa/coorte. Recomendo concessões legadas explícitas somente para capacidades aprovadas como atualmente contratadas, teto ilimitado explicitamente aprovado ou limite contratado real; não inferir pacote contratado só por presença/ausência de dados. Não usar legado=true para autorizar todas as features futuras.

Preservar user_profiles/roles/empresa_id/active e status empresarial, FKs compostas, CPF, ASOs em documentos e resultado nullable, catálogos, views invoker, grants mínimos, referências de arquivo e bucket privado. Não renormalizar dados pessoais ou reinterpretar observações/resultados/diagnóstico. Colisão de CNPJ bloqueia migration; não funde tenants. Não editar migrations 015–023: proteção nova é incremental.

Ordem operacional: inventário/preflight → aprovação das concessões e conflitos → expansão de schema → backfill explícito e verificações → enforcement SQL/Storage completo → backend compatível → frontend → habilitar signup público. Banco pode ficar pronto antes do CTA; jamais lançar Free com módulos protegidos apenas no frontend. Se concessão/objeto legado não puder ser reconciliado, manter autocadastro desabilitado, sem relaxar RLS.

Rollback de aplicação fecha novos cadastros, mantém tenants já criados e concessões; não remover FKs/RLS/quotas para voltar versão. Mudanças de enforcement exigem app compatível previamente; desligar CTA não equivale a rollback de dados. Nenhuma exclusão de dados ou arquivos é parte da estratégia.

## 12. Escopo da futura migration 024 e divisão proposta

**Não foi escrito SQL de migration.** Recomendo dividir, porque quota, provisionamento, EPI legado e Storage compartilhado têm riscos e pré-requisitos distintos. Numeração abaixo é proposta e depende do planejamento de releases.

| Etapa | Escopo | Condição para avançar |
|---|---|---|
| 024 — fundação | Features/concessões, metadados comerciais, limites/uso privados, diagnóstico, solicitações/idempotência, auditoria; canonicalização e unicidade de CNPJ após preflight; grants/RLS das novas tabelas; sem signup habilitado | Conflitos CNPJ resolvidos e políticas de legado/limite aprovadas |
| 025 — enforcement funcional | Gates por módulo em RLS/guards/views/catálogos, proteção EPI/assinaturas, proteção Old/New de tipo ASO/documento, quota transacional e contador inicial consistente; agregados comerciais estreitos | Backfill de concessões aprovado; testes reais de concorrência e regressões |
| 026 — arquivos e provisionamento | Classificação autorizativa dos objetos compatível com Storage legado; fechamento de todos os paths; função atômica de bootstrap com grants mínimos; política de último gestor se aprovada | Inventário de referências/objetos sem ambiguidades; fluxo Auth validado em homologação |
| Release de aplicação | Endpoints, identidade sem perfil, antiabuso, callbacks, UI Free/comercial, rollout gradual | Todas as barreiras no banco/Storage ativas, SMTP/CAPTCHA/rate limits confirmados |

Se preferir uma única 024: deve conter todos esses controles após preflights independentes e aprovação completa; não habilitar parcialmente apenas a criação de empresa. Separar scripts pre/post read-only, expansão e cutover ajuda revisão. Numeração 025/026 pode ser reorganizada em execução, mas dependências e gates de liberação precisam permanecer. Não repetir a alegação “sem alteração de linhas” de fases anteriores: backfill de concessões, contadores e classificação introduz novos dados técnicos e precisa ser aprovado explicitamente.

## 13. Estratégia de testes necessária (L)

Os testes existentes incluem pytest backend, testes frontend e fixtures PGlite de RLS/grants/migrations. `supabase/tests/README.md` esclarece que PGlite não valida Auth real, PostgREST, drift remoto nem transações concorrentes. Não executar testes de integração remota nesta etapa. Os cenários abaixo são critérios de implementação futura, não validações já executadas.

| Camada | Cenários mínimos |
|---|---|
| Schemas/backend | Payload extra/role/admin/tenant/features/plano/teto rejeitado; ID do Auth; e-mail confirmado; usuário inativo/suspenso; 403 feature; 409 quota; erro sem senha/token |
| Autocadastro | Auth falha, e-mail pendente, callback expirado/reutilizado, identidade existente, rascunho expirado, CNPJ duplicado, payload diferente na mesma chave; nenhum vínculo automático a empresa existente |
| Atomicidade | Injetar falha em cada inserção; rollback de todas as partes do tenant; commit com timeout; retry idempotente; nenhuma identidade preexistente apagada |
| Roles/tenants | Dois tenants e Admin; empresa/gestor gerem equipe própria; operacional só capacidades atuais; Admin nega usuários, colaboradores, treinamentos, documentos, ASO, EPI e arquivos |
| Features | Empresas A/B/C e Free; feature ausente/desconhecida nega; cada tabela/API/RPC/view/catalog/export impedida; revisão permissive OR/restrictive AND; novas features OFF |
| ASO/documentos | documentos ON/exames OFF e inverso; tipo OLD/NEW, campos ASO, referência comum e tentativa de disfarçar arquivo; FKs/resultado legado preservados |
| Quota | 99→100 aceita e 100→101 nega; desligamento libera; reativação continua proibida; edição sem delta; inserir inativo direto proibido pelo contrato atual; multirow/ON CONFLICT/rollback não corrompem uso |
| Concorrência PostgreSQL real | Muitas conexões disputando última vaga; só uma confirma; CNPJ simultâneo; mesmo auth_user em duas solicitações; downgrade vs INSERT; suspensão/revogação vs escrita; ordem de locks, deadlocks e retries limitados |
| Importação | CSV/XLSX acima das vagas, sucessos parciais e motivo de quota; catálogos cruzados; nenhuma capacidade ampliada por importação; resultado e contador convergem |
| SQL direto | anon/authenticated/PostgREST/Supabase client: sem escrita comercial/contador/perfil/role; quota incide; RLS sem bypass por grants antigos; bootstrap service-only; service_role técnico respeita quota |
| Storage real | Buckets privados; list/download/upload/upsert/copy/move/URL assinada de cada classe; objeto não classificado negado; cross-class não desbloqueia ASO; logo segue 022; assinatura exige EPI/perfil/status |
| Comercial | Admin altera somente features/limites/status permitidos; agregado sem indivíduos; tenant não altera concessões; trilha imutável; último gestor protegido se aprovado |
| Legados/migrations | Preflight falha atomicamente em drift/CNPJ conflitante/contador incompatível; dados e objetos preservados; grants/constraints 015–023 não enfraquecidos; concessões legadas exatas; nenhum Free automático |
| Frontend/E2E | Login antigo, callbacks com basename, ausência de perfil, retomada; Free sem fetch SST; troca de conta limpa cache; suspensão/revogação atualiza UI; Admin só painel comercial |
| Antiabuso | Várias instâncias, IP spoofing, CAPTCHA replay, reenvio massivo, signup Auth direto, enumeração de respostas, logs sem segredo, limpeza segura |

Homologação deve usar projeto isolado com dados sintéticos e múltiplas conexões PostgreSQL; não usar clientes service_role para representar comportamento funcional. Reexecutar as suítes existentes de usuários/colaboradores/catálogos/treinamentos/documentos/logos/ASO/dashboard, mais pre/post de catálogo e hashes das migrations preservadas. Preflight remoto read-only só com autorização da próxima etapa.

## 14. Decisões que precisam de aprovação antes de implementar (M)

| Decisão | Recomendação |
|---|---|
| O que conta no teto Free? | 100 ativos, preservando histórico; informar que histórico total pode exceder 100 |
| Primeiro usuário | Role empresa, e-mail confirmado; nenhum papel novo de superadmin/proprietário |
| Quando a empresa existe? | Depois da confirmação e commit de provisionamento atômico; estados prévios apenas na solicitação |
| Limite abaixo do uso | Rejeitar redução até regularização, ou aprovar estado de excesso com bloqueio de novos ativos; nunca desligar pessoas automaticamente |
| Empresas existentes | Concessões/limites explícitos por empresa/coorte aprovados; nenhuma atribuição automática Free |
| Plano e features | Concessões efetivas explícitas; planos como templates versionados numa etapa posterior se necessários |
| Catálogos/Logo no Free | Função/setor/ambiente mínimos integrados a colaboradores e logo ao cadastro; delimitar campos SST adicionais |
| Endereço/diagnóstico | Endereço estruturado com campos ausentes; respostas triestado; quantidade inteira ou faixa; definir obrigatoriedade e histórico |
| CNPJ | Aceitar numérico e alfanumérico; unicidade canônica; corrigir colisões antes do cutover; decidir restrição de edição e comprovação de titularidade |
| Disputa de CNPJ | Revisão de titularidade sem anexar conta automaticamente; definir se Free autodeclarado inicia imediatamente ou requer validação empresarial |
| EPI/assinaturas | Remediar acesso global e active/status antes do rollout público; manter feature OFF no Free |
| Storage compartilhado | Classificação autorizativa com inventário legado; resolver referências entre classes; aprovar latência de revogação ou proxy |
| Último administrador do tenant | Proteção transacional e recuperação pelo titular/infraestrutura restrita, sem gestão interna pelo Admin global |
| Retenção/antiabuso | TTL, cleanup de identidades/rascunhos, orçamento de tenants/reenvios, SMTP/CAPTCHA e tratamento de suspeitas |
| Divisão das migrations | Aprovar fundação/enforcement/Storage+bootstrap separados e signup desligado até conclusão |

### Parecer

A arquitetura atual já oferece base forte de tenant e separação comercial nos módulos remediados. Autocadastro deve acrescentar um provisionador de escopo estreito, confirmação real de e-mail, integridade de CNPJ e concessões explícitas, mantendo operação normal em JWT/RLS. Free requer cota transacional no banco e bloqueio por módulo inclusive em documentos compartilhados, Storage, EPI e consumidores do dashboard. As maiores dependências antes de implementação são a interpretação do teto, as concessões legadas, a titularidade de CNPJ e a classificação segura de arquivos. Este documento não autoriza nem executa a próxima fase.
