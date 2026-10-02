# Preflight remoto 021 — análise e ajuste local

Resultado recebido: 27 BLOQUEIOS e 5 ATENÇÕES. Nenhum comando remoto, push ou avanço para Exames/ASO foi realizado.

## Causas e classificação dos 27 bloqueios

Categorias: A defeito atual; B legado a corrigir; C impedimento real de permissão; D limitação do preflight; E consequência de outra causa.

| Bloqueios | Quantidade | Categoria e causa |
|---|---:|---|
| Auditor: SELECT integral | 1 | E: pelo menos `public.fichas_epi` e `public.fichas_epi_itens` não são encontradas. O gate exige todas as 16 relações. Podem existir outros impedimentos; o resultado antigo não os identifica. |
| Métricas indisponíveis | 14 | E/D: o gate global falso retorna `<table/>` em vez de executar `query_to_xml`; `xpath` retorna NULL para todas as métricas. Não houve contagem divergente nem erro de execução dessa consulta de inventário. |
| RLS das duas tabelas EPI | 2 | A/D: pré-requisito ausente em `public`, não RLS desligado comprovado. A expressão antiga só imprime `ausente` quando não encontra a relação; RLS desligado imprimiria `false`. |
| Ownership das duas tabelas EPI | 2 | E/D: sem relação, não há `relowner`; `pg_has_role(...,NULL,...)` não aprova. Não comprova que um owner existente negou autoridade ao SQL Editor. |
| Quatro policies EPI | 4 | E: as relações `public` ausentes não podem ter essas policies no catálogo. O LEFT JOIN transforma ausência em ` | `. Não comprova policies abertas. |
| Duas policies assinaturas | 2 | A ou B, ainda sem prova suficiente: ` | ` pode representar policy ausente ou existente sem expressões. O CSV não permite distinguir. Não é bloqueio de ownership de Storage: a capacidade de CREATE/DROP POLICY passou. |
| Duas funções de Users | 2 | A ou D, ainda sem prova suficiente: as funções existem, mas o check agrega tipo, SECURITY DEFINER, volatilidade, search_path, hash do corpo, owner e ACL. O CSV não identifica qual predicado divergiu. Não modificar Users sem esse diagnóstico. |
| **Total** | **27** | Não são 27 defeitos independentes. |

As 14 métricas em cascata são: Documentos preservados; Legacy references; Canonical references; Pending backfill; Objetos preservados; MIME incompatível; Tamanho inválido; Arquivo_path inválido/objeto ausente; Legacy URL inválida/objeto ausente; Documentos vinculados a colaborador estrangeiro; EPI colaborador de outro tenant; EPI item de outro tenant; Assinaturas bucket privado; Bucket documentos privado/10 MB/7 MIME. Todos permanecem bloqueados quando indisponíveis. Indisponibilidade não significa perda de dados.

## EPI: origem e autoridade

A migration 011 cria as duas tabelas, habilita RLS e cria as quatro policies; usa nomes sem qualificação de schema. Sua não aplicação, aplicação em outro schema ou remoção posterior são hipóteses, não fatos demonstrados pelo CSV. O novo inventário procura os nomes em todos os schemas e mostra search_path e identidade da sessão.

Não existe owner observado para essas relações em public. O owner esperado é o papel que efetivamente criou a relação (ou recebeu ownership depois), não um nome fixo dedutível do arquivo SQL. A sessão deve ser superuser ou ter autoridade efetiva do owner para ALTER TABLE, constraints, ACLs e policies EPI. SELECT não concede essa autoridade. Não há transferência de ownership na 021.

A 021 pressupõe o módulo EPI existente e RLS habilitado: não recria a 011. Ela adiciona FKs compostas para tenant, ajusta ACLs e adiciona policies RESTRICTIVE. Preserva as policies permissivas legadas e limita sua autorização com guards restritivos; não substitui automaticamente uma permissive policy ausente. Agora aborta com mensagem explícita de relações obrigatórias ausentes antes dos locks e de qualquer DDL.

## Storage assinaturas

O resultado aponta owner `supabase_storage_admin` e autoriza policies para `postgres` via `supautils.policy_grants`, incluindo `storage.objects`. Essa é a capacidade já usada na 020. A 021 usa apenas CREATE/DROP POLICY em Storage, sem ALTER TABLE nem mudança de owner.

As guards RESTRICTIVE da 021 restringem SELECT/INSERT ao tenant ativo e bloqueiam UPDATE/DELETE de assinaturas. Elas não fornecem uma autorização permissiva por si sós: se as duas policies permissivas esperadas não existem, as guards não as recriam e não garantem o fluxo funcional. Se existe uma policy sem predicado, ela pode ser aberta, dependendo de cmd/roles e dos outros guards; o diagnóstico novo informa presença, cmd, roles, permissividade e NULL explicitamente. Não afrouxamos esse pré-requisito.

Referências: [supautils policy_grants](https://github.com/supabase/supautils/blob/master/README.md), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [PostgreSQL pg_policies](https://www.postgresql.org/docs/current/view-pg-policies.html).

## Users e B05

O catálogo local esperado vem da 015: can_manage_profile autoriza apenas gestor/empresa ativos na própria empresa ativa, excluindo target admin; guard_profile_update impede mudanças de id/empresa e campos além de role/active e impede atingir admin. Os checks permanecem estritos. A definição remota e os atributos divergentes precisam do diagnóstico novo; as linhas recebidas mostram somente a assinatura existente.

B05 trata escrita de status na tabela empresas e é corrigido pela guard_empresa_write e pelos privilégios de coluna na 021. Essas duas funções de profiles não escrevem empresas no código esperado. Seus bloqueios não demonstram uma causa de B05 nem autorizam alterar Users. A 021 não modifica essas funções.

## Arquivos alterados nesta tarefa

- supabase/migrations/021_documentos_empresas_security.sql: diagnóstico antecipado de relações obrigatórias ausentes.
- supabase/tests/021_security_preflight_readonly.sql: causas de SELECT integral por relação, identidade da sessão, catálogo EPI em todos os schemas, owner ou relation_missing, presença real das policies e atributos/ACL/hash das funções.
- supabase/tests/021_security_postflight_readonly.sql: diagnósticos equivalentes, preservando aprovação estrita.
- supabase/tests/remediation.test.mjs: regressões de EPI ausente, policy assinaturas ausente e divergência de corpo de função.
- Este relatório e logs locais de validação.

Migrations 015–020 foram preservadas nesta tarefa, incluindo alterações locais preexistentes. Não foi criada 022.

## Status e próximo passo

Validação: suíte afetada remediation.test.mjs, **57/57 passaram**, zero falhas; suíte completa Supabase, **354/354 passaram**, zero falhas, zero ignorados. Os logs finais estão em remote-preflight-diagnostics-tests.log e remote-preflight-full-tests.log. As regressões exercitam o SQL de preflight em transação READ ONLY e verificam ausência de alterações no catálogo; a tentativa local de 021 com EPI ausente falha antes de modificar objetos. PGlite não implementa o hook hospedado supautils: essa compatibilidade é sustentada pelo catálogo/configuração remoto recebido e pela documentação, não simulada pelos testes locais.

STATUS LOCAL: diagnóstico corrigido e pronto para novo preflight somente leitura; aplicação da 021 NÃO aprovada. A causa específica das funções Users e a presença real das policies assinaturas continuam pendentes da evidência catalogal remota. Nenhum bloqueio foi removido para obter aprovação artificial.

Pode executar novamente SOMENTE o arquivo completo 021_security_preflight_readonly.sql em sessão nova do SQL Editor e retornar TODOS os result sets, inclusive definições das funções e catálogo das policies. O novo RESULTADO do auditor lista exatamente as relações problemáticas. Não aplicar 021 com bloqueios.
