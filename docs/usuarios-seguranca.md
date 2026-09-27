# Usuários: administração exclusiva da própria empresa

## Correção da regra funcional

Antes, o papel `admin` podia criar usuários com qualquer papel e empresa, listar equipes de todos os tenants e editar outros administradores. O modal permitia escolher uma empresa para criar acesso. A migration 014 corrigia escalada de privilégio e protegia colunas, mas mantinha essa autorização global, incompatível com a regra de negócio esclarecida.

Agora, `admin` representa a administração global da EngMarq e administra **Empresas**, sem acesso funcional a POST/GET/PATCH de Usuários (403). A consulta do próprio perfil para autenticação continua permitida; isso não é administração de equipe. Não foi criada uma nova role `superadmin`.

| Ator | Criar / listar / consultar / editar usuários |
|---|---|
| admin | Proibido, inclusive na própria empresa |
| empresa / gestor ativos, empresa ativa | Somente usuários da própria empresa |
| operacional, perfil inativo ou empresa não ativa | Proibido |

Foram preservadas as permissões preexistentes de `gestor` e `empresa` dentro da própria organização. Ambos podem atribuir `gestor`, `empresa` e `operacional`. Não podem criar/atribuir `admin`, editar um admin existente, alterar o próprio papel/situação nem transferir um usuário de empresa. Perfis admin já existentes na própria empresa podem ser lidos por gestores, como na 014, mas não administrados. Nenhuma role de usuário real foi alterada.

## Mapeamento e contrato

- `ConfiguracoesPage.tsx`: removidos aba, contagem e ações de equipe do admin; mantida a área de Empresas. Empresa/gestor continuam com Equipe e acessos. Operacional não recebe essa aba.
- `CriarUsuarioModal.tsx`: sem consulta ou seletor de empresas; sem papel global.
- `EditarUsuarioModal.tsx`: só gestores do mesmo tenant; bloqueia autoedição e admin; não oferece promoção global.
- `usuariosService` / API: POST e GET não enviam empresa escolhida pelo cliente. Hooks só habilitam leitura para empresa/gestor ativos e mantêm chave de cache por tenant.
- Rotas: POST, GET de lista, GET por ID e PATCH continuam nos mesmos caminhos.
- `CurrentProfile`: valida JWT no Auth, carrega perfil por ID autenticado e exige perfil e empresa ativos; mantido.
- Service: autoriza somente empresa/gestor. Repository de leitura/escrita exige escopo, usa anon key + JWT/RLS e revalida empresa/role no UPDATE.

POST recebe somente `email`, `password`, `full_name` e `role`. Qualquer `empresa_id` no corpo, inclusive o próprio, é rejeitado com 422 por `extra="forbid"`. O service passa `actor.empresa_id` separadamente ao repository de provisionamento. Metadados do Auth ou valores do navegador não determinam o tenant.

O filtro opcional legado `GET /usuarios?empresa_id=...` ainda é aceito pelo backend somente se coincidir com o tenant do ator. Outra empresa recebe 403; sem filtro, o tenant é sempre implícito. IDs de outro tenant retornam 404. PATCH aceita apenas `role` e `active`.

Criação mantém React → FastAPI → Supabase Auth Admin → user_profiles, com Secret Key somente no backend, precedência sobre fallback legado e compensação: falha no perfil exclui o Auth recém-criado; falha na compensação exige reconciliação pelo ID, sem registrar senha/chaves. O provisionamento técnico continua privilegiado, mas não concede permissão funcional a admin. Erros de transporte não provocam repetição automática.

## Primeiro acesso: pendência de negócio, sem implementação

O cadastro atual é `EmpresasPage/NovaEmpresaModal` → `useCriarEmpresa` → serviço/API de Empresas → `EmpresasService.create` → INSERT em `public.empresas`, com JWT/RLS do admin.

O formulário solicita razão social, CNPJ, setor, cidade, UF, nome do responsável e e-mail; telefone é opcional. A API também comporta status (padrão ativa) e logo. `responsavel` e `email` são dados cadastrais, sem criação de identidade nem vínculo automático com um gestor.

Relações existentes:

- `public.empresas.id`: empresa cadastrada.
- `auth.users.id`: identidade de login.
- `public.user_profiles.id`: FK para Auth, com ON DELETE CASCADE.
- `user_profiles.empresa_id`: FK obrigatória para empresas; contém também role e active.

Não existe criação automática de usuário inicial, convite ou definição de senha no cadastro de empresa. Antes, o admin podia usar separadamente o modal Criar acesso, selecionar a empresa e atribuir papel empresa — fluxo que esta correção remove. O seed `001_first_admin.sql` documenta criação manual da identidade no painel e inserção do primeiro admin da plataforma; não define onboarding de empresas clientes. A pasta de Edge Functions está vazia no checkout.

**Novas empresas continuam podendo ser cadastradas, mas não há um primeiro acesso funcional definido sob a nova regra.** Não foi implementado um substituto nem alterado o cadastro de Empresas.

Alternativas a decidir pelo responsável do produto, antes de implementar essa parte:

1. Convite único ao responsável vinculado ao cadastro da empresa, com ativação/definição de senha pelo destinatário e sem gestão posterior da equipe pelo admin global.
2. Provisionamento técnico de onboarding separado dos endpoints funcionais, com verificação do responsável, controle de acesso e registro da operação.

Também devem ser definidos papel inicial (empresa ou gestor), comprovação do responsável, reenvio/expiração do convite e recuperação quando não houver gestor ativo. Nenhuma dessas decisões foi presumida.

## Migration 015 e compatibilidade com o banco homologado

Nova migration: `supabase/migrations/015_user_profiles_tenant_management.sql`. A 014 e todas as migrations anteriores permanecem intactas.

A 015 depende da 014 e substitui apenas as funções existentes:

- `can_manage_profile(uuid, public.user_role)`: elimina a autorização global de admin, exige empresa/gestor ativo na empresa ativa e igualdade do tenant.
- `guard_profile_update()`: recusa admin como ator, preservando bloqueios de linha do ator/empresa, imutabilidade das outras colunas, proibição de autoedição, de troca de tenant e de promoção/alteração de admin.

Preserva as policies `profiles_select` e `profiles_update_managers`, RLS habilitado, trigger BEFORE UPDATE, SECURITY DEFINER com search_path vazio e grants da 014: SELECT + UPDATE somente role/active para authenticated; sem INSERT/DELETE/TRUNCATE. Reafirma restrições de execução das funções. Não muda grants de service_role, tabelas, dados ou policies de Empresas/outros módulos.

A compatibilidade foi revisada contra a auditoria SQL do projeto real fornecida pelo usuário nesta sessão: assinaturas, colunas, policies, grants e trigger correspondem às dependências da 015. **A 015 ainda não foi aplicada nem homologada no banco remoto nesta tarefa.** Não há CLI autenticado/linkado ou conexão SQL disponível neste ambiente.

## Verificação

- Backend: 181 testes passaram, incluindo autorização dos quatro endpoints, tenant forjado, atribuição global, isolamento, JWT, rollback e manutenção do CRUD de Empresas pelo admin.
- Frontend: 55 testes passaram, incluindo contrato sem empresa_id e renderização das telas/modais por papel.
- Typecheck e build: passaram; build mantém aviso de chunk grande.
- SQL/RLS: 42 testes passaram com PostgreSQL/PGlite em memória, aplicando migrations reais e shims de infraestrutura Auth/Storage. Prova que admin continua administrando Empresas, não administra equipes, não contorna o trigger mesmo com policy permissiva de teste, gestores ficam no tenant e service_role mantém provisionamento.
- Testes SQL usam dados sintéticos apenas no banco isolado, sem credenciais nem dados de produção.
- Nenhum teste real de criação, ativação, suspensão ou exclusão de usuário foi executado.
- Limites: PGlite tem uma conexão; concorrência real entre sessões e provisionamento ponta a ponta no Supabase não foram exercitados nesta etapa.

Comandos:

```sh
cd backend
python -m pytest
cd ../frontend
npm run test
npm run typecheck
npm run build
cd ../supabase/tests
npm test
```

## Publicação

1. Aplicar somente a nova 015 no projeto correto, após confirmar a 014. Não reaplicar a 014 depois da 015, pois isso restauraria as funções anteriores.
2. Publicar backend e frontend coordenadamente: o contrato novo rejeita empresa_id que clientes antigos enviavam.
3. Conferir os metadados do banco e as restrições funcionais após a aplicação. Manter engmarq_private fora dos schemas expostos.
4. Se houver uma antiga Edge Function de criação ainda implantada, desativá-la/verificar sua autorização: excluir seu código do Git não remove a implantação remota. Não foi possível inspecionar funções remotas nesta tarefa.
5. Definir o primeiro acesso antes de cadastrar novos clientes que precisem entrar na plataforma.

Nenhum commit, deploy, reset, mudança de .env ou alteração de dados reais foi realizado. A mudança não migra outros módulos.

## Arquivos alterados nesta entrega

- `README.md`
- `backend/README.md`
- `backend/app/repositories/usuarios.py`
- `backend/app/schemas/usuarios.py`
- `backend/app/services/usuarios_service.py`
- `backend/tests/test_usuarios.py`
- `backend/tests/test_usuarios_admin.py`
- `docs/usuarios-seguranca.md`
- `frontend/README.md`
- `frontend/src/hooks/queries/useUsuarios.ts`
- `frontend/src/hooks/useCurrentProfile.ts`
- `frontend/src/modules/configuracoes/ConfiguracoesPage.tsx`
- `frontend/src/modules/configuracoes/CriarUsuarioModal.tsx`
- `frontend/src/modules/configuracoes/EditarUsuarioModal.tsx`
- `frontend/src/services/api/usuarios.ts`
- `frontend/src/services/usuariosService.ts`
- `frontend/tests/usuarios-ui.test.tsx`
- `frontend/tests/usuarios.test.ts`
- `frontend/vitest.config.ts`
- `supabase/migrations/015_user_profiles_tenant_management.sql`
- `supabase/tests/user_profiles.test.mjs`
