# Fase 024 — Fundação comercial, entitlements, limites e integridade de CNPJ

Data: 03/10/2026. Base: `ba7e645af7887995b442edd3fc3b3b1bd9cf3717`.

**Preparada e validada localmente. Nenhum comando, migration ou preflight foi executado no Supabase remoto. Sem commit/push. A aplicação pública permanece sem autocadastro.**

## 1. Resultado e limites desta entrega

A [024_fundacao_comercial.sql](../../../supabase/migrations/024_fundacao_comercial.sql) cria somente a fundação aprovada. Não cria planos/pacotes automáticos, não atribui Free a empresas legadas e não executa backfill de concessões, limites ou contadores. Não modifica migrations 015–023, EPI, Storage, Auth, roles ou vinculação de usuários.

Não cria CTA, endpoint, signup, bootstrap, gates nos módulos ou quota de colaboradores. A função de consulta de feature é preparada, mas ainda não é consumida pelos módulos existentes. Nenhum novo Free operacional é provisionado nesta fase; a autorização funcional completa depende de 025/026.

Primeiro usuário `empresa`, confirmação real de e-mail, criação atômica do tenant e Free com três concessões e teto de 100 **ativos** permanecem decisões aprovadas para o provisionamento futuro. Não foram antecipadas.

## 2. Schema preparado

| Estrutura | Contrato |
|---|---|
| empresas.cnpj_canonico | Coluna gerada STORED, preserva cnpj original; UNIQUE global e CHECK de formato/DV; numérico e alfanumérico |
| Endereço empresarial | cep, logradouro, numero, complemento, bairro nullable; cidade/uf existentes preservados; sem endereço livre duplicado |
| features | Catálogo técnico com oito chaves explícitas; sem capacidade de escrita por tenant/Admin funcional |
| empresa_features | PK empresa/feature, enabled explícito, FK de catálogo; ausente/desconhecida = OFF |
| empresa_comercial | Origem obrigatória autocadastro/administrativo/legado, imutável após criação; plano_comercial_id UUID opcional sem resolução autorizativa; titularidade nullable autodeclarado/verificado com evidência de ator/data |
| empresa_limites | Inteiro positivo ou NULL; `ilimitado=true` obrigatório para aceitar NULL; nenhum default para teto; configuração ilimitada nunca resulta de omitir o campo |
| empresa_uso | Somente agregado: empresa_id, colaboradores_ativos >= 0, apurado_em; zero linhas na aplicação da 024; cliente não escreve |
| empresa_diagnostico_sst | Respostas sim/nao/nao_sei (NULL = não respondido), quantidade declarada >= 0, conhece_grau_risco boolean nullable e grau 1–4 consistente; versão 1, autor tenant e data |
| auditoria_comercial | Append-only de alterações de concessão, limite, origem/plano/titularidade e status empresarial; ator autenticado, executor, instante e snapshots comerciais, sem conteúdo operacional |
| engmarq_private.onboarding_solicitacoes | Persistência apenas: Auth ID, chave idempotente, SHA-256 do payload, estado/expiração e resultado; unique por identidade/chave e um resultado concluído por identidade; nenhum payload, senha, endpoint ou função de provisionamento |

Catálogo criado: empresa.cadastro, usuarios.gestao, colaboradores.gestao, treinamentos, exames, documentos, epi e relatorios.sst. Inserir as definições do catálogo **não** concede funcionalidades a uma empresa. Não há plano Free aplicado nem linha de limite 100 criada automaticamente.

O diagnóstico tem comentário explícito de autodeclaração, sem criação de documento/evidência ou atualização de dashboard/quota. Informações de titularidade e plano são comerciais e nunca substituem entitlements. Não se infere modalidade contratada de documentos ou outros dados existentes.

## 3. Decisões técnicas

### CNPJ e correção controlada

Canonicalização aceita formato compacto de 14 posições ou máscara exata, com espaços ASCII externos; letras ASCII minúsculas são convertidas por translate determinístico. Não usa transformação dependente de locale, não remove letras, não aceita máscara parcialmente malformada, Unicode semelhante ou caracteres desconhecidos. Zeros iniciais são preservados. O valor original não é reescrito.

O cálculo do DV segue ASCII menos 48, pesos oficiais e módulo 11. Referência primária: [Receita Federal — cálculo do DV alfanumérico](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj). Vetores locais incluem o exemplo `12.ABC.345/01DE-35` e a emissão `00.000.000/E08G-12`.

A migration trava empresas antes de verificar dados e adicionar constraints. Se houver formato inesperado, DV inválido, sequência repetida ou colisão canônica, aborta a transação sem corrigir, fundir, excluir ou transferir empresas. A constraint UNIQUE mantém a integridade para gravações diretas, incluindo chamadas simultâneas. A concorrência real ainda tem validação de ambiente pendente descrita abaixo.

`guard_empresa_write` conserva a autorização da 021 e acrescenta os campos de endereço aprovados. O CNPJ não pode mudar por cliente authenticated, inclusive Admin comercial; PATCH com o mesmo valor continua permitido, para compatibilidade do formulário atual. Correção requer fluxo controlado de infraestrutura, ainda sem endpoint nesta entrega, revisão de titularidade/dados e validação das mesmas constraints. Não foi aberto um bypass funcional nem fluxo de correção pública. Owner/service_role são infraestrutura privilegiada existente, não uma autorização comercial para corrigir livremente.

### Limites e uso

Não se usam números mágicos. O boolean `ilimitado` torna a intenção de NULL verificável pelo banco: omitir teto sem configurar ilimitado é erro. Não existe linha implícita ilimitada por empresa.

No INSERT/UPDATE de limite, trigger SECURITY DEFINER lê somente a **contagem agregada** real dos ativos e o contador disponível, e rejeita teto menor que o maior deles. O cliente Admin não recebe SELECT de colaboradores para isso. Usa lock empresarial FOR UPDATE; os guards autenticados atuais de colaboradores usam SHARE nessa empresa. Não reinterpreta histórico, não desativa pessoas e não cria estado de excesso.

O contador ainda não é inicializado nem mantido automaticamente. Seu writer técnico é service_role; authenticated/anon não possuem escrita, exclusão ou TRUNCATE. Atualização transacional de uso e quota em todas as operações, inclusive caminhos técnicos/importações, pertence à 025. Não se pode tratar uma linha de empresa_uso como contador live nesta fase. Operações técnicas concorrentes de colaboradores também precisarão participar do protocolo de locks da 025.

### RLS, grants e auditoria

Todas as novas tabelas possuem RLS. Grants padrão de PUBLIC/anon/authenticated/service_role são removidos, depois os estritamente necessários são concedidos. Tenant ativo lê somente sua própria fundação; Admin ativo com empresa administrativa ativa lê a camada comercial e escreve concessões/limites/metadados autorizados. Operacional mantém somente leitura. Grants de escrita são por coluna; tenant não escreve features, plano, origem, limites ou contador. Admin não cria features de catálogo e não entra no tenant por ter concessões.

`has_empresa_feature` consulta banco, exige identidade tenant ativa e nunca retorna capacidade operacional para Admin global. Ausência de feature/concessão nega acesso. Plano e titularidade não influenciam essa função. Helpers SECURITY DEFINER usam search_path vazio e nomes qualificados. Não existe função pública de bootstrap, e engmarq_private deve continuar não exposto no PostgREST.

Triggers gravam a auditoria de INSERT/UPDATE comerciais e mudanças de status empresarial. Não registram dados individuais, ASOs ou arquivos. DELETE comercial não é concedido aos clientes: feature é desabilitada por UPDATE. Auditoria não aceita INSERT dos clientes nem alterações/DELETE/TRUNCATE, inclusive pelo executor de manutenção com triggers ativos. Como sempre, um owner que deliberadamente desabilite triggers pode contornar integridade; não há esse caminho funcional disponibilizado.

Diagnóstico permite gestão somente por empresa/gestor da própria empresa, com autor derivado da identidade autenticada e timestamp do banco. Admin comercial apenas consulta. Autor de outra empresa é rejeitado mesmo no caminho técnico. A proteção do último empresa/gestor ativo foi reservada à 025 para evitar alteração prematura no módulo de usuários.

### Compatibilidade de aplicação

Nenhum arquivo de produção frontend/backend mudou nesta entrega; nenhuma dependência foi adicionada. Por isso não foram criados contratos backend novos ou endpoints comerciais.

**ATENÇÃO antes de aplicar/deployar:** schemas/formulários atuais de empresas ainda têm máscara numérica e não expõem os novos campos de endereço. O repositório backend hoje também trata erros SQL não mapeados (como CHECK 23514) como indisponibilidade. A base SQL suporta CNPJ alfanumérico, mas adoção completa na aplicação exige ajuste coordenado dos inputs/erros e da edição de CNPJ antes de ativar os novos fluxos. A 024 não afirma que essa UX já está migrada. CNPJ inválido pode passar pela máscara atual e ser negado pelo novo CHECK; isso protege o banco, mas precisa de mensagem amigável no contrato de aplicação. Essa pendência não autoriza relaxar CHECK/UNIQUE.

## 4. Preflight, drift e preservação

O [preflight read-only](../../../supabase/tests/024_fundacao_preflight_readonly.sql) e o [postflight read-only](../../../supabase/tests/024_fundacao_postflight_readonly.sql) são transações REPEATABLE READ READ ONLY. Não têm criação de objetos, reparo, DML, grants, impersonação ou chamadas de provisionamento. Definições SQL contidas no manifesto JSON são dados de comparação, não comandos executados.

O catálogo esperado é gerado de migrations locais 001–023, com as proteções consolidadas 015–023. Verifica relações/colunas/defaults, FKs/CHECK/UNIQUE, índices, views, policies inclusive Storage, triggers habilitados, hashes e assinaturas de helpers, owners/membership, grants de tabela/coluna, acesso ao schema privado, RLS Storage e configurações dos buckets protegidos. Políticas/objetos adicionais no escopo obrigatório são drift e bloqueiam, sem overwrite automático. **EPI/Assinaturas é opcional:** ausência ou drift de suas relações, views, funções, policies e bucket são ATENÇÃO para a 025, não pré-requisitos da 024. Cada entrada do manifest identifica `optional`, e a presença das duas tabelas conhecidas é registrada mesmo quando ausentes.

A própria migration incorpora a assertiva de catálogo baseline antes do DDL, reduzindo a janela entre preflight e aplicação. A revalidação dos CNPJs ocorre sob lock. A migration é de primeira aplicação, não um rerun idempotente que aceite drift ou reescreva objetos parcialmente existentes; rerun ou instalação parcial deve bloquear para revisão.

Preflight inventaria cada CNPJ e sua forma canônica (sem contatos empresariais), colisões, status e contagem ativa/histórica por empresa; verifica perfis sem Auth/empresa, vínculos de colaboradores/catálogos e documentos/treinamentos/matriz. Gera fingerprints de preservação das tabelas obrigatórias e Storage. Não lista indivíduos. A coleta opcional usa `to_regclass` e `query_to_xml(format(...))`: a query dinâmica de fingerprint só executa depois da existência ser confirmada, com nomes de schema/relação escapados por `%I`. Não há FROM estático de fichas_epi/fichas_epi_itens ou de tabelas opcionais de assinaturas, nem função/objeto auxiliar criado no remoto. Ausência retorna ATENÇÃO textual. Se objeto **obrigatório** estiver ausente e uma consulta não puder executar, o erro SQL equivale a **BLOQUEIO**: parar, salvar o erro e não aplicar a migration.

O ledger de migrations aparece como ATENÇÃO para conferência manual de 015–023: existência da relação, isoladamente, não prova aplicação de cada versão. O catálogo efetivo é comparado independentemente do ledger. Configuração Auth/SMTP/exposed schemas não é comprovada pelo catálogo dessas tabelas; também requer conferência separada, sem alteração nesta fase. Baseline de owner/ACL/definições é deliberadamente estrito; diferenças remotas devem ser revisadas, não corrigidas copiando grants da fixture.

Postflight é para execução **imediata** após eventual aplicação aprovada, antes de qualquer alteração comercial/backfill. Exige zero linhas nas novas estruturas por empresa, endereço novo NULL e fingerprints legados iguais. Usar janela controlada sem alterações concorrentes de negócio para comparar os fingerprints; diferenças exigem investigação.

### Correção após o primeiro preflight remoto incompleto

O usuário informou o erro remoto real `42P01: relation "public.fichas_epi" does not exist`, na linha 136 da primeira versão do preflight, durante o SELECT de preservação. **A ausência de public.fichas_epi está confirmada pelo erro informado**, não por acesso remoto desta execução. Não se presume a presença/ausência de fichas_epi_itens ou do bucket de assinaturas sem inventário.

A causa foi dupla: fingerprints com FROM estático em tabelas opcionais e manifesto/assertiva de baseline que tratavam o legado EPI como obrigatório. A primeira versão não concluiu e não pode ser considerada um preflight aprovado. Não se aplicou 024 para resolver o erro.

Preflight/postflight foram corrigidos integralmente. A revisão abrange tabelas de fichas EPI, tabelas opcionais com nomes EPI/assinaturas, views, funções, policies, índices, triggers e bucket relacionados. Catalog queries usam pg_catalog, sem dereferenciar relações ausentes. A assertiva **gerada** da migration foi alinhada para ignorar BLOQUEIO por ausência/drift exclusivamente opcional; seu DDL comercial permanece igual e não cria/corrige/restaura EPI ou Storage.

Fingerprint de tabela existente continua disponível; tabela ausente recebe `relation ausente no remoto; módulo EPI/Assinaturas fora do escopo da 024; tratar na 025`, com ATENÇÃO. Acrescentou-se fingerprint do catálogo opcional e markers de presença, incluindo views/functions/policies/bucket. **Ausente → ausente é preservação válida; aparecimento/desaparecimento ou alteração entre pre/post deve bloquear a comparação de preservação**, embora um snapshot isolado classifique o módulo como opcional. Não esconder essa transição tornando o módulo obrigatório.

O comparador offline `supabase/tests/024_compare_preservation.mjs` compara os result sets salvos e retorna BLOQUEIO/exit code 1 se houver divergência ou exportação sem fingerprints. Assim a futura 024 não pode criar EPI acidentalmente sem ser detectada no postflight comparado ao preflight. Nenhuma criação/restauração/alteração remota de EPI/assinaturas ou outro objeto foi realizada nesta correção; nenhum comando remoto foi executado pelo agente.

### Auditor remoto consolidado — SQL Editor mostra apenas o último result set

Depois da correção EPI, o usuário informou que o preflight remoto atualizado executou sem erro, mas o SQL Editor exibiu somente o último SELECT: `Preservação: catálogo opcional EPI/Assinaturas`, fingerprint `0619a14c6ee95f0544d4c70ef517eff0`, STATUS ATENÇÃO. Esse resultado isolado **não comprova os demais checks nem ausência de bloqueios**. Nenhuma conclusão de aprovação remota foi inferida.

Foi criado `supabase/tests/024_fundacao_preflight_consolidado_readonly.sql`, com BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY, um único SELECT operacional final e COMMIT. O script deriva diretamente dos 16 SELECTs do preflight original, encapsulados em CTEs, mantendo resultados e expressões de status. Não cria funções/tabelas temporárias, não altera grants/schema/dados, não executa a 024 nem postflight. O original permaneceu byte a byte intacto, com SHA-256 `43b77781dd34a8a2ae405ea4125712f3e7a4312f9d58571e3b534da83e796465`, registrado no consolidado.

Colunas finais: ORDEM, CATEGORIA, CHECK, RESULTADO, STATUS e DETALHES (JSON). Todas as categorias do original aparecem no mesmo resultado: contrato/schema, policies/grants/functions/triggers/constraints/índices/views, Storage e EPI opcional, CNPJ/colisões, empresas/contagens agregadas, integridade tenant, auditor/papéis/Auth, ledger/pendências/configuração/backfill e todos os fingerprints. DETALHES inclui catálogo esperado e remoto em cada check de contrato, permitindo localizar a divergência exata; inventários mostram somente IDs empresariais, CNPJs/validade, agregados e configuração técnica, sem CPF/nomes/e-mails de pessoas.

Quando o SELECT original de colisões não retorna linhas, o consolidado inclui uma linha informativa OK com quantidade zero. Isso não muda nenhuma regra de bloqueio. Ausência/drift de EPI continua ATENÇÃO, sem criação/restauração. Ao final do **mesmo result set**, os quatro resumos são TOTAL_OK, TOTAL_ATENCOES, TOTAL_BLOQUEIOS e RESULTADO_FINAL, nessa ordem. As contagens consideram somente os checks, excluindo o próprio resumo. ATENÇÃO nunca incrementa TOTAL_BLOQUEIOS. Resultado final exato: **APROVADO PARA REVISÃO** se zero bloqueios, ou **REPROVADO — NÃO APLICAR 024** se houver algum. “Aprovado para revisão” não autoriza aplicação.

#### Testes desta entrega do consolidado

Executado localmente `npm run test:preflight024`: **6 testes aprovados, zero falhas, zero skips**. Foram testados: único result set operacional e seis colunas, READ ONLY/três statements/ausência de DDL e DML, equivalência dos checks originais, presença de todas as categorias/fingerprints, totais e ordenação final, ATENÇÃO sem bloqueio, EPI presente/ausente, preservação dos dados, não exposição de dados pessoais e reprovação por CNPJ inválido/colisão/policy obrigatória alterada. O check causador e os detalhes esperado/remoto foram verificados.

Evidência: `fundacao-024-consolidado-local.json`; log local: `fundacao-024-consolidado-tests.log` (ignorado pelo Git). EPI presente: **439 linhas, 336 OK, 99 ATENÇÃO, 0 BLOQUEIO**; EPI ausente: **438 linhas, 336 OK, 98 ATENÇÃO, 0 BLOQUEIO**. Ambos terminam em APROVADO PARA REVISÃO. Estes são resultados sintéticos locais, não resultados remotos. Não foram reexecutadas suites que executam postflight nesta entrega; a suíte afetada do consolidado foi executada isoladamente.

Arquivos criados nesta entrega: o SQL consolidado, `024_consolidado_generate.mjs` (gerador local de texto, sem banco), `fundacao_024_consolidado.test.mjs` e o JSON de evidência. Alterados: `supabase/tests/package.json` para registrar a nova suíte e `test:preflight024`, e este relatório. O preflight original, postflight, migration 024, manifests e demais contratos não foram alterados.

Reprodução local: em `supabase/tests`, executar `node 024_consolidado_generate.mjs` e `npm run test:preflight024`. O gerador escreve somente o consolidado e não regenera original/migration/manifests.

#### Instrução exata para homologação remota do consolidado

1. No Supabase do projeto correto, abrir **SQL Editor → New query**, usando o auditor integral autorizado.
2. Abrir o arquivo atualizado `supabase/tests/024_fundacao_preflight_consolidado_readonly.sql` e copiar **todo** seu conteúdo, incluindo BEGIN e COMMIT. Colar na nova query; não adicionar migration/postflight ou comandos de alteração.
3. Executar o arquivo inteiro. A única grade operacional deve conter ORDEM/CATEGORIA/CHECK/RESULTADO/STATUS/DETALHES. Exportar **todas as linhas**, sem filtro/paginação truncada, em CSV ou JSON; conferir as últimas quatro linhas TOTAL_OK, TOTAL_ATENCOES, TOTAL_BLOQUEIOS e RESULTADO_FINAL.
4. Enviar/exportar o resultado integral para revisão. Qualquer BLOQUEIO permanece identificável pelo CHECK e DETALHES; erro SQL ou resultado incompleto também impede concluir a auditoria. ATENÇÃO EPI não é bloqueio da 024. **Parar após a coleta: não aplicar 024, não executar postflight, não corrigir objetos ou dados.**

Nenhuma execução remota foi realizada pelo agente, nenhuma configuração/banco remoto alterado, nenhum commit/push realizado nesta entrega.

### Resultado local/sintético

Evidência: [fundacao-024-local-audit.json](fundacao-024-local-audit.json).

| Execução local | Resultados | BLOQUEIO | ATENÇÃO |
|---|---:|---:|---:|
| Preflight baseline com EPI presente | 434 | 0 | 99 |
| Postflight local com EPI presente | 608 | 0 | 99 |
| Preflight baseline com EPI ausente | 433 | 0 | 98 |
| Postflight local com EPI ausente | 607 | 0 | 98 |
| CNPJ inválido sintético | — | 1 esperado | — |
| Máscara inesperada sintética | — | 1 esperado | — |
| Colisão canônica sintética | — | 1 esperado | — |

As atenções incluem entradas individuais do catálogo **opcional** EPI, fingerprints para comparação, inventário agregado/buckets, ledger/configuração a confirmar e ausência de autorização de backfill. Não são 99 bugs. A fixture sem EPI também concluiu pre/post com zero bloqueios e comparação “ausente → ausente” aprovada; contagens detalhadas constam do JSON de evidência. Os fingerprints pré/pós foram idênticos; empresa_comercial/empresa_features/empresa_limites/empresa_uso/diagnóstico/auditoria/onboarding permaneceram com zero linhas. As migrations falharam atomicamente nos cenários negativos de CNPJ, com dados originais preservados. Drift de policies/RLS/buckets **obrigatórios** e relação 024 inesperada continuam bloqueando. Transições de EPI, policies, views e tabela de assinaturas são detectadas na comparação, sem transformá-las em pré-requisitos.

## 5. Testes da fundação e correção EPI (execuções anteriores)

| Suíte | Executados e aprovados | Falhas | Pendentes/skip |
|---|---:|---:|---:|
| SQL/RLS completa (`npm test` em supabase/tests) | 471 | 0 | 1 |
| Backend (`.venv/Scripts/python.exe -m pytest`) | 430 | 0 | 0 |
| Frontend (`npm test`) | 195 | 0 | 0 |
| **Total** | **1.096** | **0** | **1** |

São **1.097 testes registrados** no conjunto das evidências da fase. A suíte específica da 024 tem agora 55 testes: 54 aprovados e um skip de integração concorrente real, incluídos no total SQL acima. **Nesta correção foram reexecutadas as suítes SQL/RLS afetadas, inclusive a suíte completa; backend/frontend não mudaram e seus resultados acima são da execução anterior da fase**, não uma nova execução nesta correção. Backend emitiu um aviso de depreciação já existente de Starlette/httpx; sem falha.

Logs locais: `fundacao-024-sql-tests.log`, `fundacao-024-backend-tests.log`, `fundacao-024-frontend-tests.log` neste diretório (arquivos de evidência local ignorados pelo Git). Suite SQL verifica inclusive que os bytes/hash de 015–023 são preservados e o conteúdo continua igual ao commit base, tolerando apenas diferença de newline de checkout na comparação Git. `git diff --check` também passou.

Cobertura nova: absent/unknown/OFF, concessão explícita, isolamento de tenant, conta inativa/suspensa, Admin sem ganho operacional nos módulos remediados, proibição de escrita de features/limites/uso/plano/origem, diagnóstico consistente/autoria, quantidade declarada sem efeito em quota/documentos, endereços legados e autorização, CNPJ/DV/zeros/letras/case/colisão/imutabilidade, ilimitado explícito e rejeição de redução, auditoria append-only/status/ator, persistência privada/idempotente, rollback de migration, leitura de pre/post sem efeitos e preservação dos contratos antigos. Testes explicitamente confirmam que EPI/assinaturas legados não foram corrigidos silenciosamente e que quota de colaboradores ainda não foi adicionada.

### Concorrência real — teste preparado, validação pendente

PGlite tem um único backend e não comprova corrida entre duas conexões PostgreSQL. O ambiente não possui psql/servidor PostgreSQL local disponível; Docker existe como cliente, mas o daemon não está iniciado. Não foi instalado/iniciado serviço externo nem contornado isso usando banco remoto.

[fundacao_024_concurrency.test.mjs](../../../supabase/tests/fundacao_024_concurrency.test.mjs) prepara duas conexões reais via psql para disputa de CNPJ numérico e alfanumérico equivalentes. Usa os helpers da migration e as mesmas constraints canônicas em schema sintético temporário. Exige banco descartável com nome `engmarq_024_*`, DSN loopback sem opções de redirecionamento, e remove apenas seu próprio schema gerado. Não é teste de quota, Auth ou full Supabase. Sem configuração local ele fica explicitamente skipped, não “aprovado”. A garantia do índice UNIQUE é parte da implementação; a execução concorrente real ainda precisa acontecer antes da aplicação remota.

Quando houver PostgreSQL local descartável e psql no PATH:

```powershell
Set-Location -LiteralPath 'C:\Users\natap\OneDrive\Documentos\GitHub Pessoal e testes\Plataforma Engmarq\supabase\tests'
$env:CNPJ24_LOCAL_TEST_DSN = 'postgresql://USUARIO:SENHA@127.0.0.1:5432/engmarq_024_test'
node --test fundacao_024_concurrency.test.mjs
Remove-Item Env:CNPJ24_LOCAL_TEST_DSN
```

Substituir credenciais locais; caracteres especiais do DSN precisam de codificação URL. Esse comando somente testa e não aplica 024 no projeto remoto.

## 6. Arquivos criados/modificados

Criados nesta fase:

- `supabase/migrations/024_fundacao_comercial.sql`.
- `supabase/tests/024_fundacao_preflight_readonly.sql` e `024_fundacao_postflight_readonly.sql`.
- `supabase/tests/024-catalog.mjs`, `024_contract_generate.mjs`, `024_local_audit.mjs`.
- `supabase/tests/024_compare_preservation.mjs`: novo comparador offline de resultados exportados.
- `supabase/tests/fundacao-fixture.mjs`, `fundacao_024.test.mjs`, `fundacao_024_concurrency.test.mjs`.
- `docs/audits/2026-10-03/expected-024-preflight-catalog.json`, `expected-024-postflight-catalog.json`.
- `docs/audits/2026-10-03/fundacao-024-migrations-015-023-sha256.json`, `fundacao-024-local-audit.json` e este relatório.
- Logs locais das suítes (ignorados pelo Git).

Modificado: `supabase/tests/package.json`, apenas para incluir os dois arquivos de testes novos. O relatório de diagnóstico anterior continua untracked desde a primeira etapa e não foi reescrito. Nenhum outro arquivo de produção foi modificado.

Nesta **correção do preflight**, foram atualizados: `024-catalog.mjs`, `024_contract_generate.mjs`, `024_local_audit.mjs`, `fundacao-fixture.mjs`, `fundacao_024.test.mjs`, os dois SQL read-only, os dois manifests esperados, o JSON de auditoria local, este relatório e exclusivamente a assertiva gerada de baseline em `024_fundacao_comercial.sql`. Foi criado `024_compare_preservation.mjs`. O package.json conserva apenas a alteração anterior da fundação; não precisou de ajuste adicional. Logs locais da suíte SQL foram regravados como evidência.

Reprodução local, sem env/aplicação remota:

```powershell
Set-Location -LiteralPath 'C:\Users\natap\OneDrive\Documentos\GitHub Pessoal e testes\Plataforma Engmarq\supabase\tests'
node 024_contract_generate.mjs
node 024_local_audit.mjs
npm test
```

O gerador escreve somente os artefatos 024 a partir da fixture sintética. Não deve ser usado para “aceitar” drift remoto sem análise; nunca executa consultas remotas nem lê .env.

## 7. Instruções exatas para o preflight remoto somente leitura

**Não executar a migration nesta etapa.** O próximo passo autorizado aqui é apenas preparar as instruções. A execução remota deve ocorrer em etapa separada, com revisão dos resultados e autorização do usuário antes de qualquer aplicação.

1. Entrar no dashboard Supabase e selecionar explicitamente o projeto correto da Plataforma EngMarq Solution; abrir **SQL Editor**, nova query. Usar o auditor integral autorizado com bypass RLS (normalmente postgres), nunca um JWT tenant.
2. Abrir localmente `supabase/tests/024_fundacao_preflight_readonly.sql`. Copiar o arquivo **inteiro**, incluindo BEGIN READ ONLY e COMMIT, para a query. Não colar a migration 024 nem modificar os resultados esperados para eliminar avisos.
3. Executar o arquivo completo uma única vez. Salvar **todos os result sets**, inclusive catálogo, CNPJ/canonicalização/colisões, contagens por empresa, vínculos, atenções, buckets e fingerprints. Se o editor não conservar múltiplos result sets, exportar os resultados por blocos dentro da mesma transação/sessão ou usar o executor SQL de leitura autorizado; não considerar só o último SELECT como preflight completo.
   Reexecutar usando a **nova versão completa** do arquivo; não reaproveitar a execução incompleta que falhou em fichas_epi. A ausência EPI deve aparecer como ATENÇÃO, não erro SQL/BLOQUEIO.
4. Qualquer linha `STATUS = BLOQUEIO`, erro SQL, objeto ausente, ACL/owner inesperado ou leitura filtrada impede aplicação. Nenhum dado será corrigido pelo script. Encaminhar resultados/erros para análise, preservando o acesso restrito ao inventário.
5. Revisar todas as ATENÇÃO: ledger de 015–023, configuração Auth/schema privado, baseline de ACL/owners, EPI pendente, fingerprints e inventário para futuras concessões/limites. Não realizar backfill nesta autorização. Valores incompatíveis de CNPJ precisam de saneamento explícito separado e novo preflight, sem merge/deleção silenciosa.
6. Somente após análise, concorrência local real validada e **nova autorização expressa** poderá ser planejada a aplicação. Não aplicar 025/026, ativar signup nem conceder Free por consequência do preflight.

Se futuramente a 024 for aplicada com autorização, o postflight correspondente é `supabase/tests/024_fundacao_postflight_readonly.sql`, completo e imediato. Comparar fingerprints com o preflight salvo e verificar zero backfill. A presente entrega não executa nem autoriza esse passo remoto.

Para comparação offline futura, salvar os resultados completos de cada etapa como arrays JSON de linhas (ou arrays de arrays), incluindo as colunas CHECK/RESULTADO/STATUS dos fingerprints. Dentro de `supabase/tests`, executar:

```powershell
node 024_compare_preservation.mjs 'CAMINHO\preflight-completo.json' 'CAMINHO\postflight-completo.json'
```

O comparador não consulta banco e aceita ausência preservada. Não rodar postflight remoto agora: 024 permanece não aplicada. Para **refazer somente o preflight remoto**, abrir SQL Editor do projeto correto, nova query com auditor integral, colar e executar **todo** `supabase/tests/024_fundacao_preflight_readonly.sql` atualizado, salvar todos os resultados e parar para revisão. Não executar migration, não criar fichas_epi, não restaurar migrations EPI e não alterar o banco.

## 8. Riscos e bloqueadores futuros

| Item | Tratamento |
|---|---|
| Drift remoto desconhecido e CNPJs existentes | Preflight remoto preparado, ainda não executado; qualquer conflito bloqueia |
| Concorrência real de CNPJ | Teste local opt-in preparado, execução pendente por ausência de servidor/psql |
| Contratos frontend/backend de CNPJ/endereço/erros | Atualização coordenada necessária para adoção da base; nenhuma UX nova disponibilizada |
| EPI/assinaturas com Admin global/active/status legados | Bloqueador da 025; intocados nesta fase |
| Features sem gates nos módulos | 025 precisa aplicar todas as superfícies; não liberar novo Free até conclusão |
| Counter ainda sem manutenção/quota | Backfill explícito aprovado e trigger/lock protocol da 025; ausência não significa ilimitado |
| Arquivos ASO/documento compartilhados | Classificação e proteção na 026; nenhum objeto movido/excluído |
| Último empresa/gestor ativo | Proteção transacional e recuperação reservadas à etapa de enforcement |
| Planos/titularidade e correção de CNPJ | Metadados preparados; não constituem prova de titularidade nem autorização operacional; correção futura exige fluxo auditado |
| Antispam e confirmação de e-mail | Fase futura de signup; dashboard remoto não foi acessado ou alterado |

**Parada obrigatória cumprida:** nenhuma execução remota, commit ou push. Nenhuma empresa existente recebeu Free. Nenhum signup/CTA/bootstrap foi introduzido na aplicação; o estado remoto do toggle de Auth não foi consultado e não se presume a partir do código. A 024 permanece um artefato para revisão e posterior preflight autorizado.
