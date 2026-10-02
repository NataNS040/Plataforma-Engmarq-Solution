# Logos: provisionamento específico pela 022

## Diagnóstico e decisão

Inventário remoto informado pelo usuário: nenhum bucket `logos`, zero objetos de
logo, três empresas, zero referências não nulas em `empresas.logo_url`, ausência
das três policies antigas. Não há backfill. O problema confirmado é falta de
provisionamento/autorização do fluxo de logos; não é execução parcial da 021.

O fluxo conferido no código era: `LogoCard` → `uploadEmpresaLogo` → Storage
`logos`, objeto `<empresaId>/logo.<ext>`, `upsert: true` → `getPublicUrl` → PATCH
da API de Empresas → persistência em `logo_url` → `<img src=logo_url>`.
O backend usa o JWT do usuário, não faz upload de bytes nem usa `service_role`.
Não há fluxo de exclusão de logos. A enum atual representa administração da
plataforma por `admin`; o helper permite somente papéis tenant explicitamente
enumerados, portanto não autoriza um eventual `superadmin`.

**Decisão: bucket privado.** Bucket público permitiria leitura por URL sem
validação do tenant/ator, contrariando as novas regras. Conforme a documentação
[Supabase de buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
a entrega pública não é protegida pelas mesmas verificações da leitura privada.
O [upsert requer SELECT e UPDATE além de INSERT](https://supabase.com/docs/guides/storage/security/access-control).

A interface foi adaptada junto com a 022: salva `logos/<uuid>/logo.<ext>` no
campo existente `logo_url` e usa `storage.download` com sessão autenticada para
criar uma URL Blob local, revogada no cleanup. Não salva URL pública/assinada.
Uma chave com ator, empresa, referência e versão evita reutilizar a imagem entre
contextos. Upsert na mesma referência força novo download. Cache-Control é `0`.
URLs assinadas não foram escolhidas: o download autenticado evita persistir ou
distribuir um token de leitura reutilizável. A API aceita a referência estável,
valida formato/tenant e recusa edição de referência por admin/operacional.
Não foi adicionada autorização de bytes ao admin. As permissões comerciais já
existentes na 021 continuam separadas da autorização do bucket.

## Contrato de Storage e autorização

- Bucket `logos`, privado, limite **2.097.152 bytes (2 MiB)**.
- MIME: `image/png`, `image/jpeg`, `image/webp`. SVG foi retirado do seletor e do
  contrato. JPEG usa extensão canônica `jpg`, independentemente do nome original.
- Path estrito: UUID minúsculo canônico + `/logo.(png|jpg|webp)`.
- `can_access_logo(text,text,jsonb)` valida autenticação, operação, path,
  profile existente/ativo, empresa ativa, tenant e papel. Não depende dos helpers
  permissivos da 013. `admin`, anon e perfis desconhecidos não são autorizados.
- Empresa/gestor: SELECT/INSERT/UPDATE no próprio tenant. Operacional: apenas
  SELECT no próprio tenant ativo. DELETE não é concedido a nenhum ator funcional.
- Três policies permissivas específicas e quatro guards restritivos `TO PUBLIC`
  impedem que policies amplas/renomeadas contornem as regras de logos.
- UPDATE valida origem com USING e destino com WITH CHECK. O helper
  `logo_update_identity(uuid,text,text)` consulta a identidade persistida no
  snapshot do comando, exige o mesmo ID/bucket/path e bloqueia movimentos para
  dentro/fora de logos. Não foi criado trigger em `storage.objects`.
  O guard faz uma consulta por ID também nos updates dos outros buckets; seus
  fluxos usuais, policies, objetos e ACLs permanecem preservados. Não cria
  permissão para alterar IDs de Storage por UPDATE.
- Helpers `STABLE SECURITY DEFINER`, nomes qualificados, `search_path=''`, owner
  privilegiado sem membership dos clientes. EXECUTE somente owner/authenticated/anon,
  sem PUBLIC ou grant option para clientes. Anon pode avaliar o guard, mas o
  helper de autorização retorna false para logos; EXECUTE não concede upload.
- A 022 não altera ACLs/ownership/RLS da tabela de Storage. Exige RLS e grants
  funcionais existentes para authenticated, e aborta se faltarem.
- MIME/extensão/tamanho declarados são conferidos quando metadata os fornece.
  A reserva inicial de Storage pode ter metadata NULL. O limite/MIME do bucket
  valida a requisição HTTP. SQL não inspeciona magic bytes nem comprova conteúdo
  binário de arquivos. Os testes locais de MIME usam metadata e SDK mockado.

## Abortos, idempotência e auditoria

Primeira execução exige o inventário confirmado: bucket, objetos, referências,
policies/helpers próprios de logos ausentes e exatamente três empresas.
Não reaplica 013, não faz backfill nem converte um bucket existente.
Usa transação, locks com timeout de 5 segundos e statement timeout de 60 segundos.
Timeout/privilégio insuficiente aborta; não tentar resolver com ALTER/ownership.

Reexecução aceita apenas o contrato conhecido da 022: definições das policies,
corpos/linguagens/defaults/configuração/ACLs dos helpers e bucket exatos. Dados já
criados podem permanecer se paths/tenants/referências forem coerentes. Drift
desconhecido aborta antes de reescrever objetos. A reexecução com objetos existentes
foi testada localmente. O preflight remoto é voltado à **primeira aplicação**;
depois da 022 instalada, use o postflight para avaliar uma reexecução.

Os dois auditores usam `REPEATABLE READ READ ONLY`, SELECTs de catálogos/dados e
funções de catálogo do PostgreSQL. Não invocam helpers da aplicação, simulam JWT,
escrevem linhas, mudam roles ou fazem probes HTTP. O postflight confere definições
exatas, defaults, ACLs/owner, grants, guards e integridade das referências. Expõe
todas as policies de Storage e cada cenário de autorização como **prova estática**
do contrato SQL testado localmente. Não declara upload remoto homologado.

A expectativa da 021 foi corrigida: logos não integra o seu catálogo esperado.
O gerador do catálogo da 021 também foi corrigido. Policies adicionais de Storage,
incluindo logos, continuam visíveis como atenção na 021; sua aprovação específica
pertence ao auditor 022. Nenhum check real de Documentos/Empresas/Users foi retirado.

## Arquivos

Criados:

- `supabase/migrations/022_logos_tenant_storage.sql`
- `supabase/tests/022_logos_preflight_readonly.sql`
- `supabase/tests/022_logos_postflight_readonly.sql`
- `supabase/tests/logos-fixture.mjs`
- `supabase/tests/logos-022-catalog.mjs` (geração estritamente local dos fingerprints)
- `supabase/tests/logos_storage.test.mjs`
- `frontend/tests/logos.test.tsx`
- Este relatório, logs locais e `logos-022-migrations-015-021-sha256.json`.

Alterados nesta tarefa:

- `frontend/src/services/empresasService.ts`
- `frontend/src/modules/configuracoes/ConfiguracoesPage.tsx`
- `backend/app/services/empresas.py`
- `backend/tests/test_empresas.py` (preservadas as alterações prévias)
- `supabase/tests/021_security_postflight_readonly.sql`
- `supabase/tests/remediation-catalog.mjs`
- `supabase/tests/logos_diagnosis.test.mjs`
- `supabase/tests/package.json` (inclui as suítes de logos no teste completo)
- `docs/audits/2026-10-02/expected-021-catalog.json` (regenerado localmente).

Migrations 015–021, EPI/Assinaturas e Exames/ASO não foram modificados nesta tarefa.
Alterações preexistentes no workspace foram preservadas. Nenhum push/deploy ou
execução remota foi feito.

## Validação local

Testes específicos da 022: **34/34**. Cobrem empresa/gestor de A e gestor de B,
SELECT próprio, upload novo, verdadeiro `INSERT ... ON CONFLICT DO UPDATE`,
substituição e persistência da referência. Negativos: A inserindo/atualizando B,
upsert cross-tenant, operacional, anon, admin, inativo, empresa suspensa, profile
ausente/UID ausente, UUID/path inválidos/traversal/extensão inesperada, tenant
diferente, troca de ID/bucket/path/tenant por UPDATE, MIME incompatível e tamanho
inválido. Incluem policy ampla `TO PUBLIC`, idempotência, deriva de policy/ACL/bucket,
inventário incompatível com rollback e preservação de outras policies/dados/ACLs.

Suíte afetada Supabase: **89/89** na primeira execução (antes da adição do cenário
explícito B/suspensa); validação específica final: **34/34**.
Frontend logos + Empresas: **25/25**; backend Empresas: **62/62**, com um aviso
de depreciação de dependência de testes. Typecheck frontend: **passou**.
Suíte Supabase completa final: **387/387**, zero falhas e zero ignorados.
Logs preservados nesta pasta de auditoria.

Lint dos arquivos frontend envolvidos: um erro preexistente em
`ConfiguracoesPage.tsx`, no effect que chama `setTab(tabs[0].id)`
(`react-hooks/set-state-in-effect`), fora do trecho de logos. Não foi corrigido
nesta tarefa; o lint não está integralmente aprovado. Typecheck e testes passaram.

Limites: PostgreSQL é local em memória (PGlite); transporte do SDK/API é mockado.
Não há execução de Storage HTTP real nem validação de bytes. Os fingerprints são
derivados do catálogo local; diferenças de deparse/versão do PostgreSQL remoto
devem ser revisadas como drift, nunca ignoradas para obter aprovação artificial.

## SHA-256 preservados: migrations 015–021

Comparação com `logos-migrations-015-021-sha256.json` feita antes e depois:

| Migration | SHA-256 |
|---|---|
| 015 | `7a3d6db8f1e694756287d931dcb831f2be676755e41f5348692a4c8079864e6b` |
| 016 | `631cdae22348a47c0d095959b7a84504b0bc57cd755580ff702b8a8ebe85f9ad` |
| 017 | `1cc374788529cf92685f376589946f28d80086083f89922c4177c58a82455b70` |
| 018 | `feca76ce34c57266acbe59a280f95276d4c1375984c5cefd086ca71342739a71` |
| 019 | `57a99089d3f684c57e6c3d15c95f446bff35992c9a7eaa3103ba329c744e8bf8` |
| 020 | `6aff35a817e0f65ba592b86e70e9e3d5cda134b9f2c4d24b79496e9533c86fb8` |
| 021 | `5ee8bf5d93b3bbd80f4d71819d65e18d3882c3d4a821f36b05e6d821b04519f6` |

## Próximo passo remoto exato

**Agora, executar apenas `supabase/tests/022_logos_preflight_readonly.sql` inteiro
no SQL Editor administrativo do projeto Supabase correto, em sessão nova.
Exportar o resultado completo e voltar para revisão.** Esperado:
`TOTAL_BLOQUEIOS=0`, ausência completa de logos, 3 empresas, e atenção com todas
as policies existentes para revisão de compatibilidade.

Não executar 013 ou reaplicar 021. Nenhuma execução remota foi feita por esta tarefa.

Após revisão do preflight, a sequência planejada é:

1. Coordenar a versão nova do frontend/backend; pausar upload de logos durante
   o intervalo para não deixar o frontend antigo gerar URL pública inválida.
2. Executar **somente** `022_logos_tenant_storage.sql` inteiro em uma execução
   transacional no SQL Editor. Em aborto/drift, parar e revisar; não relaxar guards.
3. Executar `022_logos_postflight_readonly.sql` inteiro em sessão nova, exportar
   resultado completo e conferir `TOTAL_BLOQUEIOS=0`. A atenção sobre HTTP pendente
   é esperada; não confundi-la com homologação do produto.
4. Disponibilizar as versões compatíveis do frontend/backend e homologar com
   usuários de teste reais: empresa/gestor upload+substituição+recarregamento;
   operacional só leitura; admin/anon/inativo/cross-tenant sem acesso de escrita;
   path/rename/tenant/MIME inválidos bloqueados. Validar que URL pública não
   entrega bytes e que o browser usa download autenticado. Não usar service_role.
5. Executar novamente os postflights 022 e 021. A 021 pode apresentar atenções de
   policies adicionais de logos, encaminhadas à 022. Verificar integridade dos
   objetos/referências e encerrar a homologação somente após o fluxo real passar.

Estado final desta entrega: implementação e evidência local concluídas;
aplicação/homologação remota ainda pendentes. Nenhum avanço de módulo fora de logos.
