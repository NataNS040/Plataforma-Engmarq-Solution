# Treinamentos — migração para FastAPI

## Modelo e comportamento preservados

- `treinamento_tipos`: catálogo global de tipos/NRs, descrição e validade em meses.
  A aplicação consulta; não foi criada administração global deste catálogo.
- `matriz_treinamentos`: configuração por empresa, função e tipo, com `obrigatorio`.
  UNIQUE `(empresa_id, funcao_id, treinamento_tipo_id)`. Não referencia realização
  nem é referenciada por registros históricos; sua remoção não apaga treinamentos.
- `treinamentos`: registro realizado por colaborador/tipo, datas, carga horária,
  instrutor, modalidade, certificado, status e created_at. Não há turma,
  participação separada, cancelamento ou coluna active no modelo atual.
- `vw_dashboard_treinamentos`: view de alertas por datas, agora security_invoker.

Antes, serviços executavam operações diretamente no PostgREST, incluindo DELETE
físico de treinamentos. A tela e o perfil do colaborador ofereciam essa exclusão.
Ela foi removida, sem inventar uma regra de cancelamento. Edição existente continua
possível; não foi introduzido versionamento/auditoria de revisões nesta etapa.

A grade principal continua mostrando tipos com registros realizados. O perfil do
colaborador combina requisitos por função com realizados, exibindo pendências e
treinamentos extras. Não foi introduzida regra nova sobre NRs. O formulário sugere
vencimento a partir de validade_meses e permite ajuste, como antes.

O trigger existente calcula status em INSERT/UPDATE: sem vencimento = em_dia;
passado = vencido; até 30 dias = vencendo; depois = em_dia. A view calcula por
CURRENT_DATE. Status armazenado pode ficar desatualizado sem nova escrita; a grade
continua usando esse status. Não foi criado job de recálculo.

## API e permissões

Todas as URLs têm prefixo `/api/v1`:

| Recurso | Operações |
|---|---|
| `/treinamento-tipos` | GET |
| `/matriz-treinamentos` | GET, POST |
| `/matriz-treinamentos/{id}` | PATCH de obrigatorio, DELETE da configuração |
| `/treinamentos` | GET, POST |
| `/treinamentos/{id}` | GET, PATCH |
| `/colaboradores/{id}/treinamentos` | GET |

Empresa/gestor ativos gerenciam apenas a própria empresa; operacional lê.
Admin não lista registros internos, participantes ou requisitos nem escolhe empresa
para operá-los. Perfil inativo e empresa não ativa são bloqueados por CurrentProfile
e novamente pela RLS. DELETE de histórico não tem endpoint nem grant/policy.

POST injeta empresa_id do perfil autenticado. PATCH não aceita empresa_id e consulta
ID + empresa_id. Query parameters e campos extras são rejeitados. Relacionamentos
com colaborador/função são validados no backend e por FKs compostas; tipos são
globais, validados por existência. CRUD usa cliente com chave pública e JWT do ator,
sem Secret Key/service_role. Respostas são validadas por schemas e erros sanitizados.

## Migration 018

Estado remoto informado pelo operador em 01/10/2026: 018 ainda não aplicada;
019 aplicada; preflight pós-019/pré-020 aprovado (12 documentos, 4 URLs legadas,
0 paths canônicos, 4 pendentes; 4 objetos, MIME/tamanho incompatíveis = 0).
A 018 deve aguardar 020 e sua validação pós-corte. Veja `STORAGE_DOCUMENTOS.md`
para o runbook atualizado e o preflight consolidado existente. Não reaplicar 019.

Depende de 017; transação única, sem correção automática de dados legados.

- Acrescenta UNIQUE `(empresa_id,id)` em colaboradores e troca as FKs simples
  de treinamentos→colaboradores e matriz→funções por FKs compostas equivalentes.
- Mantém intactas as FKs de catálogos criadas na 016, índices e dados históricos.
- CHECK limita certificado_url à pasta `{empresa_id}/certificados/arquivo.ext`.
- Substitui policies operacionais, restringe grants de tabela/coluna e mantém
  DELETE somente na configuração da matriz; TRUNCATE não é concedido à aplicação.
- Reutiliza autorização privada da 017; adiciona trigger com validação do ator e
  locks de perfil/empresa. Bloqueia alteração de tenant/identidade e exclusão de
  histórico mesmo se uma policy DELETE permissiva for criada posteriormente.
- Funções novas SECURITY DEFINER com search_path vazio e execução restrita.
- View usa RLS do invocador. Catálogo de tipos é somente leitura para atores válidos.
- Aborta diante de relações cross-tenant, certificado legado fora do padrão,
  bucket documentos ausente/público ou policies inesperadas nas tabelas tratadas.
  Falhas revertem a transação; não eliminam ou consertam registros silenciosamente.

## Certificados e consumidores

Upload permanece no Supabase Storage com JWT do usuário. Download passa a gerar URL
assinada de 60 segundos para o caminho privado, em vez de abrir o caminho como URL.
Policies RESTRICTIVE limitadas ao namespace certificados complementam as policies
existentes: empresa/gestor inserem; empresa/gestor/operacional leem a própria pasta;
admin/inativos não acessam. UPDATE/DELETE dos objetos de certificado são bloqueados
para preservar arquivos históricos. Namespaces dos demais documentos não mudam.

Os grants técnicos de service_role são preservados; isso não é utilizado no CRUD.
URLs assinadas já emitidas são credenciais temporárias e podem continuar válidas
até expirar, mesmo após mudança de papel/permissão.

Colaboradores consome API de treinamentos/matriz e perde somente a exclusão física.
Hooks isolam cache por identidade/permissão/tenant; edição invalida participantes
antigos/novos e indicadores. Indicadores de treinamentos do admin são indisponíveis;
conformidade global passa a considerar somente documentos, indicado na interface.
Sidebar tolera indicadores ausentes.

Acessos diretos remanescentes relacionados ao módulo:

1. Auth: sessão e JWT existentes, fora do escopo de migração.
2. Storage de certificados: upload e URL assinada, protegidos pela 018.
3. Dashboard: SELECT id/status de treinamentos e SELECT da view para indicadores
   próprios; ambos sob RLS. Admin não faz essas consultas. Dashboard/Relatórios não
   foram migrados integralmente. Não há CRUD direto de treinamentos/matriz/tipos.

## Riscos A/B/C e homologação

- A: nenhum bloqueador local pendente. Dados legados incompatíveis ou divergências
  remotas exigem análise antes da aplicação; não houve consulta SQL remota nesta etapa.
- B resolvidos: exclusão física, relacionamentos cross-tenant, view com privilégio
  do dono, acesso de admin, permissões de certificados e cache entre identidades.
- C: status armazenado não envelhece automaticamente; seleção de registro na grade
  mantém a ordem existente, enquanto o perfil escolhe última realização; uploads
  bem-sucedidos seguidos de falha no POST podem deixar arquivos órfãos; não há limpeza
  automática. Não há trilha de revisões nem cancelamento de histórico no modelo atual.

Sem decisão de negócio necessária para este escopo. Cancelamento, versionamento,
limpeza técnica e agregados autorizados para admin são possíveis trabalhos futuros.

Testes SQL usam PGlite local e fixtures sintéticas compartilhadas com Catálogos;
backend usa transporte PostgREST/Auth simulado; frontend usa Vitest/SSR. Não substituem
homologação de navegador, Auth/PostgREST e Storage reais após implantação coordenada
da migration/backend/frontend. Não houve alteração de dados reais, migration remota,
commit ou push nesta implementação.

## Resultado da validação local

| Diretório / comando | Resultado |
|---|---|
| backend: `.\.venv\Scripts\python.exe -m pytest` | 347 passed, 1 warning in 27.98s |
| frontend: `npm.cmd test` | 121 passed, 11 arquivos; 4.06s |
| frontend: `npm.cmd run typecheck` | exit 0, sem erros |
| frontend: `npm.cmd run build` | exit 0; 2531 módulos; Vite 1.66s |
| supabase/tests: `npm.cmd test` | 252 passed, 0 failed/skipped/cancelled/todo; 13467.0132ms |

SQL: 42 user_profiles + 66 colaboradores + 68 catálogos + 76 treinamentos.
Novos casos: 42 backend, 18 frontend (um substitui cobertura anterior de consumidor
direto, saldo +17), 76 SQL. Nenhuma falha restante.

Warnings: StarletteDeprecationWarning pelo uso de httpx no TestClient; bundle final
de 1163.06 kB acima de 500 kB; Git avisa conversão LF→CRLF. Vitest sugere cache de
transformações (informativo). Na preparação, um comando npm foi executado na raiz
sem package.json (ENOENT); foi executado novamente no diretório frontend correto.

Falhas intermediárias corrigidas: mock Response reutilizado após leitura; teste
antigo de consumidor de treinamentos ainda mockava PostgREST em vez de FastAPI;
cinco casos de rollback com loader sem remoção do BOM de migration antiga. Foram
defeitos/adaptações dos testes desta etapa, sem falha funcional residual identificada.
