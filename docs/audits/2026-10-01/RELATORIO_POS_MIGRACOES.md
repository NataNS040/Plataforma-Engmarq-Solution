# Auditoria pós-migrações — Plataforma EngMarq Solution

Data de referência: 01/10/2026, America/Sao_Paulo. Escopo: Users, Colaboradores,
Catálogos SST, Storage/Documentos e Treinamentos. Exames/ASO não foi iniciado.

## A. Resumo executivo

**Não aprovar o estado final como integralmente consistente e seguro ainda.**
A auditoria identificou **5 BLOQUEIOS, 8 ATENÇÕES e 2 MELHORIAS**, detalhados em H.
Esses números são achados técnicos agrupados do relatório, não resultados remotos.
Os totais do SQL contam verificações individuais e podem ser diferentes.

Não houve conexão ao projeto hospedado, execução de SQL remoto, push ou correção
de código funcional/migrations/testes existentes. Foram criados somente artefatos
de auditoria, evidências locais e o SQL pedido. As migrations foram exercitadas
exclusivamente em fixtures PGlite em memória, como validação local.

O operador informou aplicação bem-sucedida de 017 → 019 → 020 → 018 e confirmação
do rollback das tentativas anteriores. Esse relato é aceito como estado informado,
mas não substitui a verificação de catálogo/dados remotos. Não reaplicar migrations.

O endurecimento de Users/Colaboradores/Catálogos/Treinamentos está coerente no código
e nos testes correspondentes. A privacidade dos arquivos de Documentos está
separada da autorização dos registros de `public.documentos`: a 020 protege o
Storage, mas deixou as policies antigas da tabela e a view de documentos intactas.

Nas sondagens locais, admin leu 12 documentos e alterou metadados, embora lesse
zero objetos do bucket documentos. Um operacional do tenant B leu 11 registros do
tenant A pela view de documentos. Com SELECT na view liberado a anon, anon também
leu 12 linhas da view, embora a tabela e os arquivos retornassem zero. Esses testes
usam grants explicitamente registrados nas fixtures; os grants reais da view
precisam ser confirmados pelo SQL remoto.
Outra sondagem confirmou que um gestor de empresa suspensa conseguiu reativar
a própria empresa pelas policies legadas de Empresas e passou a ler Colaboradores.
Isso contorna a proibição da API de alterar status sem admin (B05); a exposição
remota também depende do grant de UPDATE(status) e de eventuais guards fora do repo.

## B. Migrations e ordem de aplicação

| Migration | Dependências e resultado esperado | Auditoria local / estado remoto |
|---|---|---|
| 015 | 014; substitui `can_manage_profile`/`guard_profile_update`, preserva policies e trigger da 014 | Admin retirado da gestão interna; estado remoto não consultado |
| 016 | 015; estabiliza inventário e troca três FKs de Colaboradores por compostas | UNIQUE `(empresa_id,id)` nos catálogos; grants por coluna; sem DELETE/TRUNCATE funcional |
| 017 | 016; helper e guards de catálogos | Três tabelas com SELECT/INSERT/UPDATE próprios; inativos preservados e sem DELETE |
| 019 | Schema privado/017 conforme fluxo documentado | Coluna `arquivo_path`, CHECK tenant/path e parser IMMUTABLE; não privatiza bucket |
| 020 | 017/019 e consumidores compatíveis | Verifica RLS gerenciado; backfill; 4 policies permissivas e 4 guards; bucket privado/10 MB/7 MIME; dois helpers e trigger de referência |
| 018 | 017 e bucket já privado | FKs de Treinamentos/Matriz compostas, view invoker, grants/guards de histórico e certificados |

**A ordem 017 → 019 → 020 → 018 é compatível.** A 018 só exige bucket privado e o
helper da 017; a 020 não depende de funções da 018. As guards da 018 e 020 coexistem,
combinando restrições, sem liberar UPDATE/DELETE dos certificados. A fixture
executou essa ordem e obteve 12 documentos, 4 URLs, 4 paths e zero backfills pendentes.
Não foi encontrada incompatibilidade causada por essa ordem.

A 018 não é reexecutável: CREATE FUNCTION/CREATE POLICY/CREATE TRIGGER e constraints
sem IF EXISTS colidem se repetidos. Isso não é defeito numa migration versionada
já aplicada. Não usar reexecução como auditoria. A 020 é reexecutável para os objetos
esperados, porém a versão local atual passou a embutir o origin real e reescrevê-lo
antes do BEGIN. Isso explica a regressão de testes B03 e limita sua portabilidade.
O SET/DO inicial não escreve dados; backfill/DDL de aplicação/policies/bucket seguem
na transação BEGIN/COMMIT. Não há ALTER de RLS/ownership em `storage.objects`.

As FKs antigas foram substituídas, não duplicadas: Colaboradores → Funções/Setores/
Ambientes; Treinamentos → Colaboradores; Matriz → Funções. As FKs de tipo de
treinamento permanecem simples porque o catálogo é global. A FK de Documentos →
Colaboradores continua simples (AT06). UNIQUE de matrizes impede requisito duplicado.

Os 11 helpers/guards privados relevantes têm search_path vazio; helpers de decisão
são SECURITY DEFINER/STABLE; guards são SECURITY DEFINER; parser legado é
SECURITY INVOKER/IMMUTABLE. Authenticated recebe EXECUTE nos helpers de decisão;
anon recebe EXECUTE apenas em `can_access_documento`, que retorna false para esse
papel. Anon não tem USAGE no schema privado. Funções de trigger/parser não têm
EXECUTE funcional liberado. Nenhuma delas recebe identidade do ator como argumento.
Dois helpers públicos anteriores (`get_user_role`, `get_user_empresa_id`) não têm
search_path fixo; isso permanece AT04, condicionado aos privilégios de criação.

O SQL compara assinatura/flags/ACL/fingerprint de corpo, definição e validação de
constraints, eventos/habilitação/função de triggers e expressões reais de policies.
Nome correto ou execução sem erro não bastam. Divergência de corpo exige revisão;
o catálogo detalhado precede o consolidado. O catálogo esperado foi produzido das
migrations locais, incluindo suas limitações conhecidas; B01/B02 são checados à parte.

## C. Segurança multi-tenant

| Domínio | Empresa/gestor | Operacional | Admin | Tenant e bypass |
|---|---|---|---|---|
| Users | Lista equipe própria; cria interno; altera role/active de outro usuário não-admin | Próprio perfil; sem administrar | Próprio perfil; API nega gestão interna | Tenant do perfil verificado; inserts diretos proibidos; trigger impede troca de empresa/self-promotion/admin |
| Colaboradores | Criar/editar/desativar próprios | Ler próprios | Sem dados operacionais | API deriva tenant; schema extra=forbid; RLS/trigger/FKs compostas persistem na chamada direta |
| Catálogos | Ler/criar/editar/desativar/reativar próprios | Ler próprios | Sem dados operacionais | Helper valida perfil/empresa ativos; grants por coluna e trigger; sem DELETE |
| Arquivos Documentos | Ler/upload próprio; UPDATE/DELETE de gerais próprios | Ler próprio | Sem arquivos | 020 verifica papel authenticated, tenant, perfil/empresa ativos; PUBLIC restrictive guards negam anon/admin |
| Registros Documentos | Legado permite CRUD próprio | Leitura própria | **Legado permite acesso global** | Sem helper ativo da 017; B01. A view também contorna RLS quando acessível: B02 |
| Treinamentos/Matriz | Próprios; matriz removível, histórico não | Ler próprios | Sem operacional | RLS da 018 e API JWT; FKs compostas; SELECT da view obedece RLS |

Não existe `superadmin` separado em `public.user_role`, no backend ou no frontend:
o papel global implementado é `admin`. As allowlists excluem papéis diferentes;
não é correto afirmar que foi homologado um papel `superadmin` inexistente.

`empresa_id` do frontend nos módulos migrados é contexto de UI/cache. As fachadas
descartam esse campo antes da API; o backend o obtém do perfil ligado ao usuário
validado pelo Supabase Auth. Consultas por IDs sempre recebem filtro adicional de
tenant. `/usuarios?empresa_id=` aceita apenas o próprio e rejeita outro. Colaboradores,
Catálogos e Treinamentos rejeitam query params, e inputs recusam campos extras.

O acesso direto por JWT aos módulos endurecidos é limitado por RLS/ACL/guards.
Passar pela API não é condição imposta por PostgreSQL: usuários autorizados ainda
podem chamar PostgREST nas operações permitidas. Isso não equivale a obter outro
tenant; validações presentes só na API podem, entretanto, ser contornadas (AT02/AT07).

Colaboradores usam active=false + data_demissao, impedem reativação e tornam CPF,
tenant, admissão e campos técnicos imutáveis. Não há rota DELETE; ACL não concede
DELETE/TRUNCATE. CSV/XLS/XLSX é parseado no browser, catálogo resolvido pela API e
cada linha enviada pelo POST comum; até 500 linhas, sucesso parcial preservado.
Catálogos incluem inativos para manter referências históricas; seletores usam ativos.
A validação server-side confere tenant, não impõe catálogo ativo em nova associação.
`riscos` de Funções é texto opcional editável pelo gestor/empresa do tenant, não código.
O isolamento dos módulos endurecidos pressupõe que `empresas.status` não possa
ser reativado pelo próprio tenant suspenso. A 005 libera UPDATE da própria empresa
a gestor/empresa; as ACLs não restringem status nas migrations posteriores. API e
RLS não estão alinhados nesse controle central: B05.

## D. Storage, Documentos e certificados

O resultado **esperado remoto**, ainda não medido pelo agente, é:

| Verificação | Esperado |
|---|---:|
| public.documentos | 12 |
| arquivo_url não nulo | 4 |
| arquivo_path não nulo | 4 |
| pending_backfill | 0 |
| storage.objects documentos | 4 |
| Referências canônicas/legadas/certificados sem objeto | 0 |
| Paths/referências cross-tenant | 0 |
| MIME/tamanho incompatíveis | 0 |
| Bucket public | false |
| Limite | 10485760 |

MIME: application/pdf, application/msword,
application/vnd.openxmlformats-officedocument.wordprocessingml.document,
application/vnd.ms-excel,
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
image/jpeg e image/png. O bucket/API é a autoridade de MIME/tamanho; as constraints
das tabelas não validam bytes de upload nem fazem sniffing de conteúdo.

`arquivo_path` possui CHECK vinculado à empresa e trigger que exige objeto existente
quando inserido/alterado. `arquivo_url` não pode ser inserido/alterado por authenticated;
empresa_id do registro é imutável. Esses controles não bloqueiam leitura/alteração
de outros metadados por admin através das policies legadas. Não houve perda na
fixture; preservar contagem remota não prova identidade de linhas, objetos ou bytes.

Para certificados, o frontend gera `{empresa_id}/certificados/{uuid}.{ext}` com
UUID aleatório, upsert=false. A regra SQL aceita filename alfanumérico com `_`/`-`,
não exige UUID estrito. A referência persistida é o path. O download usa
`createSignedUrl` por 60 segundos após autorização, nunca `getPublicUrl`.
`getPublicUrl` restante está em logos e assinaturas, não certificados.

As quatro guards gerais restritivas aplicam-se a PUBLIC; as quatro guards de
certificados da 018 a authenticated. UPDATE/DELETE de qualquer objeto cujo segundo
segmento é certificados é negado em ambas. Policies permissivas de outros buckets
não superam uma guard restritiva correspondente; o SQL exibe e sinaliza todas as
policies adicionais para revisão. Storage service_role/owner conserva acesso técnico,
que não deve ser usado como identidade funcional do admin.

Imutabilidade de objetos de certificado não torna imutável o campo certificado_url
do treinamento: ele é editável pelo gestor/empresa, inclusive removível. O controle
atual impede tenant/formato inválidos, mas aceita path de objeto inexistente (AT02).
Arquivos gerais referenciados continuam removíveis via Storage direto (AT03).
O bucket privado não invalida cópias já baixadas; signed URLs são bearer links
durante sua validade. CDN, arquivos reais e assinatura de URL exigem homologação
externa pelo operador; SQL read-only não verifica esses serviços.

## E. Frontend — inventário completo de acessos

`frontend-supabase-occurrences.csv` classifica cada ocorrência real com arquivo,
linha, método, recurso, classe e motivo. `frontend-search-exclusions.csv` contém
os falsos positivos (Array.from, Headers.delete, fachadas de API). Busca cobriu
todos os arquivos TS/TSX em frontend/src, não apenas módulos visíveis.
Foram classificadas **89 ocorrências de métodos**: 16 A, 12 B, 8 C e 53 D;
sete resultados não eram chamadas ao Supabase e constam no arquivo de exclusões.
São ocorrências sintáticas (from/select contam separadamente), não 89 requisições.

| Classe | Uso / arquivos |
|---|---|
| A — legítima | Supabase Auth (login/logout/sessão/troca de senha), leitura do próprio perfil em AuthProvider/documentosStorage e Storage documentos autorizado com JWT |
| B — legado necessário | documento_tipos/exames_catalogo; upload/getPublicUrl de logos. Exames não foi migrado nesta auditoria |
| C — bypass arquitetural | Dashboard consulta Colaboradores, Treinamentos, empresas e view de Treinamentos direto, embora operações desses domínios estejam migradas para FastAPI |
| D — risco | Documentos/ASO via tabela com policies globais de admin; dashboard via vw_dashboard_documentos; EPI com policies legadas globais; getPublicUrl de assinaturas para bucket que a 012 define privado |

Os serviços principais de Users, Colaboradores, Catálogos e Treinamentos usam
React → FastAPI → user client Supabase com JWT/RLS. Upload/assinatura de arquivo
usa a API Storage direta com JWT, escolha intencional e legítima. Metadata de
Documentos, Exames e EPI ainda está em PostgREST; não há rotas correspondentes no
router backend. Exames/ASO fica como legado identificado, sem iniciar migração.

Nenhuma referência a service_role/Secret Key foi encontrada no código frontend.
O cliente usa VITE_SUPABASE_ANON_KEY; valores reais de env e bundles implantados
não foram inspecionados, portanto isso não certifica que a configuração implantada
não recebeu uma chave errada. O próprio tenant selecionado em UI não é prova de RLS.

## F. Backend

Todas as rotas de dados auditadas dependem de CurrentProfile → CurrentUser →
Bearer obrigatório → Supabase Auth get_user(token). O perfil vem do ID autenticado,
e perfil ativo/empresa ativa são verificados antes do serviço. Health é público
por desenho. CORS usa origens explícitas, debug=false e respostas de dados no-store.

Repositories operacionais recebem `create_user_client`: anon/publishable client
com Authorization Bearer do chamador e HTTP client por request. Não foi encontrado
service_role como dependência default de CRUD de Colaboradores/Catálogos/Treinamentos/
Empresas ou leitura/update de Users. Consultas incluem tenant além de RLS.

O único caminho privilegiado funcional identificado é provisionamento de usuário:
criar identidade no Auth, inserir profile e compensar falha removendo o Auth recém
criado. Exige empresa/gestor ativo via CurrentProfile, recusa role admin, usa tenant
do ator e input extra=forbid. É uso necessário de Admin API/Secret Key; não é CRUD
operacional comum. Não há transação compartilhada entre validação do ator e o
provisionamento privilegiado, deixando a janela de revogação AT08. A falha de
compensação exige reconciliação e registra somente UUID, não senha/JWT.

Repositórios não executam SQL arbitrário/RPC nem aceitam nome de tabela do cliente.
Os três catálogos são allowlist fechada; nomes de Treinamentos são passados pelas
rotas internas. Validações por UUID, role, schema e filtros protegem seleção de tenant.
Não foi auditado o processo/configuração implantado, as chaves reais ou a política
remota de Auth/signup/exposed schemas; esses itens entram em AT01.

## G. Testes e evidências

| Suíte / check | Total | Passes | Falhas | Evidência |
|---|---:|---:|---:|---|
| Backend pytest | 347 | 347 | 0 | audit-backend.log + audit-backend-collection.log |
| Frontend Vitest | 159 | 159 | 0 | 12 arquivos; audit-frontend.log |
| SQL/RLS npm test | 296 | 252 | 44 | audit-sql.log; todas em documentos_storage.test.mjs |
| Total das suítes existentes | **802** | **758** | **44** | Nenhum skip/cancelamento |
| Typecheck | — | passou | 0 | audit-typecheck.log |
| Build | — | passou | 0 | audit-build.log |
| diff --check | — | passou | 0 | sem erro de whitespace; avisos LF/CRLF de arquivos preexistentes |

Warnings: uma depreciação Starlette/TestClient/httpx no backend; build alerta de
chunk >500 kB (principal 1.164,83 kB / gzip 324,31 kB) e aviso de tempo do plugin
rolldown:vite-resolve. A sugestão de cache de transforms do Vitest é informativa.
Nenhuma falha de frontend/typecheck/build foi ocultada.

A falha raiz SQL é `Unrecognized legacy document reference` no before da suíte:
fixtures usam https://synthetic.supabase.co; a 020 local agora faz SET para o origin
real, tornando essas URLs incompatíveis. O hook impede execução dos 44 testes;
portanto eles **não confirmam** o comportamento de Storage no estado atual.
O teste de injeção de falha também depende da formatação textual antiga do DROP,
outra fragilidade de harness identificada, sem correção nesta etapa.

Evidência suplementar, fora desses totais: `post_migrations_015_020_audit_local.mjs`
rodou a sequência atual com IDs/dados sintéticos e origin literal compatível,
sem rede. `local-probes.json` registra 12 sondagens, incluindo os dois vazamentos
e a aceitação de certificado inexistente. Isso não transforma a suíte vermelha
em verde nem é prova de estado hospedado.

O novo SQL passou validação de formato/STATUS/totais e comparação de snapshots de
documentos, objetos, buckets, policies, triggers e funções antes/depois. Sete cenários
negativos (MIME, tamanho, bucket público, RLS desligado, search_path divergente,
guard ausente e contagem divergente) foram detectados sem o SQL alterar o estado.
`local-audit-validation.json` documenta esses checks.

Na fixture completa, o SQL produziu **3 BLOQUEIOS e 19 ATENÇÕES**: os bloqueios são
as policies de documentos, a view e a reativação por gestor. As atenções incluem cinco policies de outros
buckets, seis linhas de histórico ausente, verificação externa e limites de integridade.
São contagens de linhas do SQL local, diferentes dos 5/8 achados agrupados em H.
O operador obterá os totais **remotos** ao executar manualmente o arquivo.

## H. Riscos — classificação técnica

| ID | Classe | Evidência / impacto | Encaminhamento após revisão, não executado |
|---|---|---|---|
| B01 | BLOQUEIO | 007:44–59 preserva admin global e não checa active/status em public.documentos. Sondagem: admin leu 12 linhas e atualizou um título; perfil inativo leu 11 | Definir autorização dos metadados/DELETE e endurecer tabela em mudança revisada |
| B02 | BLOQUEIO | 001:160 view de documentos sem invoker; dashboard:96/102 a usa. Com SELECT liberado, operacional B viu 11 linhas de A, anon viu 12 | Confirmar grants/owner remoto e corrigir isolamento da view/consumidor |
| B03 | BLOQUEIO | 020:19 sobrescreve origin; testes:8/47 usam origin sintético. 44 falhas no hook; não há validação verde do Storage atual | Separar configuração de implantação do contrato reproduzível, revisar harness sem enfraquecer asserts |
| B04 | BLOQUEIO | dashboardService:37/46/49/112 ainda consulta domínios migrados diretamente. RLS limita dados endurecidos, mas arquitetura não está concluída | Migrar consumidores/indicadores para contrato FastAPI revisado |
| B05 | BLOQUEIO | 005 empresa_update_admin + UPDATE(status) permite gestor/empresa reativar a própria empresa. Sondagem: gestor suspenso alterou uma linha e voltou a ler um colaborador; API empresas.py:46–48 exige admin para status | Alinhar ACL/RLS/guard de Empresas à autoridade administrativa antes de confiar em empresa ativa |
| AT01 | ATENÇÃO | Estado remoto, identidade dos dados/blobs, histórico, Auth, exposed schemas e versões/configuração implantadas ainda não medidos | Executar SQL manual e homologação com JWTs/Storage; não declarar estado remoto certificado |
| AT02 | ATENÇÃO | treinamentos.py:17–26 e CHECK da 018 validam path/tenant, não objeto. INSERT local com certificados/missing.pdf foi aceito | Definir verificação server-side/DB de existência e política de substituição de referência |
| AT03 | ATENÇÃO | 020 permite UPDATE/DELETE em arquivos gerais; sondagem removeu objeto ainda referenciado dentro da transação de teste | Decidir integridade referencial dos objetos e restringir remoção conforme regra de negócio |
| AT04 | ATENÇÃO | Helpers públicos da 001:205/210 SECURITY DEFINER sem search_path fixo; exploit depende de privilégios de criação/execução | Revisar ownership, ACL, CREATE public/temp e qualificação de referências |
| AT05 | ATENÇÃO | EPI 011 mantém admin global e FKs legadas; frontend usa getPublicUrl em assinatura cujo bucket a 012 define privado | Auditar EPI/assinaturas em escopo próprio; sem alterar bucket para contornar |
| AT06 | ATENÇÃO | FK documentos_colaborador_id_fkey simples e inserts legados aceitam colaborador de outro tenant sem arquivo; fora do endurecimento Storage | Pré-requisito para futura Exames/ASO: revisar vínculo e imutabilidade/tenant |
| AT07 | ATENÇÃO | Treinamento não impõe vencimento>=realização nem horas>=0 no DB; API só limita horas. Desligamento não compara admissão | Definir invariantes de negócio e checks; SQL mede inconsistências atuais |
| AT08 | ATENÇÃO | create_usuario usa Admin API depois da verificação inicial; revogação de ator durante provisionamento pode não impedir o insert técnico | Definir rechecagem/transação/coordenação do provisionamento e reconciliação |
| M01 | MELHORIA | Avisos de bundle, plugin e TestClient; não são falhas funcionais de segurança | Planejar divisão de bundle/atualização de dependências |
| M02 | MELHORIA | Documentos de implantação/preflights antigos descrevem 020/018 pendentes e exigem ausência de footprints agora esperados | Atualizar runbook depois da confirmação remota; não rodar preflight pré-cutover como pós-migração |

Os achados B01/B02 são evidência local sobre o código aplicado por definição;
o grau de exposição remota depende dos grants/definições reais que o SQL medirá.
Não foram apresentados como incidentes remotos observados.

## I. Próximo passo e SQL para o operador

**Não estamos prontos para iniciar a implementação de Exames/ASO com esta base
aprovada.** Revisar este relatório, executar o SQL read-only manualmente e trazer
os resultados para confirmar o estado pós-migração. Depois, acordar correções dos
bloqueios e validar novamente a suíte/consumidores antes da próxima migração funcional.
Não há autorização nesta etapa para corrigir os itens ou implantar mudanças.

Arquivo: `supabase/tests/post_migrations_015_020_audit_readonly.sql`.
Executar integralmente em sessão nova, com papel de auditoria que tenha SELECT
integral de todas as tabelas. Não usar JWT de usuário operacional para medir baseline.
O script não altera origin de sessão e usa origin confiável literal somente em SELECTs.
READ ONLY + REPEATABLE READ mantém snapshot e impede DDL/DML; não cria objetos.
Consultas detalhadas de catálogo precedem a última tabela CHECK / RESULTADO / STATUS,
terminada por TOTAL_BLOQUEIOS e TOTAL_ATENCOES. Guardar inventário sem publicá-lo.

O script foi validado em PostgreSQL PGlite local, não no Supabase real. Comparações
de texto/fingerprint podem exigir revisão em diferenças de versão/formatação;
divergência não autoriza reparo automático. Se estruturas/privilégios faltam,
contagens são marcadas BLOQUEIO e não tratadas como zero.

Fontes primárias para interpretação:
[PostgreSQL: view security_invoker e RLS](https://www.postgresql.org/docs/17/sql-createview.html),
[PostgreSQL: ACLs](https://www.postgresql.org/docs/17/ddl-priv.html),
[Supabase: Storage RLS e service keys](https://supabase.com/docs/guides/storage/security/access-control).
Demais evidências vêm dos arquivos locais e fixtures descritos, não de consultas remotas.
