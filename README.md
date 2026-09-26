# Plataforma EngMarq Solution

Plataforma de gestão SST. A aplicação React está isolada em `frontend/` e continua usando diretamente Supabase Auth, PostgreSQL e Storage.

## Estrutura

```text
frontend/   Aplicação React + TypeScript + Vite
backend/    API Python + FastAPI (saúde, Empresas e Usuários)
supabase/   Migrations, seeds e testes de RLS
.github/    Workflow de publicação do frontend
```

`Assets/` e `apresentacao-sistema-sst.html` são materiais de apresentação independentes da aplicação e permanecem na raiz.

## Executar o frontend

Use Node.js 22.12 ou superior e npm.

```sh
cd frontend
npm ci
```

Se ainda não existir `frontend/.env`, copie `frontend/.env.example` para `frontend/.env` e preencha:

```dotenv
VITE_SUPABASE_URL=<url-do-projeto>
VITE_SUPABASE_ANON_KEY=<chave-anon-do-projeto>
```

O `.env` local existente foi preservado na separação e não deve ser sobrescrito. Não coloque a chave `service_role` nas variáveis `VITE_*`: elas são incluídas no código do navegador.

```sh
npm run dev
```

Abra `http://localhost:5173/Plataforma-Engmarq-Solution/` (ou a porta indicada pelo Vite).

## Verificação e produção

Execute dentro de `frontend/`:

```sh
npm run typecheck
npm run lint
npm run build
npm run preview
```

O build é gerado em `frontend/dist/`. O preview usa normalmente `http://localhost:4173/Plataforma-Engmarq-Solution/`.

Também é possível executar da raiz, por exemplo: `npm --prefix frontend run dev` ou `npm --prefix frontend run build`.

O lint mantém as regras existentes; pendências anteriores de componentes não são corrigidas pela separação de diretórios.

## Deploy

`.github/workflows/deploy.yml` instala e compila em `frontend/`, usa `frontend/package-lock.json` para o cache e publica `frontend/dist/` na branch `gh-pages` quando há push em `main`.

Os secrets existentes `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` continuam sendo fornecidos ao build. O prefixo público `/Plataforma-Engmarq-Solution/`, o `basename` do React Router e os arquivos de suporte ao GitHub Pages foram preservados.

## Supabase e backend

Empresas e administração de Usuários usam FastAPI → service → repository → Supabase com JWT do usuário e RLS. A criação de usuários continua usando `POST /api/v1/usuarios` → Supabase Auth Admin, com autorização no servidor e criação do perfil existente. O login continua direto no Supabase Auth; os demais domínios mantêm suas integrações. A nova migration `014_fix_user_profiles_permissions.sql` corrige as permissões de perfis sem editar migrations anteriores.

Configure `SUPABASE_SECRET_KEY` exclusivamente no backend (Secret Key moderna). Nunca use prefixo `VITE_`, envie essa chave ao navegador ou faça commit dela. `backend/.env` continua ignorado pelo Git. O nome legado `SUPABASE_SERVICE_ROLE_KEY` funciona temporariamente como fallback quando a configuração principal está ausente.

Veja [contrato, compensação e limites da criação de usuários](backend/README.md#criação-de-usuários).

Antes de publicar o domínio de Usuários, aplique a migration 014. Listagem, consulta e edição usam `GET /api/v1/usuarios`, `GET /api/v1/usuarios/{user_id}` e `PATCH /api/v1/usuarios/{user_id}`; somente papel e situação são editáveis. Veja [regras, políticas, testes e publicação](docs/usuarios-seguranca.md).

O backend pode ser executado separadamente e expõe `GET /health`, `GET /api/v1/health` e `GET /api/v1/me`. Instalação, variáveis de ambiente e testes estão documentados em [backend/README.md](backend/README.md).

Empresas e seus seletores dependem agora do backend e de `VITE_API_URL`. A camada HTTP também permite testar `/me` sem alterar a interface. Consulte [frontend/README.md](frontend/README.md) para executar os dois serviços e [o registro da migração](docs/migracao-incremental.md) para permissões, limites e verificação.

O workflow de GitHub Pages continua publicando somente o frontend e recebe a URL pública da API pela variável de repositório `VITE_API_URL`.
