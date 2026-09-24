# EngMarq — Backend

API em Python 3.11+, FastAPI e Pydantic 2. O módulo Empresas foi migrado para route → service → repository, com Supabase Auth e RLS. Os demais domínios permanecem nas integrações anteriores. Nenhuma migration foi alterada.

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
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional; sem padrão | Apenas operações administrativas explícitas no servidor |

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

`create_admin_client` é uma fábrica separada, sem associação a endpoints, que exige a chave administrativa. Ela pode contornar RLS e só deve ser usada depois de autorização explícita no servidor. O código que chamar essa fábrica deve gerenciar o contexto `httpx.Client` e seu fechamento.

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

A prova manual pelo navegador está em [frontend/README.md](../frontend/README.md): após login normal no frontend de desenvolvimento, execute `await window.engmarqApi.me()` no console. Use o mesmo projeto Supabase nos dois serviços e inclua a origem do Vite em `CORS_ORIGINS`. Nenhuma senha passa pela API.

Referências: [configuração FastAPI](https://fastapi.tiangolo.com/advanced/settings/), [CORS](https://fastapi.tiangolo.com/tutorial/cors/), [cliente Supabase Python](https://supabase.com/docs/reference/python/initializing) e [verificação de usuário](https://supabase.com/docs/reference/python/auth-getuser).
