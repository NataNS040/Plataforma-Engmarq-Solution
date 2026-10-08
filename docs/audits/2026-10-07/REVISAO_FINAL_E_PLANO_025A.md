# Revisão final pré-aplicação — Fundação 025-A

Data: 2026-10-07. **NO-GO — NÃO APLICAR 025-A** nesta etapa. Candidato e concorrência aprovados; preparação de postflight/comparação PRE × POST incompleta. Não houve conexão remota, execução de SQL, apply, postflight, commit ou push nesta revisão. Somente este documento e FREEZE_025A.json foram criados; SQLs preservados.

## A) Freeze

Arquivo candidato: `supabase/migrations/025_entitlements_quota_hardening.sql`.

SHA-256: `6d4d696d14f74edec8d5f94f48e192208a9281d3479625a8043e17d781fbc1c5`.

Igual ao campo migration025_sha256 de `docs/audits/2026-10-05/025-concorrencia-real-resultados.json`: **SIM**. Evidência real PG16.15: 20 pass, zero fail, zero skip. Este freeze não muda a migration. Qualquer alteração posterior de bytes, inclusive line endings, invalida o candidato até nova revisão/homologação apropriada. Não rodar geradores ou editar/copiar com conversão de encoding/CRLF durante o freeze.

## B) Revisão estática

Migration candidata: **PASS**, sem novo defeito identificado. Preparação operacional/postflight: **FAIL**, pelos pontos em J/K.

- BEGIN/COMMIT únicos envolvendo o arquivo completo; lock_timeout 5s, statement_timeout 120s; locks SHARE ROW EXCLUSIVE nas tabelas listadas no início.
- Nenhum DROP TABLE/FUNCTION/EVENT TRIGGER, CASCADE, DELETE de dados ou TRUNCATE executado na aplicação. As palavras DELETE/TRUNCATE em privilégios, triggers e funções são regras de runtime, não limpeza de dados na migration.
- DROP TRIGGER guard_colaborador_write é substituição versionada do guard existente; DROP POLICY dinâmico é quarentena intencional de EPI/Assinaturas, seguida de policy restritiva false. Não são exclusões inesperadas.
- DDL intencional: novas estruturas privadas, predicates/guards, policies restritivas, mapeamentos de documentos/objetos, views security_invoker com gate de relatórios e hardening de grants.
- Não altera linhas existentes de empresas/colaboradores/documentos/treinamentos/Storage/EPI. Escreve manifestos/metadados privados, registros comerciais/features/limites/uso faltantes e auditoria comercial decorrente dos triggers existentes.
- ON CONFLICT DO NOTHING preserva configurações anteriores, inclusive OFF e limites explícitos; preconditions bloqueiam estado parcial comercial sem limite e contador/limite inconsistentes.
- SECURITY DEFINER novos têm search_path vazio, referências qualificadas e EXECUTE restrito. Predicados de entitlement herdados da 024 exigem papel autenticado, tenant, usuário/empresa ativos e feature enabled; admin não recebe capacidade operacional.
- Feature ausente não significa permissão; limite/uso ausentes em runtime abortam. O backfill fornece ilimitado explicitamente somente quando ainda não existe limite.
- Storage não muda bytes, paths, buckets ou public flags. Gates restritivos bloqueiam Assinaturas e verificam namespace/módulos. Objeto não classificado exige **todos** os grants documentos/exames/treinamentos; não é fallback aberto. EPI não é concedido.

## C) Backfill legado

Diretamente no SQL, INSERT de empresa_features exige **comercial_antes IS NULL AND features_antes='[]'** no manifesto do corte. Só então concede exatamente empresa.cadastro, usuarios.gestao, colaboradores.gestao, treinamentos, exames, documentos e relatorios.sst. Não concede epi; empresas com comercial ou features anteriores não recebem features adicionais.

Empresa sem registro comercial recebe origem legado, não plano Free. plano_comercial_id permanece referência opcional sem resolver de plano; a 025 não escreve Free nem cria onboarding público. Configurações anteriores não são substituídas. Cadastro de limite faltante é NULL/ilimitado=true explícito; uso faltante é contagem real de ativos.

Empresas afetadas esperadas: **não quantificáveis com as evidências locais recebidas**. Os totais 941/182/0 e 47 ativos/zero inativos não revelam quais empresas são elegíveis. A lista necessária está nas linhas remotas `Previsão exata: <UUID>` / `Empresa afetada pelo backfill: <UUID>`; exportação completa não localizada. Não presumir elegibilidade de todas as empresas nem reutilizar uma fixture ou o baseline pré-024.

## D) Super Admin

Mantida separação comercial/operacional. is_commercial_admin permite camada comercial; has_empresa_feature exige papel empresa/gestor/operacional, excluindo admin. RLS/guards herdados e gates restritivos não abrem usuários internos, colaboradores, treinamentos, ASO/documentos ou dados individuais ao admin. O próprio profile pode ser consultado como identidade, sem administração operacional. RPC de provisionamento exige service_role técnico e ator interno empresa/gestor ativo; recusa ator/admin e papel admin. service_role não é Super Admin funcional.

## E) Quota

Byte-for-byte é a lógica homologada. Ativos reais consomem quota; inativos permanecem históricos; reativação adiciona consumo. Guard de linha valida contagem real/limite, locks serializam decisões e after-statement atualiza/verifica empresa_uso. Redução abaixo do uso aborta; batch/rollback são atômicos. Manutenção privilegiada multitenant deve prelockar empresas em UUID ascendente; a homologação não autoriza SQL administrativo que ignore esse protocolo. Nenhuma alteração dessa lógica feita.

## F) Sequence

PRE: anon/authenticated/service_role com SELECT, UPDATE e USAGE. POST: clientes sem privilégios; service_role com USAGE apenas. Owner/admin preservado. REVOKE é restrito a public.exames_catalogo_id_seq, sem alteração de default privileges globais. Assertion rejeita privilégios efetivos herdados que sobrevivam. Inserções técnicas SERIAL foram testadas com USAGE; consulta autenticada do catálogo continua sem privilégios na sequence. Resets administrativos devem usar owner/admin.

## G) Infraestrutura externa conhecida

rls_auto_enable()/ensure_rls não são removidos ou alterados. PRE/POST possuem contrato obrigatório de corpo/tokens, assinatura, linguagem, owner, SECURITY DEFINER, path, volatilidade, privilégios efetivos e todos os vínculos/tags/enabled do event trigger. Drift/ausência bloqueiam. O corpo externo conhecido registra falhas sem re-raise; não substitui RLS explícito nem auditoria de estado.

## H) Plano de aplicação manual — condicionado a remover o NO-GO

Não executar agora. Antes de liberar, preencher e validar o postflight com o PRE real e fechar suas lacunas de cobertura em J. Manter evidência de recuperação/backups efetivamente disponível no projeto, sem presumir recurso/PITR habilitado.

1. Conferir SHA-256 do arquivo candidato e freeze. Se diferente, STOP.
2. Preservar exportação completa do preflight remoto aprovado, horário/papel/projeto e lista de elegibilidade/backfill; confirmar que não houve DDL/grants/dados relevantes desde a coleta. Se houver mudanças, coletar novamente o mesmo preflight aprovado, sem mudar seu contrato, e revisar.
3. Preparar a comparação POST **antes** de aplicar: baseline real importado, checks completos e auditoria integral. Coordenar janela curta sem escritas de usuários, API, jobs, Storage ou manutenção, abrangendo PRE atual até POST; locks da migration terminam no COMMIT e não protegem comparação posterior.
4. No SQL Editor do projeto correto, como executor integral autorizado, abrir e executar **somente o arquivo completo** `C:\Users\natap\OneDrive\Documentos\GitHub Pessoal e testes\Plataforma Engmarq\supabase\migrations\025_entitlements_quota_hardening.sql`.
5. Não acrescentar BEGIN/COMMIT, ROLLBACK genérico, outras migrations, seeds, testes ou postflight ao mesmo lote. Não executar seleção parcial e não refazer automaticamente em erro/resposta ambígua.
6. Registrar saída completa, SQLSTATE/erro se existir, timestamps, executor, hash e resposta do SQL Editor. Guardar command tag COMMIT quando fornecida; mensagem genérica de sucesso sozinha não basta se houve erro/cancelamento.
7. Em nova sessão, executar o postflight READ ONLY preparado separadamente. Persistência dos objetos e contrato POST completo confirmados em outra sessão comprovam efeitos já committed. Se resposta de apply for ambígua, verificar estado sem repetir o apply.
8. Comparar PRE × POST com projeções/fingerprints e adições comerciais previstas. Somente zero bloqueios explicados/fechados e dados preservados permitem fechamento 025-A. Git e 025-B continuam etapas separadas.

Preconditions: locks/timeouts; assertion estrutural PRE antes de alterações; hardening específico da sequence com assertion; executor confiável/sem bypass de clientes/schema privado protegido; contador exato/limites suficientes; tenants configurados com limite; buckets privados. **A validação do executor/estado ocorre depois dos REVOKEs da sequence dentro da mesma transação**; em falha esses REVOKEs são revertidos. Não afirmar que todas as preconditions antecedem todo comando de mudança.

## I) Contingência

Antes do COMMIT: erro/timeout/deadlock aborta a transação; não há commit parcial das alterações DDL/dados/grants. Se a sessão permanecer aberta/aborted, encerrar com ROLLBACK nessa sessão e preservar o erro; desconexão também desfaz a transação pendente. COMMIT em transação já aborted não torna as mudanças permanentes. Não executar trecho restante isoladamente.

O arquivo não contém CREATE INDEX CONCURRENTLY, VACUUM ou operação externa não transacional. Não chama nextval/setval durante o apply nem faz upload/remove objetos de Storage. Em geral, PostgreSQL não reverte consumo/setval de sequences: rotinas futuras não devem prometer IDs sem lacunas. Logs/tempo de execução/aleatoriedade não são evidência de rollback de dados. Referências: [transações PostgreSQL](https://www.postgresql.org/docs/16/tutorial-transactions.html), [sequences](https://www.postgresql.org/docs/16/functions-sequence.html).

Depois do COMMIT com postflight bloqueado: preservar arquivo/hash, PRE/POST completos e logs. Classificar divergência como ausência de evidência, drift estrutural/ACL, dados, backfill/comercial, RLS/Storage ou concorrência operacional. Não fazer rollback automático, DROP em massa ou restore de grants antigos. Correção forward ou rollback específico exige identificar o objeto e os dados já produzidos depois do corte.

Impacto inesperado: manter/suspender de forma dirigida as escritas/jobs afetados, preservar dados e evidências, avaliar rota e papel técnico/funcional, verificar estado READ ONLY. Não apagar registros, reativar acesso EPI ou restaurar privilégios cegamente. Se usar backup/restore, sua disponibilidade e escopo precisam ser verificados previamente; não presumimos recuperação automática do projeto.

## J) Postflight revisado

Arquivo existente: `C:\Users\natap\OneDrive\Documentos\GitHub Pessoal e testes\Plataforma Engmarq\supabase\tests\025_fundacao_postflight_readonly.sql`.

Template READ ONLY, BEGIN REPEATABLE READ READ ONLY / WITH-SELECT único / COMMIT. **Não executado nesta etapa.** Valida catálogo estrutural POST, RLS/policies/grants, sequence, event trigger, contador real, limites, legado/configurações anteriores, mapeamentos, manifesto de corte, zero transições durante aplicação, buckets privados, relações tenant de colaboradores e 18 fingerprints operacionais conhecidos.

Pendências objetivas:

1. Baseline embutido é `[]`. Comparações de preservação necessariamente bloqueiam. Não há arquivo remoto manual POST preenchido localizado. Importador `025_postflight_baseline.mjs` pode inserir somente os 18 checks `Preservação:`; não pode preencher valores que não recebemos.
2. O preflight manual coleta `Manifesto operacional`, `Fingerprint adicional`, `BASELINE_COMERCIAL`/linhas comerciais anteriores e verificações tenant/FKs ampliadas. O template POST e importador não consomem essa evidência integral. Precisamos completar a comparação de tabelas opcionais/adicionais, decisões comerciais e relações tenant relevantes, sem exigir igualdade indevida onde a migration cria metadados/auditoria legitimamente.
3. A lista/quantidade de empresas previstas não está disponível para confronto independente com o manifesto do apply. O SQL valida coerência com o manifesto que ele mesmo captura; isso não substitui a lista PRE aprovada pelo operador.
4. O template chama engmarq_private.cnpj_valido diretamente, enquanto o preflight manual calcula CNPJ sem chamar corpo remoto. READ ONLY impede mutações SQL comuns, mas não garante ordem de avaliação do contrato antes dessa chamada. Completar a revisão/parser do POST para evitar chamar corpo alterado/desconhecido e entregar diagnóstico consolidado mesmo em drift.

Somente depois de receber a exportação integral correta será possível gerar/validar o POST manual final. Comando de importação existente, **exemplo condicionado, não executado**: `node 025_postflight_baseline.mjs PRE025_REAL.json 025_postflight_remoto_manual.sql`, dentro de supabase/tests. Importar 18 fingerprints não resolve sozinho os pontos 2–4. Nunca substituir por expected-catalog, fixture ou baseline pré-024.

## K) Riscos realmente pendentes

- Baseline PRE integral/lista de elegibilidade ausentes no workspace e postflight final ainda incompleto.
- Preservação PRE × POST depende de janela sem escritas; sem ela, mudanças legítimas podem divergir fingerprints e o check zero-transições durante aplicação.
- Auth/PostgREST/Storage HTTP real e compatibilidade do backend implantado com RPC de provisionamento/gates não estão homologados por estes 20 testes de PostgreSQL.
- Privilégios mínimos de service_role removem SELECT/UPDATE da sequence; rotinas externas de manutenção com setval devem ser verificadas/usar owner.
- Protocolo de prelock determinístico continua obrigatório na manutenção multitenant; recovery após COMMIT precisa ser específico, com backup efetivamente disponível confirmado.

Não reabrimos concorrência homologada nem tratamos o preflight aprovado como reprovado: o impedimento é preparar/verificar a aplicação e sua comparação posterior.

## L) Veredito

**NO-GO — NÃO APLICAR 025-A**. Freeze/SQL candidato/concorrrência conferem; baseline e postflight completos precisam estar prontos antes da aplicação controlada.

## M) Confirmações

Nenhuma alteração ou conexão remota; 025 não aplicada; 025-B não iniciada; 001–024 intactas; concorrência real continua homologada (20/0/0 PG16.15); nenhum commit/push. Não rodamos SQL, fixtures, geradores, postflight ou suites nesta revisão; não havia mudança de código para retestar. Apenas freeze/documentação locais foram produzidos.
