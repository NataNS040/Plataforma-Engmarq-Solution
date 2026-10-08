# Preflight remoto 025-A — execução pendente por falta de acesso SQL

Data de referência: 2026-10-04, America/Sao_Paulo.
HEAD confirmado: `b8e6f3c270254ee37a73acc1c7829aad69fc8d5c`.

## Estado da tarefa

**NÃO EXECUTADO REMOTAMENTE. NÃO APLICAR 025.**

A autorização recebida abrange somente preflight remoto read-only. Nenhuma consulta remota foi executada, nenhuma conexão SQL foi estabelecida e nenhum baseline remoto foi criado. Este documento registra um impedimento de execução; não é saída do preflight e não representa aprovação/reprovação do estado do banco remoto.

## Revisão local de read-only

Arquivo revisado: `supabase/tests/025_fundacao_preflight_readonly.sql`.
Evidência: [REVISAO_READONLY_PREFLIGHT_025.json](REVISAO_READONLY_PREFLIGHT_025.json).

O arquivo possui três statements efetivos: BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; WITH/SELECT consolidado; COMMIT. A análise distingue strings do contrato JSON, identificadores e comentários do SQL executável. Não foram encontrados INSERT, UPDATE, DELETE, MERGE, CREATE, ALTER, DROP, TRUNCATE, GRANT, REVOKE, COMMENT, COPY, CALL, DO, setval, nextval ou advisory locks executáveis. As 18 consultas passadas a query_to_xml são SELECTs estáticos de fingerprints.

Há uma função da aplicação efetivamente invocada: `engmarq_private.cnpj_valido(text)`. O contrato local espera função IMMUTABLE e corpo conhecido; no remoto, volatilidade declarada não basta como prova. Antes da execução integral deve ser inspecionado seu corpo/hash e a canonicalização chamada internamente, via consulta SELECT de pg_proc/pg_namespace/pg_get_functiondef, sem executar essas funções. Ausência, drift de corpo ou efeito mutável impede a execução integral. Essa inspeção remota também não foi possível nesta tarefa.

Portanto: estrutura do SQL local é read-only; verificação das dependências reais e transação remota NÃO executadas. Não se declara read-only remoto comprovado apenas com fixture/contrato esperado.

## Impedimento de acesso

- Nenhum conector SQL/Supabase administrativo está disponível entre as ferramentas da sessão.
- Inventário de navegador não retornou sessão disponível; abertura do navegador in-app falhou por indisponibilidade do recurso.
- Nenhum psql/Supabase CLI foi encontrado no PATH.
- Foram inspecionados somente nomes das configurações locais: existem credenciais de API REST, mas não conexão PostgreSQL administrativa ou token de Management API disponibilizado.
- Credenciais REST não foram usadas para tentar contornar a ausência de SQL administrativo; valores não foram exibidos nem copiados para documentação.

Necessário: disponibilizar canal SQL administrativo autorizado no ambiente ou executar manualmente o preflight read-only e fornecer sua exportação integral. Não enviar credenciais no chat.

## Resultados solicitados

| Item | Estado |
|---|---|
| TOTAL_OK | NÃO APURADO |
| TOTAL_ATENCOES | NÃO APURADO |
| TOTAL_BLOQUEIOS remoto | NÃO APURADO |
| RESULTADO_FINAL remoto | NÃO PRODUZIDO |
| Empresas/elegibilidade/backfill | NÃO INVENTARIADOS |
| Features/comercial/limites/uso | NÃO INVENTARIADOS |
| SECURITY DEFINER/RLS/policies/grants | NÃO INVENTARIADOS |
| Storage/EPI/Assinaturas | NÃO INVENTARIADOS |
| CNPJ/empresa EngMarq/integridade tenant | NÃO VALIDADO |
| Baseline REAL PRÉ-025 | NÃO OBTIDO |
| Fingerprints reais capturados | 0 |

Bloqueio de execução individual: ausência de canal SQL administrativo acessível. Não foi observado nem presumido nenhum bloqueio de dados/policies do banco remoto.

## Cobertura a conferir antes da execução manual

O preflight existente contém 18 fingerprints operacionais que devem ser exportados diretamente do remoto pré-025. Nenhum arquivo de fingerprints foi criado nesta tarefa para evitar confusão com baseline real. Os JSONs expected-025 continuam expectativas estruturais sintéticas e não podem substituí-lo.

Também há diferenças entre a apresentação atual do auditor e a solicitação: o texto de RESULTADO_FINAL existente é “APROVADO PARA REVISÃO — NÃO AUTORIZA EXPOSIÇÃO PÚBLICA” / “REPROVADO — 025 NÃO VALIDADA”, em vez das frases exatas solicitadas. O inventário existente cobre buckets conhecidos, mas não lista todos os buckets inesperados; não apresenta EXECUTE PUBLIC nem todos os grantees individualmente; não exibe contagem de colaboradores inativos; e a verificação explícita de dados cross-tenant cobre colaboradores/catálogos, sem todos os cruzamentos de documentos/treinamentos/profiles solicitados. Contrato estrutural cobre constraints, mas não substitui os inventários de dados adicionais.

Não houve alteração silenciosa do preflight nem execução de um auditor incompleto com declaração de cobertura integral. Essas lacunas devem ser cobertas por SELECTs suplementares revisados ou revisão local do auditor antes da execução solicitada. O GO anterior para revisão read-only não é evidência de execução nem de homologação dessas coberturas adicionais.

## Recomendação e confirmações

**NÃO APLICAR 025.** Falta preflight remoto efetivamente executado e baseline real; a concorrência permanece **DEFERIDO — PostgreSQL real ainda não homologado**.

Migration 025 NÃO aplicada; postflight NÃO executado; nenhum dado remoto alterado; nenhum hardening/remediação/backfill executado; nenhum commit; nenhum push; 025-B não iniciada. Arquivos alterados nesta tarefa limitam-se à documentação/evidência local de revisão e impedimento.
