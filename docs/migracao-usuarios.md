# Migração de criação de usuários — verificação

Implementado `POST /api/v1/usuarios`, com resposta 201 `{user_id}`. A interface preserva campos, seleção de papéis/empresa, callbacks de sucesso e feedback por toast. Login continua no Supabase Auth. Listagem/edição de equipe e outros módulos não foram migrados.

## Autorização e consistência

JWT validado remotamente no Supabase Auth; perfil e empresa do solicitante consultados com anon key + JWT/RLS. Perfil e empresa precisam estar ativos. `admin` cria qualquer papel; `gestor` e `empresa` só criam não administradores na própria empresa. O cliente privilegiado é aberto pelo service depois dessas verificações.

Auth recebe e-mail, senha e confirmação de e-mail. A tabela existente `user_profiles` recebe ID, e-mail, nome, papel, empresa e situação ativa. Erro ao inserir perfil provoca exclusão compensatória do Auth. Erro na compensação gera resposta explícita e log apenas do ID para reconciliação, sem senha ou tokens.

## Verificações realizadas

| Comando | Resultado |
|---|---|
| Backend: `python -m pytest` | 115 passaram; aviso de depreciação Starlette/httpx |
| Frontend: `npm run test` | 38 passaram |
| Frontend: `npm run typecheck` | Passou |
| Frontend: `npm run lint` | 6 erros e 18 avisos em arquivos não alterados nesta migração |
| ESLint nos quatro arquivos TypeScript alterados/criados | Passou |
| Frontend: `npm run build` | Passou; aviso de chunks acima de 500 kB e tempo de plugin |
| `git diff --check` | Passou |
| `git check-ignore backend/.env` | Confirmado como ignorado |

Testes usam Supabase simulado por transporte HTTP; nenhum usuário real foi criado. Cobrem JWT ausente/inválido, perfis sem permissão/inativos, empresa suspensa, escopo entre empresas, tentativa de criar admin, validações, papéis autorizados, erros do Auth, conflito de e-mail, ausência de vazamento, compensação e falha da compensação, timeouts sem repetição, chave moderna com precedência e fallback legado. Frontend testa a fachada/cliente HTTP reais com sessão e fetch simulados, sem disponibilizar Edge Functions no mock.

## Pendências e limites

- Configurar a chave administrativa no ambiente do backend e publicar backend antes do frontend. Nenhuma configuração secreta local foi lida ou modificada.
- Uma função antiga já implantada remotamente não é removida ao apagar seu arquivo local. Desativar a implantação anterior após atualizar os clientes; não foi realizado deploy remoto nesta tarefa.
- A policy da migration 013 permite edição direta de perfis por gestor/empresa sem restringir promoção a administrador no banco. Essa vulnerabilidade preexistente afeta a confiabilidade global das roles; a proteção da nova rota não fecha esse caminho. Revisar policies/permissões de coluna em seguida.
- Não há transação distribuída entre Auth e PostgREST. Queda de processo ou resposta perdida na criação do Auth pode exigir reconciliação manual; não repetir criação cegamente.
- Testes simulados não executam policies em PostgreSQL real nem substituem homologação autenticada no navegador. Lint global continua pendente pelos erros preexistentes.

## Arquivos e busca final

O inventário abaixo cobre arquivos versionados e novos não ignorados, incluindo fontes, documentação e exemplos. Exclui este próprio relatório para evitar autorreferência. Dependências, builds, histórico Git e arquivos locais ignorados não fazem parte do código-fonte auditado; valores de ambientes secretos não foram inspecionados.

Os dois termos da integração removida não têm ocorrências no código-fonte restante: `create-user` e `functions.invoke`. Neste relatório aparecem apenas para documentar a remoção/busca.

Referências restantes às variáveis administrativas são intencionais: configuração/exemplo e instruções de segurança; fallback legado documentado; isolamento de ambiente e teste de mascaramento. Os atributos Python correspondentes também permanecem em minúsculas nas fábricas, settings e testes.

### Referencias exatas (arquivo:linha)
- `create-user`: 0
- `functions.invoke`: 0
- `SUPABASE_SERVICE_ROLE_KEY`: `README.md:67`, `backend/.env.example:14`, `backend/README.md:53`, `backend/tests/conftest.py:12`, `backend/tests/test_config.py:11`, `docs/migracao-incremental.md:40`
- `SUPABASE_SECRET_KEY`: `README.md:67`, `backend/.env.example:11`, `backend/.env.example:13`, `backend/README.md:52`, `backend/README.md:93`, `backend/tests/conftest.py:12`, `backend/tests/test_config.py:12`, `frontend/README.md:7`

### Inventario de arquivos

`M`: alterado; `??`: criado; `D`: removido.

```text
 M README.md
 M backend/.env.example
 M backend/README.md
 M backend/app/api/router.py
 M backend/app/core/config.py
 M backend/app/integrations/supabase.py
 M backend/pyproject.toml
 M backend/tests/conftest.py
 M backend/tests/test_config.py
 M backend/tests/test_health.py
 M backend/tests/test_security.py
 M docs/migracao-incremental.md
 M frontend/README.md
 M frontend/src/modules/configuracoes/CriarUsuarioModal.tsx
 M frontend/src/services/usuariosService.ts
 D supabase/functions/create-user/index.ts
?? backend/app/api/routes/usuarios.py
?? backend/app/repositories/usuarios.py
?? backend/app/schemas/usuarios.py
?? backend/app/services/usuarios_service.py
?? backend/tests/test_usuarios.py
?? docs/migracao-usuarios.md
?? frontend/src/services/api/usuarios.ts
?? frontend/tests/usuarios.test.ts
```
