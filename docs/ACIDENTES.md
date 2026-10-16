# Acidentes de trabalho — migration 026

Implementação em 16/10/2026, na branch `feat/acidentes`. A migration 026 **não foi aplicada**
em nenhum banco remoto. A aplicação depende das decisões listadas em
[Pendências antes de produção](#pendências-antes-de-produção).

## Modelo e decisões

- **Feature nova `acidentes`.** É concedida só às empresas com `empresa_comercial.origem = 'legado'`,
  no mesmo padrão da 025. O plano gratuito continua com as 7 features atuais, e o contrato
  `count = 7` do cadastro público não muda.
- **Tabela `public.acidentes`.** Segue o modelo da 018:
  - `empresa_id NOT NULL` e FK composta `(empresa_id, colaborador_id)` para colaboradores;
  - policies com `can_access_catalogos` (empresa e gestor escrevem, operacional só lê);
  - guards RESTRICTIVE de feature;
  - grants por coluna;
  - **nenhum DELETE**. O admin comercial não acessa os registros.
- **Autoria vem do servidor.** O trigger `engmarq_private.guard_acidente_write()` grava estes campos;
  o cliente não tem grant em nenhum deles:
  - `criado_por` e `created_at`;
  - `atualizado_por` e `atualizado_em`;
  - `anulado_por` e `anulado_em`.

  O trigger também recusa data futura (dia em `America/Sao_Paulo`) e tenant divergente.
- **Anulação no lugar de exclusão.** O cliente grava só `motivo_anulacao`, numa operação própria
  que não pode alterar outros campos. O trigger carimba quem e quando. Registro anulado fica imutável:
  a policy de UPDATE filtra `anulado_em IS NULL` e o trigger recusa a alteração.
- **Regras do S-2210, verificadas por CHECK:**
  - Tabela 15 como agente causador só para doença;
  - doença não tem hora do acidente nem horas trabalhadas antes;
  - lateralidade exige parte atingida;
  - retorno e dias perdidos só com afastamento, e retorno não pode ser anterior ao acidente;
  - óbito exige data e gravidade `fatal`.

  O backend repete essas regras com mensagens legíveis (422); o banco continua sendo a autoridade.
- **Resumo mensal.** A view `vw_acidentes_resumo` (`security_invoker`) agrega por empresa, mês,
  tipo, gravidade, Pirâmide de Bird, afastamento e CAT, ignorando registros anulados. KPIs e
  pirâmide usam essa view e não baixam todos os acidentes.

## Catálogos eSocial (S-1.3)

O S-2210 usa as tabelas 13, 14, 15 e 17. No leiaute S-1.3 não existe Tabela 16 (ela foi
incorporada à 15).

| Tabela | Conteúdo | Campo em `acidentes` | Códigos |
|---|---|---|---|
| 13 | Parte do corpo atingida | `codigo_parte_atingida` (+ `lateralidade`) | 45 |
| 14 | Agente causador do acidente de trabalho | `codigo_agente_causador` (`agente_tabela = 14`) | 248 |
| 15 | Situação geradora do acidente / agente e situação geradora de doença | `codigo_situacao_geradora`; agente quando doença (`agente_tabela = 15`) | 60 |
| 17 | Descrição da natureza da lesão | `codigo_natureza_lesao` | 29 |

**Fonte única:** `supabase/data/esocial/tabela{13,14,15,17}.tsv`, extraídos do HTML oficial
(`leiautes-esocial-v-s-1-3-nt-07-2026-rev-24-09-2026/tabelas.html`). Cada arquivo traz no
cabeçalho a URL, a versão e o sha256.

**Gerador:** `supabase/tests/026_esocial_generate.mjs` escreve duas saídas a partir dos TSVs:
1. o seed dentro da 026: 382 linhas em `public.esocial_codigos`, cerca de 40 KB. O banco precisa
   delas por causa das FKs `(tabela, codigo)`;
2. `frontend/src/data/esocial.json`: um chunk Vite próprio de cerca de 9 KB compactado, carregado
   sob demanda.

`npm run test:026` roda o gerador em modo `--check`. Se alguém editar o seed ou o JSON à mão, o
teste falha.

**Egress:** não existe rota de catálogo na API. A tela monta os selects e as descrições a partir do
JSON estático (GitHub Pages e cache do navegador). A lista `GET /acidentes` traz só códigos e
colunas curtas; textos longos (`detalhes`, local, autoria) vêm apenas em `GET /acidentes/{id}`,
ao abrir um registro.

**Atualização do leiaute:**
1. Baixar o novo `tabelas.html`.
2. Regenerar os TSVs.
3. Criar uma migration **aditiva** com os códigos novos. Um código descontinuado recebe
   `ativo = false` e nunca é apagado, porque pode estar em acidentes antigos.
4. Rodar `npm run generate:026` (ou o gerador da nova migration) para atualizar o JSON.

## API

| Método | Rota | Papéis |
|---|---|---|
| GET | `/api/v1/acidentes` (lista compacta) | empresa, gestor, operacional |
| GET | `/api/v1/acidentes/resumo` | empresa, gestor, operacional |
| GET | `/api/v1/acidentes/{id}` | empresa, gestor, operacional |
| GET | `/api/v1/colaboradores/{id}/acidentes` | empresa, gestor, operacional |
| POST | `/api/v1/acidentes` | empresa, gestor |
| PATCH | `/api/v1/acidentes/{id}` | empresa, gestor |
| POST | `/api/v1/acidentes/{id}/anular` (`{"motivo": "..."}`) | empresa, gestor |

- Todas as rotas exigem a feature `acidentes`, recusam parâmetros de consulta (422) e respondem
  `Cache-Control: no-store`.
- `empresa_id` e os campos de autoria são recusados no corpo (422).
- Violação de FK ou de CHECK vira 422 com mensagem segura.

## Testes

| Camada | Comando | Cobertura |
|---|---|---|
| SQL (PGlite) | `cd supabase/tests && npm run test:026` | 24 testes: catálogo idêntico aos TSVs, matriz de atores, isolamento entre empresas, autoria, FKs e regras do S-2210, anulação, sem DELETE, feature desligada, resumo, atomicidade, preflight e postflight |
| Backend | `cd backend && python -m pytest tests/test_acidentes.py` | 46 testes |
| Frontend | `cd frontend && npx vitest run tests/acidentes.test.tsx` | 15 testes |

Os scripts `supabase/tests/026_acidentes_preflight_readonly.sql` e
`026_acidentes_postflight_readonly.sql` devolvem uma linha por checagem (`OK` ou `BLOQUEIO`),
para a aplicação manual.

## Pendências antes de produção

1. **Contrato do cadastro público.** Medido localmente: depois da 026, o bloco
   `GENERATED SIGNUP DEPENDENCY CONTRACT` de `pending/public_company_signup_activate.sql` acusa
   **uma única** diferença, `function:engmarq_private.guard_acidente_write()`. Antes da 026 ele
   passa. O pin precisa ser revisado pelo responsável pela 025 antes de abrir o cadastro.
2. **Numeração.** A 026 fica reservada para Acidentes e a 027 para EPI v2, nessa ordem.
3. **Concessão da feature.** Confirmar que as empresas legadas devem receber `acidentes`.
4. **Ordem de aplicação:** preflight, migration via `psql -X -w -v ON_ERROR_STOP=1`, postflight,
   deploy do backend e, por último, deploy do frontend.
