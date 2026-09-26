# Migração incremental — Empresas

## Escopo desta entrega

Primeiro recorte: administração das empresas-clientes. Antes, `empresasService.ts` consultava e gravava diretamente no Supabase. Agora:

`hooks existentes → empresasService (fachada) → services/api/empresas → FastAPI route → EmpresasService → EmpresasRepository → Supabase`

Não houve alteração de componentes, layout, rotas React ou query keys. A fachada preserva nomes, tipos, retornos e invalidações do React Query. A listagem continua ordenada por razão social e retorna `colaboradores_count`; o relacionamento de contagem também respeita RLS. O limite de linhas configurado no PostgREST continua aplicável, como antes.

| Endpoint | Operação |
|---|---|
| GET /api/v1/empresas | Listar empresas visíveis e contagem de colaboradores |
| GET /api/v1/empresas/{id} | Consultar empresa |
| POST /api/v1/empresas | Cadastrar; retorna 201 |
| PATCH /api/v1/empresas/{id} | Editar parcialmente; suspensão usa `status: "suspensa"` |

Não existe DELETE: a suspensão preserva dados e relacionamentos. Campos omitidos no PATCH são preservados; nulos explícitos limpam somente campos opcionais. Pydantic valida UUID, status, razão social, formato de CNPJ e UF; rejeita campos extras/servidor, PATCH vazio e nulos em campos obrigatórios. Não foi introduzido cálculo de dígito verificador de CNPJ. Os registros legados são lidos sem exigir retroativamente os novos formatos de entrada.

## Identidade, autorização e RLS

Todas as operações deste módulo usam **anon key + JWT do usuário**, em um cliente por requisição. Nenhuma usa `service_role`. A identidade é validada por Supabase Auth; papel, vínculo e situação vêm de `user_profiles`, não de metadados editáveis. Perfil e empresa do ator precisam estar ativos.

| Perfil | Leitura | Cadastro | Edição | Alterar status |
|---|---|---|---|---|
| admin | Empresas permitidas pelo RLS | Sim | Empresas permitidas pelo RLS | Sim |
| gestor / empresa | Própria empresa | Não | Própria empresa | Não |
| operacional | Própria empresa | Não | Não | Não |

A API impõe escopo antes de consultar/gravar e o RLS permanece como segunda verificação. Mudanças de status foram reservadas ao administrador por afetarem o acesso da organização; a migration 005 permite edição mais ampla para gestor/empresa. **Esta restrição adicional vale na API, mas não fecha o caminho direto ao Supabase ainda permitido pelas policies existentes.** Não é correto considerar a API a única barreira de segurança nesta fase. Uma etapa posterior deve alinhar permissões de coluna/funções/policies sem remover RLS nem interromper os domínios que ainda dependem de acesso direto.

A consulta de identidade `/me`, AuthProvider e consultas agregadas do dashboard continuam usando seus caminhos próprios; migrar Empresas não remove todas as leituras da tabela `empresas` em outros domínios. Não houve mudança de banco, policies, migrations ou seeds.

Atualização posterior: o provisionamento de identidade/perfil foi migrado para `POST /api/v1/usuarios`, com autorização e compensação no FastAPI. Veja [o fluxo atual](../backend/README.md#criação-de-usuários). Nenhuma chave privilegiada foi adicionada ao frontend.

Erros: 401 identidade inválida; 403 autorização/RLS; 404 registro não encontrado ou invisível; 409 duplicidade/conflito; 422 entrada inválida; 503 integração indisponível. Detalhes internos de SQL não são retornados. Não há retry automático de gravações nem fallback para acesso direto.

## Dependências de execução e publicação

1. Executar o backend com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `CORS_ORIGINS` conforme seu README. Este módulo não exige `SUPABASE_SERVICE_ROLE_KEY`.
2. Configurar `VITE_API_URL=http://localhost:8000/api/v1` no frontend local; usar a URL HTTPS pública da API no build de produção.
3. Publicar o backend antes do frontend. GitHub Pages hospeda somente o frontend. Configurar `VITE_API_URL` nas variáveis do repositório e permitir a origem pública em CORS.

Empresas e seletores compartilhados (`useEmpresas`, inclusive o modal de criação de acessos) dependem agora da disponibilidade do backend. Não publique o frontend apontando para localhost ou sem API pública acessível.

## Verificação

Automatizada: backend testa o SDK Supabase com transporte HTTP simulado, mantendo autenticação, autorização, service e repository reais. Cobre perfis, escopo entre empresas, campos indevidos, suspensão, erros, token, perfil inativo e RLS recusando a gravação. Frontend testa a fachada real com cliente HTTP, token, contratos, payloads e propagação de erros, sem disponibilizar `.from()` no mock.

Esses testes não executam as policies em um PostgreSQL real e não equivalem a um teste visual autenticado em produção. Antes da liberação, usar ambiente de homologação e contas autorizadas:

1. Admin: listar, cadastrar CNPJ de teste, editar e suspender; confirmar que dados relacionados permanecem.
2. Gestor/empresa: consultar e editar dados da própria empresa; tentar ID de outra empresa e mudança de status pela API, esperando 403.
3. Operacional: consulta permitida, escrita recusada.
4. Confirmar seletores de empresas e contagens, além dos toasts e atualização de cache existentes.
5. Verificar que a aba Network mostra `/api/v1/empresas` nas operações migradas e que a chave privilegiada não aparece.

Não foram criados nem suspensos registros reais durante os testes automatizados.

## Próximos módulos (ainda não migrados)

1. Edição/listagem de equipe e revisão das policies de perfis; o provisionamento já usa FastAPI.
2. Demais mutações sensíveis e permissões: catálogos e colaboradores, com escopo de empresa e revisão das policies.
3. Revalidar a existência de persistência para cálculos comerciais/propostas antes de criar endpoints; não converter telas demonstrativas em funcionalidades novas durante esta migração.
4. Documentos e numeração: `documentosService`; definir geração atômica caso aplicável, depois propostas.
5. Treinamentos e certificados: `treinamentosService`, matriz, situação e arquivos.
6. Exames ocupacionais: `examesService`, acesso e alterações de dados sensíveis.
7. Relatórios, dashboard e Storage: autorização de leitura, escopo e upload/download.

Repetir testes, typecheck, build e verificação autenticada por módulo antes de ampliar o recorte. Este documento descreve Empresas, com a atualização posterior de provisionamento indicada acima.
