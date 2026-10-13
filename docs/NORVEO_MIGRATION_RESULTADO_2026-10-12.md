# Instalação controlada — resultado de 12/10/2026

**Migration aplicada e postflight aprovado. Os cinco testes autenticados foram confirmados pelo operador em 13/10/2026.** Na rodada da migration não houve deploy, commit/push, restart/substituição de containers, habilitação de convites/CAPTCHA/signup, email Brevo, login automatizado, alteração de senha/credencial ou restauração em produção.

## Antes da aplicação

Última leitura comparou o estado com o ponto restaurado `engmarq_post025a_20261012_230657`: 59 tabelas sem mudança, 871 entradas de catálogo iguais, manifestos original/restore válidos. Preflight homologado passou em transação somente leitura/rollback.

Na VPS: imagem/runtime, IDs/StartedAt, Config/HostConfig e hashes dos arquivos Compose/Caddy/backend.env/compose.env iguais ao conjunto `/root/norveo-recovery-20261012_020841`. API healthy, criação interna false. Manifesto de imagem/configurações preservadas válido. Cópia local `norveo_recovery_20261012_230841`, incluindo manifesto complementar, disponível e íntegra. Frontend commit gh-pages `5b87e76f1367a20dd682d830dbc5a6530091301d`, main `8f342e932e3e9708509f11a802baa4e0d71e1bdb`, todos os 8 arquivos HTTP iguais. Nenhuma divergência relevante observada.

## Aplicação

Executada somente `supabase/pending/public_company_signup.sql`, SHA256 **cfe94a0de30925d4dd95eb95eb68453286cf58295f000cd2b2226f212bcba97b**, conferido antes e depois. Contrato gerado/componentes de convite sincronizados. Não aplicada SQL separada de convites, migrations antigas, activate ou close.

psql via serviço protegido do projeto esperado, postgres/origin, `ON_ERROR_STOP=1`, escrita permitida somente para a candidata autorizada. O arquivo contém BEGIN/COMMIT, lock_timeout 5s e statement_timeout 60s. Exit code **0**, **COMMIT confirmado**. Horário de criação do gate: 12/10/2026 **23:23:58 America/Sao_Paulo** (13/10 02:23:58 UTC). Sem falha ou necessidade de rollback. Em erro antes de COMMIT, psql interromperia e a transação seria revertida ao encerrar a conexão; não havia retry automático.

Postflight exato executado imediatamente em BEGIN READ ONLY/ROLLBACK: **aprovado**. Conferiu contrato 025-A preservado e novos corpos de funções, proprietários, search_path, grants/revokes, RLS, policies, triggers e estruturas privadas de admissão/convites. Gate `enabled=false`, singleton presente, review_reference vazio. Nenhuma alteração destrutiva ou migração de limites das empresas existentes.

## Integridade após aplicação

As **59 tabelas existentes** continuam com os mesmos fingerprints do backup imediatamente anterior. Comparação individual inclui a linha da empresa e **14 tabelas com empresa_id**, antes/depois. Os identificadores abaixo são aliases ordenados por ID, sem nome/CNPJ no relatório.

| Empresa | Status preservado | Colaboradores ativos | Perfis | Limite preservado | Integridade |
|---|---|---:|---:|---|---|
| 1 | ativa | 1 | 1 | ilimitado | 14 tabelas e cadastro iguais |
| 2 | ativa | 46 | 1 | ilimitado | 14 tabelas e cadastro iguais |
| 3 | suspensa | 0 | 0 | ilimitado | 14 tabelas e cadastro iguais |

Permanecem **2 usuários Auth**, os mesmos perfis e dados existentes. Zero divergências de uso. Novas tabelas de convites/admissões vazias; somente o gate fechado foi inicializado. Storage: buckets privados e **4 arquivos** relidos por GET autenticado em memória, tamanhos/hashes iguais ao backup. Não foi feito upload, download público ou emissão de link assinado.

## Verificações automatizadas

- RLS diretamente no banco, em transação somente leitura com SET LOCAL ROLE authenticated e claim de identidade existente: empresa vê **1 empresa**, sem perfis/colaboradores de outra empresa; admin vê **3 empresas**. Foram **2 perfis ativos** exercitados. Nenhuma sessão/JWT real foi emitida e nenhuma senha foi usada.
- Anon não tem SELECT em empresas/user_profiles e não obtém acesso por esse caminho. A primeira consulta de contagem recebeu a negação esperada; o teste foi ajustado para distinguir ausência de grant de filtragem RLS. Nenhuma permissão foi alterada para fazer teste passar.
- Postflight comprovou os grants privados e a restrição das RPCs; usuários comuns não ganham execução dos convites privilegiados.
- Auth settings públicos continuam exatamente iguais à captura: **disable_signup=true**, confirmação email obrigatória. Gate SQL **false**. Cadastro permanece fechado nas camadas servidor/Auth; não foi feita chamada signup que pudesse criar identidade ou disparar email.
- Criação interna permanece pausada; backend/frontend publicados continuam os anteriores. Convites da aplicação não foram habilitados. CAPTCHA não foi ativado/configurado; esta consulta não substitui leitura administrativa de sua configuração no provedor.
- API health **200**; `/api/v1/me` sem JWT **401**. Isso não comprova login autenticado pela interface.

## Validação manual e próximo passo

Por preferência explícita do operador, não acessamos sessão, senha ou credenciais de usuário. Os seguintes testes estão **PENDENTES**, e não devem ser tratados como aprovados até confirmação:

1. Login de conta existente.
2. Painel Superadmin.
3. Visualização das três empresas existentes.
4. Isolamento dos dados entre empresas.
5. Documentos e arquivos privados na interface.

O operador foi avisado após os testes automatizados. Em 13/10 confirmou login, Superadmin, três empresas, isolamento e documentos privados aprovados, e autorizou separadamente o deploy fechado. A lista acima registra a pendência no encerramento original da instalação, agora resolvida. Em falha futura, interromper a progressão e diagnosticar somente em leitura; qualquer reparo exige decisão explícita. Não restaurar automaticamente o banco: recuperação integral de Auth/Vault continua não comprovada e escritas pós-backup devem ser reconciliadas.

Depois da confirmação manual, solicitar autorização **separada** para commit/push/deploy da release backend e frontend compatível, ainda com todos os controles fechados, sem abrir convites/CAPTCHA/signup nem fazer SMTP real. Nenhum desses atos está autorizado pela aplicação da migration.

Evidências: `docs/audits/2026-10-12-install-before.json`, `2026-10-12-install-companies-before.json`, `2026-10-12-migration-apply.log`, `2026-10-12-migration-postflight.log` e `2026-10-12-install-after.json`. Verificador pós-instalação: `scripts/verify_norveo_install_readonly.py`. Ponto e limitações de recuperação: `docs/NORVEO_PONTO_RECUPERACAO_2026-10-12.md`.
