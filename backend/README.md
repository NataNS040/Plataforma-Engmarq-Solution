# EngMarq — Backend

API em Python 3.11+, FastAPI e Pydantic 2. Empresas e administração de usuários usam route → service → repository, com Supabase Auth. Listagem, consulta e edição respeitam RLS; o provisionamento usa Auth Admin após autorização. Os demais domínios permanecem nas integrações anteriores. A migration 014 é nova; nenhuma migration anterior foi alterada.

## Executar localmente

PowerShell, a partir da raiz do repositório:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env # somente se .env ainda não existir
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Em Linux/macOS, substitua `.\.venv\Scripts\python.exe` por `.venv/bin/python` e use `cp .env.example .env` para a cópia inicial.

Para instalação sem ferramentas de teste: `python -m pip install .`, usando o Python do ambiente virtual. Não use `--reload` em produção.

## Endpoints implementados

| Método | Caminho | Resposta |
|---|---|---|
| GET | `/health` | `{"status":"ok"}` |
| GET | `/api/v1/health` | `{"status":"ok"}` |
| GET | `/api/v1/me` | Perfil do usuário autenticado e autorizado |
| GET | `/api/v1/empresas` | Empresas visíveis e contagem de colaboradores |
| GET | `/api/v1/empresas/{id}` | Empresa autorizada |
| POST | `/api/v1/empresas` | Cadastro por administrador (201) |
| PATCH | `/api/v1/empresas/{id}` | Edição parcial; status reservado ao administrador |
| POST | `/api/v1/usuarios` | Criação de Auth e perfil (201) |
| GET | `/api/v1/usuarios?empresa_id=UUID` | Equipe no escopo autorizado; filtro opcional |
| GET | `/api/v1/usuarios/{user_id}` | Perfil no escopo autorizado |
| PATCH | `/api/v1/usuarios/{user_id}` | Papel e/ou situação ativa; retorna perfil atualizado |

Os dois endpoints de saúde são públicos e usam a mesma implementação. São verificações de **liveness**: confirmam que a API responde, sem consultar banco, Auth ou Storage. Não indicam disponibilidade do Supabase.

`/api/v1/me` exige Bearer token, valida a identidade no Supabase Auth e consulta `user_profiles` pelo ID validado. Exige perfil ativo e empresa vinculada com status `ativa`; perfil ausente/inativo ou empresa ausente/não ativa retornam `403`. A verificação usa o JWT do usuário e RLS, sem `service_role`, novas tabelas ou duplicação de usuários. Retorna `id`, `email`, `full_name`, `role`, `empresa_id` e `active`; o e-mail vem do Auth e o restante do perfil existente. A resposta não pode ser armazenada em cache.

- Swagger UI: `http://localhost:8000/docs`
- OpenAPI: `http://localhost:8000/openapi.json`
- As próximas rotas de negócio devem ser incluídas em `app/api/router.py`, sob `/api/v1`.

## Variáveis de ambiente

A configuração lê exclusivamente `backend/.env`, com caminho ancorado no código; não lê o `.env` do frontend. Variáveis do processo têm precedência. Configuração inválida impede a inicialização. O arquivo `.env` é opcional para executar os endpoints de saúde.

| Variável | Obrigatoriedade / padrão | Uso |
|---|---|---|
| `CORS_ORIGINS` | Opcional; `[]` | Lista JSON de origens HTTP(S) explícitas |
| `SUPABASE_URL` | Obrigatória junto com a chave anon para usar a integração | URL do projeto; HTTPS, exceto Supabase local |
| `SUPABASE_ANON_KEY` | Obrigatória junto com a URL para usar a integração | Chave anon/publishable do projeto; usada junto ao JWT do usuário |
| `SUPABASE_TIMEOUT_SECONDS` | Opcional; `10`, maior que zero e até 60 | Timeout de rede do cliente por requisição |
| `SUPABASE_SECRET_KEY` | Necessária para provisionar usuários, salvo fallback legado | Secret Key moderna, exclusivamente no backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Fallback temporário | Usada somente se a configuração principal estiver ausente |

Exemplo de CORS:

```dotenv
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

Se o Vite usar outra porta, inclua a origem correspondente. Em produção, configure a origem pública do frontend, por exemplo `https://natans040.github.io`, sem o caminho `/Plataforma-Engmarq-Solution/`. Wildcards, credenciais e caminhos na origem são rejeitados. A API aceita o header `Authorization`; cookies cross-origin não estão habilitados. CORS não substitui autenticação ou autorização.

Nenhuma chave real acompanha o repositório. As chaves usam `SecretStr` e não aparecem nas representações padrão da configuração. `.env`, variantes de ambiente e `.venv` são ignorados pelo Git. Nunca coloque a `service_role` em `frontend/`, em variáveis `VITE_*`, em respostas HTTP ou logs.

## Autenticação e Supabase

`CurrentUser`, em `app/core/dependencies.py`, é a dependência preparada para futuras rotas autenticadas. Ela exige `Authorization: Bearer <access_token>` e verifica o token com `supabase.auth.get_user(token)` no servidor. Não confia em JWT apenas decodificado nem em dados de sessão enviados pelo cliente.

- Token ausente, inválido ou expirado: `401`, com `WWW-Authenticate: Bearer`.
- Integração sem configuração ou Auth indisponível: `503`.
- `CurrentUser` retorna a identidade verificada (ID e e-mail).
- `CurrentProfile` acrescenta a autorização básica de acesso à plataforma (perfil e empresa ativos), usada por `/me`. Permissões específicas de futuras operações devem ser verificadas adicionalmente; `/me` pode ser consultado pelos quatro papéis existentes.
- Empresas usa `CurrentProfile` e verifica papel/escopo no service antes de consultar ou gravar com RLS. Veja [permissões, limites e plano de migração](../docs/migracao-incremental.md).

`get_supabase_client` fornece um cliente exclusivo da requisição, com chave anon e JWT do usuário. O SDK disponibiliza PostgreSQL via Data API/PostgREST (`client.table(...)`), Auth e Storage. As políticas RLS continuam se aplicando ao contexto do usuário. Não há conexão SQL privilegiada ou ORM nesta fundação.

Os clientes não persistem sessões nem renovam tokens automaticamente. O cliente HTTP é fechado ao final da requisição. Dependências síncronas usam o thread pool do FastAPI; operações síncronas do SDK em futuras rotas devem permanecer em código síncrono ou ser explicitamente deslocadas para uma thread.

`create_admin_client` é uma fábrica separada, nunca uma dependência padrão de rotas. O service de usuários a abre somente após autorização. Ela exige a chave administrativa e pode contornar RLS. O service gerencia o contexto `httpx.Client` e seu fechamento.

## Criação de usuários

Fluxo: React → FastAPI → Supabase Auth Admin → `user_profiles`. O SDK `supabase>=2.31,<3` aceita a Secret Key moderna diretamente; os testes exercitam a versão 2.31.0 com transporte HTTP simulado. Referência: [Supabase Auth Admin Python](https://supabase.com/docs/reference/python/admin-api).

`POST /api/v1/usuarios` exige `Authorization: Bearer <JWT>`. `CurrentProfile` verifica o JWT no Auth e consulta perfil/empresa com anon key + JWT/RLS. Perfil e empresa do solicitante precisam estar ativos. O service preserva as regras existentes: `admin` cria os quatro papéis em qualquer empresa existente; `gestor`/`empresa` criam apenas não administradores na própria empresa; `operacional` recebe 403. Não usa metadados fornecidos pelo navegador como autorização.

Payload: `email`, `password`, `full_name`, `role`, `empresa_id`. E-mail e nome são aparados; e-mail fica em minúsculas. Pydantic valida e-mail, nome não vazio, senha com no mínimo oito caracteres, UUID, os papéis existentes (`admin`, `gestor`, `operacional`, `empresa`) e rejeita campos extras. Confirmação de senha permanece no formulário. O Auth recebe `email_confirm=true`; o perfil recebe ID do Auth, e-mail, nome, papel, empresa e `active=true`. Não há senha na tabela de perfis, logs ou respostas.

Sucesso: 201, `{"user_id":"UUID"}`, `Cache-Control: no-store`. Ausência/token inválido: 401; permissão: 403; entrada inválida: 422; e-mail já cadastrado: 409; rejeição adicional pelo Auth: 400; integração ausente/indisponível: 503. Erros do SDK são sanitizados.

Se inserir o perfil falhar, o service exclui o Auth recém-criado; a FK existente remove eventual perfil por cascata. Se a exclusão também falhar, retorna 500 com `user_rollback_failed` e registra apenas o ID para reconciliação administrativa. Auth e banco não constituem uma transação distribuída: queda do processo ou timeout na criação do Auth pode deixar resultado indeterminado. Não há repetição automática; confira Auth/perfil antes de tentar novamente. Se necessário, remova manualmente o acesso incompleto identificado nos logs.

`SUPABASE_SECRET_KEY` existe **somente no backend**, nunca usa prefixo `VITE_`, nunca deve ser commitada e nunca pode ser enviada ao navegador. Configure no ambiente do servidor ou em `backend/.env` (ignorado pelo Git). O fallback legado é temporário; novas instalações devem usar a configuração principal.

Publicação: configure a chave e publique primeiro o backend, depois o frontend com `VITE_API_URL` e CORS corretos. A função antiga foi retirada do repositório após eliminar seu único consumidor. Uma implantação remota anterior não é apagada por essa remoção; desative-a após atualizar os clientes. Nenhum usuário real foi criado pelos testes.

## Administração de usuários

Aplique `supabase/migrations/014_fix_user_profiles_permissions.sql` antes de publicar estas rotas. Ela substitui as policies inseguras da 013, restringe grants e adiciona verificação no banco. A existência do arquivo não corrige uma implantação remota até sua aplicação.

GET/listagem e PATCH usam `CurrentProfile` e `UsuariosRlsRepository` com **anon key + JWT**; nenhuma chave administrativa é necessária. Admin administra usuários das empresas visíveis no modelo de Empresas (todas atualmente). Gestor/empresa ficam na própria empresa e nunca editam administradores nem atribuem `admin`. Operacional recebe 403. Um ID inexistente ou fora do escopo retorna 404, sem revelar outra empresa. Um filtro de empresa fora do escopo retorna 403. A listagem mantém ordenação por nome e filtro da tela atual; o limite de linhas do PostgREST continua aplicável.

PATCH aceita exclusivamente `role` e `active` (`extra="forbid"`), exige pelo menos um campo e rejeita nulos, papel inválido, booleanos coercíveis e campos extras com 422. Nome, e-mail, empresa e senha não são editáveis na interface atual. Todos os perfis, inclusive admin, ficam impedidos de editar o próprio papel/status, preservando a proteção existente na tela. Gestor/empresa podem visualizar administradores da própria equipe, mas não alterá-los. O banco revalida ator/alvo na gravação, inclusive sob mudanças concorrentes; conflitos de transação retornam 409, sem repetição automática.

`active=false` continua significando bloqueio pelo perfil, não banimento nem remoção no Supabase Auth. A API verifica perfil/empresa em cada chamada. O login e a consulta do próprio perfil pelo AuthProvider continuam no Supabase; o cache da interface pode demorar a refletir uma suspensão, mas não autoriza chamadas administrativas na API/banco.

Respostas de perfil contêm apenas `id`, `email`, `full_name`, `role`, `empresa_id`, `active`, `created_at`. Sucesso usa `Cache-Control: no-store`. Erros internos do PostgREST são sanitizados. Veja [migration, decisões, testes SQL e limites](../docs/usuarios-seguranca.md).

## Erros

Erros de aplicação, HTTP, validação e falhas inesperadas usam o envelope:

```json
{"error":{"code":"unauthorized","message":"Token Bearer obrigatório.","details":[]}}
```

Validações retornam `422` com campo e código em `details`, sem repetir valores recebidos. Falhas inesperadas retornam `500` com mensagem genérica; não enviam stack trace ou a mensagem original. Rejeições de preflight CORS seguem o comportamento do middleware, antes das rotas.

Use `AppError` somente com mensagens seguras para o usuário. Não repasse mensagens brutas do banco, SDK ou credenciais.

## Organização

```text
app/main.py                 Factory e instância da aplicação
app/api/router.py           Prefixo /api/v1
app/api/routes/health.py     Endpoints de saúde
app/api/routes/me.py         Identidade e perfil autorizados
app/api/routes/empresas.py   Contrato HTTP de Empresas
app/core/                   Configuração, segurança, DI e erros
app/schemas/                Contratos Pydantic
app/integrations/supabase.py Fábricas de clientes Supabase
app/services/profiles.py     Autorização de acesso ao próprio perfil
app/repositories/profiles.py Leitura do perfil e empresa com RLS
app/services/empresas.py     Escopo, permissões e regras de Empresas
app/repositories/empresas.py Persistência com JWT do usuário e RLS
tests/                      Testes isolados, sem banco real
```

## Testes

Dentro de `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m pip check
```

Os testes cobrem saúde, `/me`, OpenAPI, CORS, configuração, envelopes de erro, autenticação e contexto do usuário no PostgREST. Verificam token inválido, perfil inativo/ausente, empresa suspensa/pendente, falha do banco e tentativa de consultar outra identidade. Chamadas ao Supabase são simuladas com transporte HTTP em memória: os testes não precisam de secrets e não acessam nem modificam o projeto real.

A prova manual pelo navegador está em [frontend/README.md](../frontend/README.md): após login normal no frontend de desenvolvimento, execute `await window.engmarqApi.me()` no console. Use o mesmo projeto Supabase nos dois serviços e inclua a origem do Vite em `CORS_ORIGINS`. O login permanece no Supabase; apenas o provisionamento administrativo envia a senha inicial ao backend, via HTTPS em produção.

Referências: [configuração FastAPI](https://fastapi.tiangolo.com/advanced/settings/), [CORS](https://fastapi.tiangolo.com/tutorial/cors/), [cliente Supabase Python](https://supabase.com/docs/reference/python/initializing) e [verificação de usuário](https://supabase.com/docs/reference/python/auth-getuser).
