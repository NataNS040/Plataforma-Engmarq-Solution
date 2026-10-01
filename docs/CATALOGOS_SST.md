# Catálogos SST — migração operacional

## Auditoria e comportamento preservado

`funcoes`, `setores` e `ambientes` já possuem UUID `id`, `empresa_id`, `nome`,
`descricao` e `active` (default true); funções também possuem `riscos`.
As PKs, UNIQUE `(empresa_id, nome)` e `(empresa_id, id)`, índices e FKs não mudam.
A migration 016 mantém as FKs compostas de colaboradores para os três catálogos.
A matriz de treinamentos também referencia funções.

Antes, catalogosService executava SELECT/INSERT/UPDATE diretamente no Supabase.
A tela mostrava somente ativos, e desativar já era UPDATE active=false.
As policies anteriores permitiam acesso de admin; a 017 remove esse acesso.

Preservado: listas da API incluem inativos, referências históricas continuam válidas,
inativos ainda podem ser resolvidos/utilizados na importação e seleção, e nomes
inativos continuam ocupando a UNIQUE. A unicidade do banco é sensível a maiúsculas;
a importação continua resolvendo nomes sem distinguir maiúsculas/minúsculas.
PATCH active=true permite reativação, mas não foi criada uma tela nova para isso.

## Contrato e segurança

Para cada recurso `/api/v1/funcoes`, `/api/v1/setores`, `/api/v1/ambientes`:
GET lista, POST cadastra, PATCH `/{id}` edita/desativa. Não existe DELETE nem
GET individual, pois nenhum consumidor precisa deste último.

React → cliente HTTP autenticado → FastAPI → Supabase/PostgREST com JWT do usuário
e chave pública. Auth continua no Supabase. CRUD não usa service_role/secret key.

Empresa e gestor ativos gerenciam somente o próprio tenant; operacional lê.
Admin não tem acesso funcional. Perfil inativo e empresa não ativa são bloqueados.
O backend obtém empresa_id do perfil autenticado; POST injeta o valor e PATCH filtra
por id e empresa_id. Campos extras e query parameters são rejeitados.

A migration 017 é transacional, somente de segurança e depende da 016:

- RLS SELECT/INSERT/UPDATE, sem policy DELETE;
- revoga grants de tabela e coluna de PUBLIC/anon/authenticated e concede somente
  SELECT, INSERT dos campos permitidos e UPDATE dos campos editáveis;
- trigger protege identidade/tenant e revalida ator/empresa com locks de leitura;
- funções privadas SECURITY DEFINER com search_path vazio e execução restrita;
- políticas desconhecidas abortam a aplicação, exigindo análise de divergência;
- mantém operações técnicas privilegiadas e todas as constraints existentes.

A permissão INSERT em empresa_id é necessária ao PostgREST, mas RLS/trigger
impedem valores de outro tenant. RLS continua protegendo tentativas diretas ao
PostgREST; a API não é a única barreira de autorização.

## Frontend, importação e consumidores

Hooks mantêm os contratos de consulta e incluem ator/permissão nas chaves do cache.
Mutações invalidam o catálogo, colaboradores e matriz de treinamentos para atualizar
nomes embutidos. A tela oferece cadastro, edição e desativação para empresa/gestor;
operacional não recebe controles de escrita e admin não recebe a aba.

CSV/XLS/XLSX continuam processados no navegador. Nomes existentes são reutilizados;
nomes ausentes são criados pela nova API antes do POST de colaboradores.
Sucessos parciais permanecem: catálogos criados antes de uma falha não são desfeitos.
Importações concorrentes podem encontrar conflito de nome (409), como antes.

Nenhum CRUD direto desses três catálogos permanece no frontend. Permanece a leitura
relacional `funcao:funcoes(id,nome)` em treinamentosService, protegida pela nova RLS;
Treinamentos não foi migrado integralmente. Exames, Documentos, EPI, Dashboard e
Relatórios não receberam migrações próprias nesta etapa. Consumos de colaboradores
continuam usando seus contratos existentes e referências aos catálogos.

## Validação e limites

Cobertura parametrizada: 75 testes novos backend, 16 frontend, 68 SQL/RLS.
SQL usa PGlite local com fixtures sintéticas, auth/storage simulados e migrations
reais; não substitui homologação de PostgREST/browser no ambiente implantado.
Os testes confirmam definições das constraints antes/depois da 017, grants,
isolamento, perfis bloqueados, escrita técnica e preservação de referências.

Não houve comparação SQL com o banco remoto nesta etapa. A aplicação remota deve
respeitar a ordem das migrations e revisar qualquer divergência detectada.
Nenhuma migration antiga foi editada. Nenhum dado remoto, usuário real ou policy
remota foi alterado. Não há decisão de negócio pendente para este escopo.
