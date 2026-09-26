# Administração de Usuários — endurecimento

## Entrega

O POST de criação foi preservado. Foram acrescentados GET de equipe, GET individual e PATCH de papel/situação em `/api/v1/usuarios`, mantendo route → service → repository. Listagem/edição da tela Equipe agora passam pelo FastAPI com o JWT da sessão, sem cliente privilegiado. A interface mantém o layout; edição do próprio acesso e de admin por gestor/empresa fica desabilitada também na tela. O modal atualiza sua situação com a resposta da API.

Login permanece no Supabase Auth. A Secret Key continua restrita ao provisionamento já existente (Auth + perfil e compensação). Não foram migrados outros domínios, adicionados campos editáveis ou implementados banimento/deleção de contas.

## Regras finais

| Operação | Admin | Gestor / empresa | Operacional |
|---|---|---|---|
| Listar / consultar | Todas as empresas do escopo atual de Empresas; filtro opcional | Somente própria empresa | 403 |
| Alterar role | Qualquer role existente em outro usuário | Não admin da própria empresa; destino nunca admin | 403 |
| Ativar / desativar | Outro usuário | Não admin da própria empresa | 403 |
| Alterar próprio papel/status | Proibido | Proibido | Proibido |
| Alterar nome, e-mail, empresa, senha ou ID | Fora do contrato | Fora do contrato | Fora do contrato |

Ator precisa de perfil ativo e empresa ativa em todas as chamadas. `GET /usuarios` sem filtro restringe gestor/empresa à própria organização; o filtro explícito de outra empresa recebe 403. Alvos individuais inexistentes ou fora do escopo recebem 404. Um gestor pode ver o registro de um admin da própria equipe, mas não alterá-lo.

Decisões: o escopo global de admin acompanha a leitura administrativa de Empresas e a criação/UPDATE administrativo já existentes; a nova policy de SELECT torna esse escopo utilizável para consulta de perfis. A tela continua passando seu filtro de empresa. A restrição de alteração do próprio papel/status, antes apenas visual, vale agora no servidor e no banco. A edição de um admin por gestor/empresa foi proibida para impedir desativação ou rebaixamento de administradores. Nome/e-mail não foram incluídos no PATCH porque o modal atual edita somente papel e situação.

PATCH usa `extra="forbid"`, rejeita payload vazio, nulos, papel inexistente e `active` que não seja booleano. `empresa_id` não é aceito nem para admin. Nenhuma alteração de e-mail/Auth é feita. O retorno contém somente ID, e-mail, nome, papel, empresa, situação e data de criação; sem senha, metadados Auth ou tokens.

## Migration 014

Nova: `supabase/migrations/014_fix_user_profiles_permissions.sql`. As migrations 001–013 não foram alteradas. Executa em transação e pode ser reaplicada.

| Objeto | Alteração |
|---|---|
| `profiles_insert_admin` | Removida; criação de perfil continua no provisionamento privilegiado |
| `profiles_update_admin` | Removida; era a permissão ampla da 013 |
| `profiles_select` | Recriada: próprio perfil ou escopo de administração autorizado |
| `profiles_update_managers` | Criada: `USING` verifica linha anterior, `WITH CHECK` verifica linha resultante; proíbe autoedição e admin por não admin |
| Grants de `user_profiles` | Revoga privilégios de tabela e grants históricos de INSERT/UPDATE por coluna; concede SELECT e UPDATE apenas de `role`, `active` a `authenticated` |
| `engmarq_private.can_manage_profile` | Consulta perfil/empresa do `auth.uid()` sem recursão de RLS; somente leitura, `SECURITY DEFINER`, search_path vazio |
| `engmarq_private.guard_profile_update` + trigger | Revalida ator/alvo e imutabilidade dos demais campos sob bloqueios de linha, no momento da gravação |

RLS continua habilitado. `anon`/`PUBLIC` não recebem acesso; clientes autenticados não podem inserir, fazer upsert, excluir ou truncar perfis. A role técnica `service_role` mantém seu acesso explícito de provisionamento. O schema privado não deve ser incluído nos schemas expostos do PostgREST. As funções têm nomes qualificados, search_path fixo e execução restrita; nenhuma recebe um ID de ator fornecido pelo cliente.

As verificações do banco valem também para alguém chamando PostgREST diretamente. Operações permitidas continuam possíveis com o JWT/RLS: migrar o frontend para FastAPI não torna o PostgREST inacessível, nem a segurança depende disso. A proteção combina permissões por coluna, RLS e trigger, conforme os mecanismos de [policies](https://www.postgresql.org/docs/17/sql-createpolicy.html) e [privilégios PostgreSQL](https://www.postgresql.org/docs/17/ddl-priv.html).

## Autoedição e concorrência

O último administrador não pode remover o próprio papel/status. Cada alteração autenticada mantém o ator e sua empresa bloqueados para leitura compartilhada durante a gravação, impedindo que uma permissão antiga autorize a escrita após revogação concorrente. Duas alterações cruzadas entre administradores podem gerar deadlock; a transação abortada vira 409 na API, sem repetição automática. A regra mantém um administrador atuante durante as alterações de perfis. Ela não proíbe manutenção privilegiada nem substitui as regras de suspensão de empresas, que pertencem a outro domínio.

## Suspensão e consultas diretas restantes

`active=false` bloqueia administração de usuários na API e no banco. Não revoga JWT nem bane Auth. O AuthProvider continua lendo diretamente somente o próprio perfil para a sessão e a tela de conta indisponível, com o comportamento/cache já existente. Essa leitura é permitida mesmo quando o perfil está inativo; ela não concede administração de equipe.

Inventário das chamadas de produção a `user_profiles`:

- `frontend/src/modules/auth/AuthProvider.tsx`: SELECT por ID da sessão; única consulta direta restante no frontend.
- `backend/app/repositories/profiles.py`: SELECT do ator com JWT/RLS para `CurrentProfile`.
- `backend/app/repositories/usuarios.py`: SELECT/listagem e UPDATE administrativo com JWT/RLS; INSERT de perfil usa somente o cliente privilegiado do POST existente.
- `supabase/seeds/001_first_admin.sql`: provisionamento inicial explícito, fora dos fluxos do navegador.
- Migrations/funções de autorização e testes: SQL de configuração/verificação; não são caminhos administrativos do frontend.

Busca em todos os arquivos de código do repositório confirmou zero UPDATE de `user_profiles` no frontend. O único UPDATE na aplicação está no repository de usuários. Não há fallback ao banco no `usuariosService`.

## Testes e resultados

| Verificação | Resultado |
|---|---|
| Backend `python -m pytest` | 170 testes passaram; aviso preexistente Starlette/httpx |
| Frontend `npm run test` | 47 testes passaram |
| SQL/RLS `npm --prefix supabase/tests test` | 38 testes passaram |
| Frontend `npm run typecheck` | Passou |
| Frontend `npm run build` | Passou; aviso de chunks acima de 500 kB |
| Frontend `npm run lint` | 6 erros e 18 avisos preexistentes; nenhum nos arquivos desta alteração |
| `git diff --check` | Passou |

Testes backend mantêm rotas, autenticação, services e repositories reais, simulando apenas transporte HTTP Supabase. Cobrem escopo, escalada de privilégio, ator inativo/empresa suspensa, autoedição, campos extras, alterações válidas, erros de banco e ausência de uso do cliente administrativo. Os testes de criação existentes permanecem passando.

Testes SQL usam [PGlite, PostgreSQL em WebAssembly](https://pglite.dev/docs/about), isolado em memória, com migrations reais 001, 002, 004, 005, 013 e 014. Stubs de Auth/Storage representam somente a infraestrutura gerenciada do Supabase. O teste reproduz a autopromoção da 013 antes de aplicar a correção; depois valida políticas, grants, imutabilidade, acesso entre empresas, autoedição, inserção/upsert/deleção indevidos e preservação de provisionamento. Não usa credenciais, usuários ou banco de produção. PGlite tem conexão única: os testes não exercitam concorrência real entre sessões/PostgREST.

Para repetir os testes de banco:

```sh
npm --prefix supabase/tests ci
npm --prefix supabase/tests test
```

Lint global pendente nos arquivos não alterados `Header.tsx`, `chartTheme.tsx`, `AuthProvider.tsx`, `ColaboradoresPage.tsx`, `ConfiguracoesPage.tsx` e `TreinamentosPage.tsx`. Os erros são os mesmos da entrega anterior: setState em effects, exportações incompatíveis com Fast Refresh e variável não usada. Nenhuma regra foi desabilitada.

## Publicação e pendências

1. Revisar e aplicar **somente a nova migration 014** no projeto Supabase correto, com o papel proprietário de migrations. Manter `engmarq_private` fora dos schemas expostos do PostgREST.
2. Publicar backend com as novas rotas, seguido do frontend. O frontend antigo pode continuar executando edições permitidas sob as novas restrições durante a transição, mas tentativas antes inseguras serão recusadas.
3. Homologar com contas admin, gestor/empresa, operacional, inativa e empresa suspensa, incluindo chamadas diretas a PostgREST e conflitos entre sessões.
4. Revisar registros administrativos existentes: a correção previne novas escaladas, mas não desfaz uma promoção indevida ocorrida antes de sua aplicação. Não rebaixar contas automaticamente sem auditoria.

Migration não aplicada remotamente nesta tarefa; nenhum deploy, commit ou alteração de credenciais foi realizado. A vulnerabilidade remota permanece até aplicar a 014. RLS dos outros domínios não foi alterado; a suspensão por perfil não equivale a revogação global de acesso a integrações antigas. Mantêm-se os limites já documentados do POST: Auth e banco não têm transação distribuída, e uma falha de compensação exige reconciliação explícita. O limite de linhas do PostgREST na listagem também permanece.
