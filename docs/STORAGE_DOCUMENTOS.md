# Storage privado de Documentos, ASO e certificados

> Histórico do cutover 019/020: os estados abaixo descrevem etapas de 01/10/2026.
> Para o fechamento deste ciclo, veja [a revisão final](audits/2026-10-02/REVISAO_FINAL_CICLO.md),
> o [escopo final da 021](audits/2026-10-02/ESCOPO_FINAL_021_SEGUNDO_PREFLIGHT.md)
> e o [relatório de logos 022](audits/2026-10-02/RELATORIO_LOGOS_022.md).


## Atualização: falha da 020 no Supabase hospedado (01/10/2026)

A tentativa da 020 falhou com SQLSTATE 42501 em
`ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`. O estado pós-falha
não foi consultado remotamente. RLS de Storage é administrado pelo Supabase;
`storage.objects` pertence a `supabase_storage_admin`. Não mudar ownership,
não conceder superuser e não desabilitar RLS para corrigir isso.

**Executar primeiro**, em uma execução nova do SQL Editor e com o mesmo papel
SQL da futura tentativa: `supabase/tests/020_failed_attempt_preflight_readonly.sql`.
Esse arquivo substitui o preflight antigo como primeiro passo desta recuperação.
Contém BEGIN TRANSACTION READ ONLY, o preflight consolidado pós-019 e diagnósticos
específicos de rollback/privilégios. Nenhum comando remoto foi executado pelo agente.
O baseline informado é 12 documentos, 4 URLs legadas, 0 paths, 4 backfills
pendentes e 4 objetos. RLS deve estar ligado e o trigger de status habilitado;
funções/trigger/guards da 020 devem estar ausentes no rollback esperado. Bucket,
policies, grants e inventário devem corresponder ao baseline anterior. Contagens
iguais não provam a identidade de cada registro/objeto nem o conteúdo dos blobs.
Histórico indisponível continua sendo atenção; conferir logs do executor.
Qualquer BLOQUEIO exige investigação antes da nova tentativa. Vestígios da 020
não devem ser interpretados como rollback confirmado só porque a versão nova é
reexecutável. Não reaplicar 019 ou alterar migrations anteriores.

A 020 corrigida mantém BEGIN/COMMIT, locks, backfill somente em NULL,
configuração privada/10 MB/7 MIME, isolamento de empresa e papéis, guards de
certificados e validação de referência. Substitui apenas o ALTER de RLS por
uma assertiva de catálogo que aborta se RLS não estiver habilitado. Duas funções
usam CREATE OR REPLACE; as quatro guards ganham DROP POLICY IF EXISTS; o trigger
de referência ganha DROP TRIGGER IF EXISTS. As quatro policies permissivas já
tinham DROP IF EXISTS. Não há escrita, exclusão ou movimentação de objetos.
Funções preexistentes com assinatura/owner incompatível continuam falhando com
segurança; não são removidas com CASCADE.

| Comando da 020 | Auditoria de compatibilidade |
|---|---|
| ALTER TABLE storage.objects ENABLE RLS | Incompatível para o papel hospedado informado; removido. A verificação relrowsecurity o substitui. |
| DROP POLICY / CREATE POLICY storage.objects | Suportados pela plataforma hospedada via autorização específica de policies; PostgreSQL puro exige owner. O preflight mostra supautils.policy_grants e verifica o papel atual, sem testar DDL remoto. Sem evidência de autorização, bloqueia. Não inferir permissão pelo erro do ALTER. |
| UPDATE storage.buckets | DML de configuração, não DDL de ownership; exige UPDATE, SELECT e acesso pela RLS. Preservado para manter corte/configuração atômicos. O preflight verifica privilégios e bypass/leitura integral; as APIs de Storage continuam sendo o caminho para manipular arquivos. |
| LOCK storage.objects / storage.buckets SHARE ROW EXCLUSIVE | Não exige ownership; exige UPDATE/DELETE/TRUNCATE (ou MAINTAIN em versões que o suportam). Já precedeu o erro relatado. Mantido para impedir mudanças concorrentes; o preflight usa os privilégios comuns, sem adquirir locks. |
| LOCK / UPDATE public.documentos | Permissões da tabela da aplicação; o preflight verifica leitura, UPDATE/lock e owner. Backfill altera só arquivo_path; nenhum registro é removido. |
| ALTER public.documentos DISABLE/ENABLE TRIGGER trg_documento_status | Exige owner da tabela da aplicação; não altera Storage nem RLS. Pausa apenas cálculo de status e restaura O na mesma transação. Já precedeu o erro relatado. |
| CREATE OR REPLACE FUNCTION no schema privado | Exige CREATE/USAGE no schema e owner de função existente. Não cria função no schema gerenciado storage. SECURITY DEFINER, search_path vazio e ACLs são preservados. |
| REVOKE / GRANT funções privadas | Exige owner/grant option dessas funções da aplicação. Preservados; nenhum GRANT/REVOKE de tabela gerenciada. |
| DROP / CREATE TRIGGER public.documentos | DROP exige owner; CREATE exige TRIGGER e EXECUTE da função. Papel owner usado pela migration atende; não se cria trigger em storage.objects. |
| DO, SELECT, helper da 019, BEGIN/COMMIT | Suportados com leitura integral, EXECUTE no helper e privilégios da aplicação. Preflight mantém checks de estrutura/helper da 019. |

O rollback integral é **esperado**, porque backfill, estado do trigger e criação
de função estavam entre BEGIN e o COMMIT que não foi alcançado. Em conexão
persistente a transação fica abortada até ROLLBACK/fechamento; não há commit
parcial automático. O SET do origin anterior ao BEGIN é configuração da sessão
e não é parte desse rollback de dados. Se o executor dividiu/reescreveu o script
ou houve execução separada, essa conclusão exige confirmação pelos logs/preflight.

Após conferir todos os resultados, a versão local revisada está em
`supabase/migrations/020_documentos_private_storage.sql`. Em uma futura execução
manual autorizada, incluir antes do arquivo inteiro o SET do origin já validado,
na mesma execução. Ainda não foi aplicada remotamente. Não executar push.

Fontes oficiais: [permissões de schemas gerenciados](https://supabase.com/docs/guides/platform/permissions),
[restrições e exceção para policies](https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025),
[supautils: Manage Policies](https://github.com/supabase/supautils#manage-policies),
[Storage RLS](https://supabase.com/docs/guides/storage/security/access-control),
[privilégios de LOCK](https://www.postgresql.org/docs/17/sql-lock.html).

Validação desta correééo: suíte SQL `npm test`: **288/288 passaram**; frontend
`npm test -- --run tests/documentos-storage.test.ts`: **38/38 passaram**;
`git diff --check`: passou.

Os testes locais usam PGlite/fixtures, sem Supautils e sem serviço Storage/CDN.
Eles validam reexecução completa, rollback de erro 42501 injetado no ponto antigo,
12 registros/4 objetos/4 backfills, preflight read-only, falha fechada sem RLS e
privilégios de lock/configuração com papel não-owner. O teste PostgreSQL puro
confirma separadamente que policies exigem ownership sem a extensão hospedada;
ele não é prova de autorização do papel remoto.

Estado atualizado em 01/10/2026 com os resultados reais fornecidos pelo operador.
A implementação está no commit e3bf17e6154bc4a013db54f680b2802ea6bc95da.
Nesta atualização não houve execução remota, alteração de dados, commit ou push.
O bucket ainda está público; a 020 não foi aplicada.

## Estado real informado pelo operador

| Etapa | Estado |
|---|---|
| Preflight inicial consolidado | CONCLUÍDO: 0 BLOQUEIOS e 6 ATENÇÕES |
| Migration 019 | APLICADA; arquivo_path existente e helper funcionando |
| Preflight pós-019 / pré-020 executado | APROVADO |
| Migration 020 | PENDENTE |
| Validação pós-020 | PENDENTE |
| Migration 018 | PENDENTE; aguardar a conclusão segura da 020 |

O preflight inicial encontrou ausência de vestígios detectáveis da 018, duas FKs
originais, RLS nas três tabelas de Treinamentos, cinco policies baseline, nenhum
relacionamento cross-tenant inválido e nenhum certificado com path inválido.
O histórico de migrations não estava acessível; isso continua sendo uma atenção,
sem transformar ausência de vestígios em prova absoluta de rollback.

Resultados reais pós-019 recebidos: 12 documentos, 4 referências legadas,
0 canônicas, 4 pendentes de backfill; 4 objetos, 0 MIME incompatível e 0 tamanho
incompatível. As quatro URLs foram aceitas pelo helper e encontraram seus objetos.
São observações de homologação, **não constantes ou pré-condições numéricas** da 020.

O erro 42701 ao repetir a 019 confirma que a coluna já existe; não reaplicar 019.
A existência da coluna, sozinha, não confirma todos os DDLs: o preflight atualizado
verifica também constraint e helper. A aprovação remota informada refere-se ao
preflight anterior; a versão consolidada atual ainda precisa ser revisada/executada
pelo operador para confirmar seus checks adicionais de catálogos e 020.

## Preflight consolidado pós-019

Arquivo existente atualizado: `supabase/tests/019_documentos_cutover_preflight_readonly.sql`.
Não foi criado outro preflight. Ele retorna uma única tabela CHECK / RESULTADO /
STATUS, com OK, ATENÇÃO ou BLOQUEIO. O arquivo contém o SET válido antes do SELECT:

```sql
SET engmarq.storage_origin = 'https://kkjckayiqvlqpdjyoxyv.supabase.co';
```

Executar o arquivo inteiro na mesma execução/sessão do SQL Editor. É uma
configuração de sessão; não modifica banco, bucket, policies ou registros. Não usar
sintaxe de .env ou uma URL solta. O origin é do projeto, não uma credencial nem uma
URL real de documento; deve continuar igual ao projeto utilizado pelo frontend.

Os checks incluem estruturas da 019, ausência de vestígios 018/020, tenant dos
paths, referências canônicas/legadas, objetos existentes, MIME/tamanho e inventário.
Diferença entre URL antiga e path de substituição aparece como ATENÇÃO, pois esse
desenho preserva ambos os arquivos. Objetos sem referência atual também são
ATENÇÃO e serão preservados: nenhuma limpeza automática é autorizada.
Histórico indisponível é ATENÇÃO. Definições de policies/grants ainda requerem
revisão; contagens ou nomes corretos não comprovam equivalência das expressões.

Para avançar: nenhum BLOQUEIO, revisar as ATENÇÕES, publicar o frontend compatível
em manutenção e retirar clientes antigos antes da 020. Código preparado não
comprova que essa versão já foi publicada no ambiente remoto.

## Modelo e consumidores

O bucket compartilhado `documentos` passa a privado. `documentos.arquivo_path`
é a identidade persistente; `arquivo_url` permanece como referência legada, sem
remoção. Novos registros gravam somente path. Substituições atualizam somente path
e preservam a URL antiga e ambos os objetos. Não há limpeza de órfãos.

`documentosStorage.ts` centraliza upload, resolução de referências e assinatura.
O resolver aceita paths canônicos e URLs públicas legadas apenas do origin exato
de `VITE_SUPABASE_URL`, do bucket `documentos` e do tenant esperado. Não aceita
URLs externas, assinadas, credenciais, query/fragment, escapes percentuais,
traversal ou subpastas não reconhecidas. O path canônico tem precedência quando
um arquivo foi substituído. Nunca se usa a URL antiga diretamente para servir arquivos.

Antes de upload/assinatura, a aplicação exige sessão e consulta o perfil do
próprio usuário: active, role e empresa_id. O backend de Storage aplica as policies
com o JWT do chamador e verifica também a empresa ativa. O parâmetro empresa_id do
frontend não é autoridade de acesso. A autorização definitiva está no PostgreSQL.
Links são assinados por 60 segundos, sob demanda, e nunca persistidos. A aba vazia
é aberta durante o clique para evitar bloqueio de popup; em erro, fecha e mostra
mensagem genérica. Downloads usam a opção download da URL assinada.

Documentos preserva upload, substituição, visualização e download; ASO recebe
somente a mudança de referência/acesso a Storage, sem migração para FastAPI.
Treinamentos mantém `empresa_id/certificados/uuid.ext` em `certificado_url` e usa
o mesmo helper de autorização/assinatura. Seu download rejeita outro namespace.
EPI usa `assinaturas` e Empresas usa `logos`; esses buckets não são alterados.

EPI/assinaturas fora do escopo da 021; será tratado na migração própria do módulo EPI. A 021 não exige presença das tabelas EPI, bucket ou policies de assinaturas. As métricas de Documentos usam suas próprias dependências; a ausência do módulo futuro não as torna indisponíveis. A dívida inclui a API EPI, isolamento por tenant, assinatura privada e revisão do uso legado de `getPublicUrl`.

## Policies e configuração propostas

- Empresa/gestor ativos, empresa ativa: leitura e upload no próprio tenant;
  update/delete de objetos gerais do próprio tenant permanecem possíveis por RLS.
  A aplicação não executa essas operações de remoção no Storage.
- Operacional ativo: somente leitura no próprio tenant.
- Admin (inclusive com empresa_id preenchido), qualquer outro papel funcional,
  usuário inativo, empresa suspensa e anônimo: sem acesso ao bucket.
- Primeiro segmento = empresa_id; somente arquivo direto ou namespace certificados.
- Certificados não podem ser atualizados ou excluídos pelo usuário, inclusive
  antes da 018. As guards da 018 coexistem com as guards gerais da 020.
- Quatro policies permissivas específicas e quatro guards restritivas para todos
  os papéis impedem que outra policy permissiva amplie acesso a `documentos`.
  Policies de outros buckets não são removidas. Não se concede USAGE do schema
  privado a anon. A função de decisão é executável por anon somente no contexto
  da policy já vinculada, retorna false e não revela registros.
- A infraestrutura service_role/owner mantém seu acesso técnico privilegiado;
  essas credenciais nunca são usadas para acesso funcional no frontend.
- 10 MB; PDF, Word, Excel, JPEG e PNG. JPEG/PNG são necessários porque o seletor
  existente de certificados aceita JPG/JPEG/PNG. A lista antiga da 009 não os incluía.

A 020 também instala trigger: URLs legadas são somente leitura para authenticated;
tenant é imutável; mudanças de path exigem autorização de escrita e objeto existente.
A constraint exige que o path pertença à empresa do registro e nunca seja URL.
Proteções de relacionamentos de Documentos/ASO além de Storage ficam fora deste escopo.

## Migrations e implantação exata

A 018 foi mantida **intacta**: o operador informou ausência de vestígios detectáveis,
mas o histórico não foi acessível. Não execute `db push`/runner automático com todas as migrations pendentes
nesse ambiente: a ordem numérica tentaria 018 antes da correção do bucket.
Aplicar arquivos selecionados, em sessões/transações próprias, com registro correto
de sucesso no histórico usado pelo runner. Não marcar como aplicada uma migration
que falhou ou que não foi executada.

1. **CONCLUÍDO no ambiente informado.** Para auditoria/revalidação, obter acesso SQL de leitura ao projeto correto e executar
   `supabase/tests/018_storage_preflight_readonly.sql` em sessão nova.
   O script aborta se encontrar footprints da 018 ou registro de aplicação no
   histórico padrão; exibe policies, grants e contagens sem objetos/dados pessoais.
   As contagens de relacionamentos e paths incompatíveis com a 018 devem ser zero.
   Conferir também o histórico/log do executor usado e comparar grants/policies
   exibidos com o baseline 001–017. Ausência de um footprint isolado não é prova
   de rollback. Qualquer divergência bloqueia a sequência; investigar antes de
   escrever uma reparação específica. Não aplicar nem reexecutar 018 para testar.
2. Fazer backup/snapshot seguro de registros e inventário/arquivos, sem os anexar
   a relatórios públicos. Confirmar o projeto e o origin HTTPS exato utilizados
   no frontend. Conferir contagens atuais: a auditoria anterior tinha 4 objetos e
   4 URLs, mas não assumir que permanecem iguais na data de implantação.
3. **019 JÁ APLICADA: não repetir.** Ela apenas adiciona
   coluna nullable, constraint e parser privado; não converte dados, não muda o
   bucket/policies e mantém o frontend antigo compatível.
4. **PREFLIGHT ANTERIOR APROVADO.** O consolidado atualizado inclui o SET do origin
   já validado pelo operador. Definir `engmarq.storage_origin` no acesso SQL de manutenção, usando o origin
   confiável do projeto, sem barra final. Executar o preflight somente leitura
   `supabase/tests/019_documentos_cutover_preflight_readonly.sql`. Revisar MIME,
   tamanho e referências: contagens incompatíveis precisam ser zero. A 020 valida
   novamente dentro da transação, incluindo os patterns e empresas dos objetos.
   Não corrigir dados automaticamente quando houver divergência.
5. Entrar em janela de manutenção, pausar gravações e impedir uso dos clientes
   antigos. Publicar o **frontend compatível** e a versão de backend coordenada
   de Treinamentos já preparada no projeto. Não liberar usuários ainda: o bucket
   continua público até o próximo passo. Validar a configuração de build/origin.
6. Na **mesma sessão SQL** em que se definiu o origin, aplicar
   **020_documentos_private_storage.sql** isoladamente. Backfill de paths NULL,
   trigger, policies, bucket privado, limite/MIME são atômicos. URLs antigas são
   mantidas. Nenhum objeto é movido, copiado ou removido.
   O trigger calculado de status é pausado somente no backfill e restaurado na
   mesma transação, preservando também status, datas e demais campos dos registros.
   Referência externa, signed URL, tenant inválido, objeto ausente, metadata ausente/incompatível ou
   arquivo acima do limite abortam tudo. Se houver erro, fechar/ROLLBACK a sessão
   abortada; não liberar a aplicação nem reabrir o bucket público como correção.
   No SQL Editor, incluir o SET exato mostrado acima antes do conteúdo completo
   da 020, na mesma execução. Uma execução anterior do Editor pode usar outra conexão.
7. Confirmar public=false, configuração, contagens, paths e policies em leitura.
   Homologar com JWTs reais: empresa/gestor, operacional, outro tenant e admin.
   Verificar os arquivos antigos, upload/substituição de Documento, ASO e
   certificado; conferir acesso público negado sem divulgar URLs. A privacidade
   não recupera cópias já baixadas e a verificação deve considerar caches/CDN.
8. Reexecutar o preflight da 018 em sessão nova e só então aplicar a
   **018_treinamentos_tenant_security.sql original**, isoladamente. Ela continua
   exigindo bucket privado e abortando em relacionamentos/certificados/policies
   legados incompatíveis. Homologar guards, grants e view de Treinamentos.
9. Registrar o sucesso de 019, 020 e 018 no histórico de implantação utilizado;
   liberar usuários somente após os checks e os testes funcionais reais.

Ordem deste ambiente: **preflight de rollback → 019 → preflight de referências →
manutenção/frontend compatível → 020 (conversão + policies + bucket privado) →
verificação → preflight → 018 → homologação/liberação**.

Em instalação nova, 009 já cria o bucket privado; 018–019–020 podem seguir ordem
numérica, mas a 020 continua exigindo origin explícito e configuração coordenada.
Ainda não há um runner de implantação automatizado neste repositório.

## Preservação e limites da validação

Os quatro registros conhecidos podem ser convertidos sem mover arquivos:
remover o prefixo reconhecido da URL, validar empresa/bucket/path e existência,
gravar somente arquivo_path quando NULL. Migrations não embutem URLs nem IDs reais;
o preflight contém apenas o origin explicitamente validado pelo operador.
A conversão real só acontecerá quando a 020 for autorizada/executada.
Se um registro já tem path de substituição, ele é preservado; a antiga URL também
precisa continuar válida para a referência anterior.

Links públicos externos/bookmarks deixam de funcionar por decisão de segurança;
os registros e os fluxos internos passam a usar links assinados. Admin deixa de
abrir/baixar arquivos internos mesmo que continue vendo metadados no módulo.
Clientes antigos precisam ser retirados antes do corte. Nenhum rollback de frontend
para a versão que abre URLs públicas é compatível com o bucket privado.

Os testes SQL usam PGlite, migrations reais e fixtures sintéticas, sem rede.
Não validam o serviço Storage/CDN real. Nesta atualização, os resultados remotos
foram fornecidos pelo operador e não reconsultados por este agente. A 019 e o
preflight anterior estão concluídos; 020, homologação pós-020 e 018 permanecem pendentes.

## Testes

`frontend/tests/documentos-storage.test.ts` cobre parser canônico/legado, URL
externa/assinada/malformada, tenant forjado, travessia/encoding, autorização de
admin/operacional/usuário inativo, upload e MIME/tamanho, Documentos/ASO,
persistência exclusiva de path, certificados, link curto e UX de abertura/erro.

`supabase/tests/documentos_storage.test.mjs` cobre bucket privado e configuração,
quatro referências preservadas, tenant A/B, papéis/inativos/empresa suspensa,
policy permissiva inesperada, anônimo, path forjado, escrita operacional negada,
histórico de certificados, trigger de referência, coexistência com 018,
preflight e rollback atômico em dados incompatíveis.

Validação local final: Backend `pytest`: 347 passaram; Frontend `npm test`: 159
passaram em 12 arquivos; `npm run typecheck`: passou; `npm run build`: passou;
Supabase `npm test`: 284 passaram; `git diff --check`: passou. Há um warning de
depreciação Starlette/httpx no backend e um aviso de bundle acima de 500 kB no build.
Os 32 testes SQL novos e os testes de Storage do frontend fazem parte desses totais.

Nesta atualização de preflights/documentação: suíte Supabase novamente validada
com 284 testes passando; preflight consolidado verifica pré/pós-cutover, histórico
indisponível e dados incompatíveis sem alterar o snapshot sintético dos registros.
As migrations 018/019/020 e o código funcional frontend/backend não foram alterados.
