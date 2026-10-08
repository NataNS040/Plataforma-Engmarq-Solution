# Baseline definitivo e postflight — Fundação 025-A

## A) Evidência encontrada

Investigados os SQLs, relatórios e exports JSON/CSV do repositório, incluindo `docs/audits/2026-10-04`, `2026-10-05`, `2026-10-07` e `supabase/tests`.

- `024_preflight_baseline_remoto_real.json`: fingerprints reais PRE-024; preservado, não reutilizado como PRE-025.
- `expected-025-*-catalog.json`: contratos estruturais sintéticos, não dados remotos.
- `EVIDENCIA_REMOTA_PRE025_FORNECIDA.txt`: corpo/ACLs externos e resumo fornecidos, não export completo.
- `FREEZE_025A.json`, relatórios da revisão final e de concorrência: confirmam candidato, aprovação informada pelo usuário e 20/0/0 real; não contêm todas as linhas PRE remotas.
- `025_preflight_remoto_manual.sql`: instrumento aprovado capaz de coletar parte importante da evidência, mas seus resultados completos não foram localizados.

Não é possível reconstruir o baseline integral a partir de 941 OK/182 ATENÇÕES/zero bloqueios, 47 ativos/zero inativos ou hashes de fixtures. Nenhum valor remoto foi inventado.

## B) Informações ausentes

Pacote da mesma coleta PRE-025: IDs/elegibilidade individuais; decisões comerciais/features/limites/uso por empresa; fingerprints reais e contagens de todas as relações operacionais; colunas e PKs de comparação; hashes das linhas comerciais anteriores; dados adicionais/opcionais; inventário/diagnósticos de tenant/FKs/Storage e metadados de segurança. Esses dados serão coletados pelo novo SQL, com auditor e instante de captura.

## C) Exportação complementar

Arquivo: `supabase/tests/025_baseline_pre025_export_readonly.sql`.

Exatamente três statements: BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; WITH/SELECT; COMMIT. Um único result set, uma linha `BASELINE_PRE025` com JSON version 2. Não executa DDL/DML, SET ROLE, RPC ou função CNPJ remota. Reutiliza as verificações do preflight aprovado **sem editar seu arquivo/contrato**; acrescenta snapshots determinísticos de tabelas public/engmarq_private/storage (r/p/m).

Conteúdo: hash da migration, timestamp/auditor/database, resultado de aprovação, fingerprints legados, checks de elegibilidade, contagens de ativos/inativos, relações tenant/FKs, buckets/Storage, contratos RLS/grants/funções/event trigger e snapshots ampliados. Snapshot contém colunas/PKs, contagem, fingerprint integral e mapa de hashes de linhas indexado por hash da identidade. Não exporta nomes, e-mails, CPF ou conteúdo de documentos. Definições de funções são removidas do pacote de checks; os contratos de hash/propriedades ficam preservados.

Dados pessoais existentes participam do hash dentro do banco, sem sair como valores. Hashes/IDs técnicos ainda devem ser tratados como evidência interna. Base64 usado no transporte XML/SQL é encoding, não criptografia.

O pacote marca approved=true somente com zero bloqueios e ausência do manifesto 025: export após apply não é aceito como PRE. A origem remota deve ser garantida pelo procedimento do operador; fixtures são apenas testes locais.

## D) Postflight e importador

Revisado `supabase/tests/025_fundacao_postflight_readonly.sql`. Ainda é **template**, com `[]`, pois não recebemos os dados reais. Esse estado continua BLOQUEIO, não aprovação artificial.

`025_postflight_baseline.mjs` agora exige pacote version 2 aprovado, freeze correto, inventário/snapshots completos, 18 fingerprints conhecidos e elegibilidade sem duplicação para todas as empresas. Rejeita resumos, baseline PRE-024, pacotes incompletos/unapproved e snapshot truncado. Incorpora JSON como base64 em expressão built-in segura e cria arquivo de saída novo (flag wx); não sobrescreve arquivos nem inventa valores.

POST compara:

- Dados operacionais exatos, usando somente colunas presentes no PRE; ausência de coluna/tabela, perda ou mudança de linha bloqueiam.
- Todas as relações adicionais/opcionais coletadas, incluindo Storage/EPI.
- Linhas comerciais/limites/features/uso/auditoria prévias preservadas; somente adições previstas são toleradas.
- Elegibilidade e presença comercial/features/limite/uso do manifesto de aplicação contra a coleta PRE independente.
- Features legadas somente elegíveis, nenhum EPI extra, planos/origem anteriores preservados e nenhum plano novo silencioso no legado.
- Quantidade de auditoria comercial igual ao PRE mais inserts previstos de comercial, features e limites.
- Contador igual aos ativos reais, limite respeitado, transições durante aplicação iguais a zero.
- RLS/policies/grants/funções do contrato POST; Super Admin sem gate operacional; ACL da sequence clientes vazios/service USAGE; contrato estrito de rls_auto_enable/ensure_rls.
- FK/tenant checks ampliados do auditor manual, buckets inesperados/públicos, namespaces de objetos, constraints não validadas e EXECUTE de definer comum perigoso.

CNPJ usa expressão independente já revisada do preflight. O POST não chama cnpj_valido/cnpj_canonico remotos; metadados/hash podem ser inspecionados sem executar o corpo. O teste substitui o corpo por uma exceção e comprova diagnóstico BLOQUEIO sem sua execução.

Arquivo preenchido futuro: `supabase/tests/025_postflight_remoto_manual.sql`. Ele **ainda não foi produzido**, porque o pacote real não existe localmente. Não executar template POST antes da migration: estruturas 025 ainda não existem. Não aplicar migration nesta etapa.

## E) Testes

Geração offline idempotente verificada; parser verifica três statements somente leitura no export, no template e no POST com payload incorporado. Allowlist inclui somente novos built-ins de conversão/hash/JSON; rejeição de mutações permanece.

Rodada final: **84 PASS, zero FAIL, zero SKIP**, em 69,51 s, nos arquivos baseline/postflight, Fundação 025, adversariais, segurança, origem e reconciliação. Log `025-baseline-postflight-final-tests.log`. Rodada anterior de mesma cobertura: 84/0/0. Primeira rodada de novos testes encontrou três falhas de preparação (allowlist lower, transação aninhada, objeto adicional não aprovado no fixture); corrigidas sem diminuir critérios de segurança. Logs intermediários `.025-baseline-*.log` na raiz preservam o histórico.

Testes cobrem aprovação com baseline completo, vazio bloqueador, importação incompleta/duplicada/truncada, freeze errado, dados operacionais alterados, EPI extra, manifesto adulterado, ACL da sequence, event trigger desativado, bucket público, auditoria comercial extra, relação cross-tenant e função CNPJ desconhecida. Tabela adicional de Storage e decisão comercial OFF/limite explícito são preservados e auditados.

Esses são testes locais em fixtures descartáveis; nenhum pacote sintético foi salvo como baseline remoto. Não houve execução remota ou nova homologação de concorrência: sua evidência 20/0/0 PG16.15 permanece intacta.

## F) Freeze

025 antes/depois: `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5`.

001–024: 24 hashes conferidos, zero divergências. Preflight aprovado preservado: `98ad6566523286e25c3eaf3a677d85786197c45edea803b2235436a455021d86`.

Export complementar: `ab0a44d408198964bf2df2d861a8f3283fccc94f8ae8111dd9ea73b0dc3c7451`.

POST template: `9cc2cf3fd15bab76cbcdaa48c6504737b2193f599497a7f1913a164884ccc637`.

## G) Procedimento manual

1. Confirmar projeto correto, PRE-025 e executor integral no SQL Editor. Coordenar ausência de escritas durante a coleta; esta exportação representa um único snapshot. Não modificar o contrato do preflight aprovado.
2. Executar **somente** o arquivo completo `025_baseline_pre025_export_readonly.sql`. Não executar migration/postflight junto.
3. Conferir approved=true, pre025=true, blocks=0, version=2 e hash congelado. Se algum divergir, STOP e preservar o resultado.
4. Exportar a única linha em **JSON completo**, sem truncar o campo BASELINE_PRE025. Salvar o envelope original, projeto/horário e hash do arquivo em `docs/audits/2026-10-08/PRE025_REAL.json`. Não usar CSV, imagem, resumo ou valores de fixture.
5. Em `supabase/tests`, executar localmente:

```powershell
node 025_postflight_baseline.mjs "../../docs/audits/2026-10-08/PRE025_REAL.json" "025_postflight_remoto_manual.sql"
```

O importador aceita o objeto JSON diretamente ou a linha exportada `[ { "BASELINE_PRE025": ... } ]`, incluindo JSON string do campo. Erro de validação bloqueia a geração. Arquivo de saída já existente não é sobrescrito: preservar versões e escolher novo nome.

6. Revisar o arquivo gerado e repetir parser/testes locais com a evidência importada; conferir snapshots, elegibilidade e hash do pacote. Não rodar geradores de migration. `npm run generate:025:baseline` regenera somente templates e exige hash congelado.
7. Parar aqui. POST só será executado manualmente em etapa futura, após aplicação separadamente autorizada e com janela sem escritas para comparar o mesmo PRE. Se houver mudança operacional/DDL depois da coleta, atualizar a evidência usando o mesmo export e revisar, sem fingir que o snapshot antigo ainda descreve o corte.

## H) Veredito

**BASELINE/POSTFLIGHT AINDA INCOMPLETOS** quanto à evidência remota definitiva. SQL de coleta, template de comparação e importador estão preparados/testados; falta executar a coleta manual e incorporar o JSON real. Não autoriza aplicação remota.

Nenhuma migration 001–025 alterada/aplicada remotamente, nenhuma ação remota, 025-B não iniciada, nenhum commit/push. Arquivos de implementação desta rodada: 025_baseline_generate.mjs, 025_baseline_pre025_export_readonly.sql, 025_fundacao_postflight_readonly.sql, 025_postflight_baseline.mjs, 025_manual_preflight.test.mjs, 025_baseline_postflight.test.mjs, fundacao_025.test.mjs, fundacao_025_adversarial.test.mjs e package.json. Documentação/resultados/logs locais adicionais nesta pasta.
