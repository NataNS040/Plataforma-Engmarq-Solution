# Correção cadastral pré-024 — execução manual

Preparado localmente. Nenhum SQL remoto executado, nenhuma migration aplicada,
nenhum commit/push e nenhum trabalho da 025. A empresa tem uso operacional e
deve ser preservada com o mesmo ID.

- Empresa: `5c114b79-bbd1-4829-b6ac-42da9f7362c0`.
- Razão social esperada: `EngMarq Solucoes em Engenharia`.
- CNPJ antigo exigido: `12.345.678/0001-99`.
- CNPJ novo autorizado: `60.545.359/0001-76`.
- Canônico: `60545359000176`.

A validação local foi feita primeiro pela CTE equivalente de `024-catalog.mjs`
e confirmada pelos corpos exatos de `cnpj_canonico`/`cnpj_valido` extraídos da
024 em um schema sintético descartável. A migration 024 não foi aplicada.
Ambas as implementações aceitaram o CNPJ novo; a implementação exata rejeitou
o antigo. Ausência de colisão REMOTA ainda não foi confirmada: preflight e
transação de remediação a verificam, inclusive para representação compacta.

## Ordem exata

Executar cada arquivo **inteiro**, no SQL Editor com auditor privilegiado.
Não executar os scripts JavaScript abaixo no Supabase.

1. `supabase/tests/024_cnpj_remediation_preflight_readonly.sql`.
   Exigir `RESULTADO_FINAL = APROVADO_PARA_REMEDIACAO`, sem BLOQUEIO.
   Salvar/exportar todas as linhas. Copiar o objeto JSON **inteiro** da coluna
   DETALHES da linha `CHECK = BASELINE_POSTFLIGHT`.
2. `supabase/tests/024_cnpj_remediation.sql`.
   Um único UPDATE, exclusivamente em empresas.cnpj, filtrado por ID, CNPJ antigo
   e razão social. Exigir execução concluída com COMMIT e sem erro.
   É propositalmente não idempotente: uma segunda execução aborta pelo CNPJ antigo.
   Se houver qualquer erro, parar e executar ROLLBACK caso a sessão permaneça
   em transação abortada; não avançar para a 024.
3. `supabase/tests/024_cnpj_remediation_postflight_readonly.sql`.
   **Antes de executar**, preencher a CTE `baseline_expected`: substituir
   `SELECT NULL::jsonb /* BASELINE_PREFLIGHT */ AS hashes` pelo SELECT abaixo,
   trocando o texto COLE_AQUI pelo objeto JSON completo obtido no passo 1:

   ```sql
   SELECT $baseline$COLE_AQUI_O_JSON_COMPLETO_DE_DETALHES$baseline$::jsonb AS hashes
   ```

   Não copiar as outras colunas nem abreviar o JSON. A delimitadora `$baseline$`
   deve não ocorrer no conteúdo copiado. O placeholder NULL não é uma baseline
   válida: o arquivo sem preenchimento retorna REMEDIACAO_REPROVADA.
   Exigir `RESULTADO_FINAL = REMEDIACAO_OK`, sem BLOQUEIO, e
   `FINGERPRINTS_PRESERVADOS = todos preservados`.
4. `supabase/tests/024_fundacao_preflight_consolidado_readonly.sql`.
   Reavaliar o resultado completo da Fundação. Não aplicar a migration 024
   automaticamente, mesmo se o preflight estiver aprovado para revisão.

## Proteções e limites

Pre/post são transações REPEATABLE READ READ ONLY com um único result set e as
colunas ORDEM, CATEGORIA, CHECK, RESULTADO, STATUS, DETALHES.
Contagens exigidas conforme inventário informado: 1 perfil, 1 colaborador total
e ativo, 1 função, 1 setor, 1 documento, 1 ASO (subconjunto do documento),
1 objeto com prefixo da empresa e esse mesmo objeto no bucket documentos.
Qualquer discrepância bloqueia o preflight e aborta a remediação.

A remediação usa READ COMMITTED e lock SHARE ROW EXCLUSIVE em empresas antes de
consultar o alvo/colisões. O lock serializa escritores de empresas e permanece
até o COMMIT; READ COMMITTED evita consultar um snapshot antigo após esperar
um escritor anterior. A transação verifica ROW_COUNT=1, CNPJ final, demais
campos da empresa, contagens, FKs e fingerprints, abortando diante de falha.
Não desabilita triggers, RLS, constraints nem altera privilégios.

Fingerprints cobrem tabelas existentes em public, engmarq_private, auth e storage,
inclusive inesperadas. Excluem apenas o campo cnpj da empresa alvo; CNPJ de
outras empresas, IDs, conteúdo operacional, Auth e Storage continuam protegidos.
Isso permite rejeitar alteração/remoção/substituição mesmo com contagem igual.
Só hashes e contagens são exibidos, sem CPF, contatos, URLs ou conteúdo.
O postflight compara os fingerprints automaticamente com a baseline informada.
Atividade concorrente legítima nesses schemas entre as etapas pode causar
reprovação conservadora e exige revisão; não se deve substituir a baseline por
um snapshot posterior para forçar aprovação.

As FKs declaradas desses schemas são verificadas por anti-join, com tratamento
de MATCH SIMPLE/FULL, e exigidas como validadas. Isso pode apontar problema
preexistente fora do tenant: revisar, sem corrigir automaticamente nesta tarefa.
Dados externos ao banco ou arquivos físicos fora dos registros Storage não
fazem parte da comparação. Nenhum dado operacional é alterado pelos scripts.

## Arquivos locais de apoio e testes

- `supabase/tests/024_cnpj_remediation_validate.mjs`: validação equivalente local.
- `supabase/tests/024_cnpj_remediation_generate.mjs`: geração dos três SQLs;
  valida o CNPJ antes de escrever o arquivo de UPDATE.
- `supabase/tests/024_cnpj_remediation.test.mjs`: suíte exclusiva dessa remediação.
- `docs/audits/2026-10-04/cnpj-remediation-tests.log`: resultado final dos testes.

Comando: `node --test supabase/tests/024_cnpj_remediation.test.mjs`.
Resultado final: **15 testes aprovados, 0 falhas, 0 pulados**.
Cobertura: helpers exatos/equivalentes, canônico, escopo estático do único UPDATE,
transação bem-sucedida com preservação de todas as outras linhas, CNPJ antigo
inesperado, novo inválido, canônico inesperado, colisão mascarada/compacta,
contagens divergentes, alvo ausente, role sem privilégio, zero linhas afetadas,
rollback de efeitos colaterais em empresa/Storage, remoção operacional,
corrupção de FK, baseline ausente e alteração operacional com mesma contagem.

As únicas inserções/exclusões/DDL presentes no código de teste são preparação
ou simulação de falhas em PGlite local descartável. Os SQLs operacionais não
contêm INSERT/DELETE/DDL e a remediação contém exatamente um UPDATE de cnpj.
