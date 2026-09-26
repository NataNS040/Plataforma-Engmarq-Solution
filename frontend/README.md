# EngMarq — Frontend e API

O React/Vite mantém Supabase Auth como fonte de identidade. Empresas usa FastAPI para listagem, consulta, cadastro, edição e suspensão. A criação de usuários também usa FastAPI; os demais fluxos continuam com suas integrações anteriores durante a migração incremental.

O modal existente chama `usuariosService.criarUsuario` → `services/api/usuarios` → `POST /api/v1/usuarios`, com o JWT da sessão em `Authorization: Bearer ...`. O backend valida identidade/permissão e chama Supabase Auth Admin, criando também `user_profiles`. O retorno é `{user_id}`; erros aparecem no toast, mantendo o modal aberto. Não existe fallback para Edge Function. Listagem e edição de equipe permanecem em seus caminhos anteriores.

Configure `SUPABASE_SECRET_KEY` somente no backend: nunca em variável `VITE_`, nunca no navegador e nunca em commit. O frontend precisa apenas da sessão Supabase e de `VITE_API_URL`; a chave privilegiada é responsabilidade exclusiva do servidor. Veja [regras e compensação](../backend/README.md#criação-de-usuários).

## Executar

```sh
cd frontend
npm ci
npm run dev
```

O backend deve ser executado separadamente conforme [backend/README.md](../backend/README.md).

Em `frontend/.env`, preserve as variáveis Supabase e configure:

```dotenv
VITE_API_URL=http://localhost:8000/api/v1
```

Reinicie o Vite após alterar variáveis. A URL deve ser absoluta, incluir `/api/v1` e não conter credenciais, query string ou fragmento. Empresas e seletores que usam `useEmpresas` agora precisam da API em execução e dessa variável configurada; não existe fallback direto para o banco.

No backend, configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` do **mesmo projeto** usado pelo frontend. Configure `CORS_ORIGINS` com a origem exata do Vite (protocolo, host e porta), por exemplo:

```dotenv
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

Nenhuma chave administrativa é necessária para `/me`. Nunca coloque `service_role` em variáveis `VITE_*`.

## Prova de comunicação sem mudança visual

1. Inicie o backend e o frontend em desenvolvimento.
2. Faça login normalmente pela tela existente, usando Supabase Auth.
3. Abra o console do navegador e execute:

```js
await window.engmarqApi.me()
```

A função usa a sessão existente, envia `Authorization: Bearer ...` ao FastAPI e retorna:

```json
{
  "id": "uuid-do-usuario",
  "email": "usuario@example.com",
  "full_name": "Nome do usuário",
  "role": "empresa",
  "empresa_id": "uuid-da-empresa",
  "active": true
}
```

O FastAPI valida o token no Supabase Auth, consulta o perfil pelo ID validado e verifica perfil ativo e empresa com status `ativa`. Papéis e empresa vêm do banco existente, não de parâmetros ou metadados editáveis do usuário. A resposta usa `Cache-Control: no-store`.

Confira a requisição `/api/v1/me` na aba Network. Não é necessário copiar tokens. O auxiliar não faz chamadas automáticas, não altera o login e não adiciona elementos à tela. `window.engmarqApi` existe somente em desenvolvimento e é removido do build de produção.

## Camada reutilizável

- `src/services/api/client.ts`: URL, headers, sessão Supabase atual, serialização JSON, parsing, cancelamento, timeout de 15 segundos e `ApiError`.
- `src/services/api/auth.ts`: `getMe()` e contrato de resposta validado com Zod.
- `src/services/api/devtools.ts`: auxiliar manual de desenvolvimento.

Novos serviços devem usar `apiRequest('/caminho', ...)` e validadores de resposta, sem URLs nos componentes. Somente os serviços efetivamente implementados são criados; não há módulos vazios de propostas ou treinamentos.

O cliente lê a sessão a cada chamada, aproveitando a renovação já gerenciada pelo SDK Supabase. Não armazena tokens novamente, não cria cookies de autenticação e não guarda senhas. Não repete gravações automaticamente e não faz logout nem redireciona a interface ao receber erro.

| Erro | Significado |
|---|---|
| `api_not_configured` | `VITE_API_URL` ausente |
| `401 / unauthorized` | Sessão ausente ou token recusado |
| `403 / access_denied` | Perfil ausente/inativo ou empresa ausente/não ativa |
| `503` | Integração não configurada ou indisponibilidade de Auth/banco |
| `network_error` | Falha de rede, CORS ou backend inacessível |
| `timeout` / `aborted` | Tempo excedido ou cancelamento |
| `invalid_response` | JSON ou contrato de resposta incompatível |

`ApiError` estende o `AppError` existente e contém `status`, `code`, `message` e `details`. Respostas HTML de proxies não são repassadas como mensagem ao usuário. O cliente rejeita caminhos externos à base configurada e não segue redirecionamentos HTTP com credenciais.

## Verificações

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Os testes Vitest simulam somente a sessão e as respostas de rede; não precisam de credenciais reais. O typecheck também inclui os testes. As regras de lint existentes permanecem configuradas.

## Produção

Configure a variável de repositório GitHub `VITE_API_URL` com a URL HTTPS pública do backend, incluindo `/api/v1`. O workflow injeta essa variável no build. Configure no backend a origem pública do frontend, sem o caminho do repositório. O workflow continua publicando apenas o frontend; não publica o FastAPI.
