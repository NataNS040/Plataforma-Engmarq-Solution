# Storage privado de Documentos, ASO e certificados

Preparado localmente em 01/10/2026. Nenhuma alteração remota, commit ou push.
O bucket remoto permanece público até uma implantação explicitamente autorizada.

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

A 018 foi mantida **intacta**: a ausência de aplicação parcial remota ainda não foi
confirmada. Não execute `db push`/runner automático com todas as migrations pendentes
nesse ambiente: a ordem numérica tentaria 018 antes da correção do bucket.
Aplicar arquivos selecionados, em sessões/transações próprias, com registro correto
de sucesso no histórico usado pelo runner. Não marcar como aplicada uma migration
que falhou ou que não foi executada.

1. Obter acesso SQL de leitura ao projeto correto e executar
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
3. Aplicar **019_documentos_path_compat.sql** isoladamente. Ela apenas adiciona
   coluna nullable, constraint e parser privado; não converte dados, não muda o
   bucket/policies e mantém o frontend antigo compatível.
4. Definir `engmarq.storage_origin` no acesso SQL de manutenção, usando o origin
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
   No SQL Editor, incluir `SET engmarq.storage_origin = 'https://PROJECT_REF.supabase.co';`
   antes do conteúdo completo da 020, na mesma execução, substituindo o exemplo
   pelo origin confiável. Uma execução anterior do Editor pode usar outra conexão.
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
gravar somente arquivo_path quando NULL. A implementação não embute URLs nem
IDs reais. A conversão real só acontecerá quando a 020 for autorizada/executada.
Se um registro já tem path de substituição, ele é preservado; a antiga URL também
precisa continuar válida para a referência anterior.

Links públicos externos/bookmarks deixam de funcionar por decisão de segurança;
os registros e os fluxos internos passam a usar links assinados. Admin deixa de
abrir/baixar arquivos internos mesmo que continue vendo metadados no módulo.
Clientes antigos precisam ser retirados antes do corte. Nenhum rollback de frontend
para a versão que abre URLs públicas é compatível com o bucket privado.

Os testes SQL usam PGlite, migrations reais e fixtures sintéticas, sem rede.
Não validam o serviço Storage/CDN real. O estado remoto/rollback da 018 não foi
reconsultado nem considerado confirmado nesta implementação. A implantação
permanece condicionada aos preflights e à homologação real.

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
