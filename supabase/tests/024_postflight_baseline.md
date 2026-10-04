O `024_fundacao_postflight_readonly.sql` inteiro entrega um único result set,
com todos os checks e quatro linhas de resumo. A última é `RESULTADO_FINAL`.
A transação é `REPEATABLE READ READ ONLY`.

Para comprovar preservação, use os fingerprints exportados do preflight
correspondente deste mesmo banco, capturados antes da aplicação da 024.
Não use evidências sintéticas dos testes como baseline remoto.

Exporte o resultado do `024_fundacao_preflight_consolidado_readonly.sql` como
um array JSON. O formato original também é aceito, desde que contenha todos
os fingerprints. Gere uma cópia pronta para execução manual, somente offline:

```powershell
node supabase/tests/024_postflight_baseline.mjs preflight-real.json postflight-com-baseline.sql
```

O utilitário não conecta ao banco e não sobrescreve arquivo existente.
Alternativamente, substitua `'[]'::jsonb` entre os marcadores
`BEGIN/END PREFLIGHT BASELINE JSON` pelo array JSON exportado, escapando
apóstrofos como `''` dentro do literal SQL.

Baseline fornecido: igualdade exata = OK; fingerprint divergente, ausente,
duplicado ou objeto desaparecido = BLOQUEIO. Isso inclui dados, presença e
catálogo opcional de EPI/Assinaturas. Empresas excluem do fingerprint somente
os campos novos previstos pela 024; endereço e derivação CNPJ têm checks próprios.

Sem baseline (`[]`), fingerprints continuam ATENÇÃO: não há comprovação de
preservação. A regra solicitada para o resumo continua dependente somente de
BLOQUEIO; a mensagem de aprovação não dispensa a revisão das ATENÇÕES.
Os checks de contrato opcional EPI/Assinaturas continuam ATENÇÃO conforme o
contrato real; a comparação de preservação é um check separado e pode bloquear.

Teste local: `npm --prefix supabase/tests run test:postflight024`.
Nenhum destes comandos aplica migrations ao Supabase remoto.
