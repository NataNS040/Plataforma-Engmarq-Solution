# Norveo — convites seguros e backup pós-025-A

Conclusão: fluxo implementado e homologado localmente. Backup atualizado criado por leituras de produção e restaurado efetivamente em ambiente separado sem rede. Nenhuma migration, configuração Auth, publicação de código, abertura de cadastro ou CAPTCHA executada em produção; nenhum commit/push. A autorização foi utilizada para implementação e testes isolados, exportação de backup e ensaio de recuperação.

## Comportamento implementado

Conforme decisão do usuário, convite cria somente acesso à empresa, nunca colaborador nem reserva de quota. Gestor/empresa ativo com usuarios.gestao pode convidar para sua empresa; Superadmin ativo escolhe explicitamente a empresa. Empresa emissora e destino precisam estar ativas, com feature no destino. Papéis de convite permitidos: operacional ou gestor; nunca admin ou empresa por este fluxo. Superadmin permanece criado/administrado pelo procedimento global existente.

O servidor gera capability aleatória de 256 bits. O banco guarda somente SHA-256, email normalizado, empresa, papel, emissor e prazo de 48 horas em tabela privada com RLS sem grants aos clientes. A capability é enviada pelo servidor ao endpoint nativo de convite do Auth; nunca retornada ao convidador. O trigger verifica hash/email/estado/prazo/emissor e vincula o UUID real criado pelo GoTrue. Perfil nasce inativo no tenant determinado no banco. Toda essa vinculação ocorre dentro da transação Auth: erro em identidade/envio desfaz o INSERT e seus efeitos.

Depois do link nativo confirmar email, o convidado define senha na página de aceite e solicita aceite usando sua identidade validada pelo Auth. Aceite/cancelamento bloqueiam a mesma linha; aceite revalida emissor, empresa, email confirmado, papel e tenant, e ativa uma única vez. O convidado não escolhe role/empresa/ator/active. Um trigger adicional impede ativar perfis pendentes/cancelados/expirados por outras rotas, inclusive o gerenciamento existente de usuários. Tokens Auth de contas inativas não concedem acesso à plataforma. Recuperar senha ou editar user_metadata não substitui o aceite.

Cancelamento é permanente para aquele registro e não exclui Auth/perfil; aceite já concluído não é cancelável pelo endpoint de convites. Expiração é validada no servidor e exibida pela listagem. Emails/identidades existentes não são transferidos de empresa, reciclados ou apagados automaticamente. Depois de cancelamento/expiração/falha, reinvitar o mesmo email exige reconciliação controlada; reenvio/renovação automática não foi implementado. Essa decisão evita reaproveitar identidade de outro tenant e duplicar envios de resultado incerto.

Falha ou timeout de envio resulta em failed/pending inativo, sem retry automático e sem apagar uma identidade de criação incerta. A tabela privada permite reconciliação pelo operador; nunca devolver capability/link ou dados de outra empresa em erro.

## Alterações revisáveis

- `supabase/pending/public_company_signup.sql`: candidata ampliada com componente de convites e branch protegido no trigger Auth; gate público ainda nasce fechado. SHA-256 atual: **cfe94a0de30925d4dd95eb95eb68453286cf58295f000cd2b2226f212bcba97b**. Substitui a versão de hash b3faa... homologada na etapa anterior.
- `supabase/pending/user_invitations.sql`: componente embutido na candidata; NÃO executar separadamente. Cria tabela/índice, RPCs somente service_role e guard de perfil. Nenhuma alteração às migrations 001–025-A nem às quotas/limites das empresas existentes.
- Gerador/preflight/postflight/activate atualizados conscientemente: preservam contrato base 024/025-A, reconhecem somente o novo trigger esperado e verificam corpos, ACLs e ownership das novas funções, tabela privada e binding. Nenhuma regeneração para silenciar drift remoto.
- Backend: modelos estritos, serviço e `/api/v1/convites` (criar/listar), `/{id}/cancelar`, `/{id}/aceitar`. Criar/listar/cancelar exigem perfil autorizado; aceitar exige identidade Auth validada mesmo com perfil ainda inativo. Ator não vem do corpo. RPCs de convites não são executáveis por anon/authenticated.
- Frontend: página de gestão `/convites`, link nas configurações para autorizados e página pública de callback `/aceitar-convite?convite=<id>` para sessão Auth e definição de senha. Superadmin informa destino; papel padrão operacional. API valida retorno e não repete escritas automaticamente.
- Controles novos: `USER_INVITATIONS_ENABLED=false` por padrão, `INVITATION_CALLBACK_URL` explícita (HTTPS ou loopback, sem credenciais/query/fragment no valor configurado) e `VITE_USER_INVITATIONS_ENABLED=false`. Nenhum arquivo de configuração de produção foi alterado.

## Homologação executada

Aplicação: stack local já existente `norveo-homolog.local`, PostgreSQL 17.6, GoTrue v2.189.0, PostgREST v14.12, Mailpit v1.22.3, portas somente 127.0.0.1. Schemas/dados exclusivamente sintéticos. Email nativo capturado localmente; allowlist de callback modificada somente no Auth local. APIs reais do backend via TestClient, SDK, RPCs, Auth/REST e mailbox reais, sem mocks nas integrações. Gate público permaneceu fechado durante testes de convite. Candidata anterior foi substituída somente nessa stack sintética, sem alteração dos tenants existentes.

Dez grupos integrados passaram:

1. Envio nativo cria identidade/perfil inativo no tenant correto.
2. Usuário operacional, ator de outro tenant, role admin, aceite/cancelamento por identidade errada, chamada sem JWT e ativação precoce pela rota de usuários são recusados.
3. Link confirma email; aceite único permite /me; replay e cancelamento depois do aceite recusados; email existente retorna conflito sem transferência.
4. Definição de senha e recuperação real por email continuam funcionando. Sessão antiga invalidada pelo Auth após troca de senha foi corretamente renovada no harness.
5. Links de convites cancelados/expirados podem confirmar Auth, mas não ativam perfil nem dão acesso à aplicação.
6. Superadmin convida para outro tenant; empresa gratuita cheia aceita convite de acesso sem aumentar colaboradores; duas inserções simultâneas acima de 100 falham P2502.
7. Dois aceites simultâneos: exatamente um sucesso e um conflito.
8. Emissor revogado bloqueia aceite; corrida cancelar/aceitar termina exclusivamente accepted+ativo ou cancelled+inativo; capability forjada/reutilizada/payload misto e RPC privilegiada direta são recusados.
9. Dois convites simultâneos ao mesmo email produzem uma identidade e um registro; listagem/cancelamento corretos.
10. Empresas existentes e limites ilimitados preservados; postflight exato passou.

Regressões: **477 testes backend**, **228 testes frontend em 25 arquivos**, **27 testes SQL signup** aprovados; typecheck/build frontend e check do contrato aprovados. `git diff --check` sem erro. Avisos remanescentes: depreciação Starlette/httpx e tamanho de bundle. Testes UI são automatizados/SSR; não representam navegação completa em navegador de produção. Envios SMTP externos/templates de domínio e allowlist de produção ainda precisam de homologação em etapa autorizada.

Resultados sanitizados em `docs/audits/2026-10-11/invite-real-local-results.json`; runner `supabase/tests/user_invitations_homolog_local.py`. Logs em `.norveo-homolog.local/`, ignorada por Git. Não contém credenciais de produção; a homologação não reutilizou dados do backup.

Preflight da nova candidata reexecutado em produção apenas como READ ONLY, com proteção adicional default_transaction_read_only=on: BEGIN / DO / DO / ROLLBACK, exit 0. Nenhum DDL/DML remoto. O preflight atual não substitui sua repetição na futura janela de instalação.

## Backup atualizado e restauração comprovada

Conjunto protegido novo, separado da homologação e do backup pré-025-A: **C:\Backups\EngMarq\engmarq_post025a_20261010_235555**. Captura concluída em 10/10/2026 às 23:56:58 -03:00. PostgreSQL cliente 17.11, serviço SSL confirmado do projeto kkjckayiqvlqpdjyoxyv. Somente SELECT/transações READ ONLY, pg_dump e GET dos bytes Storage. Dump completo custom: **610707 bytes**, pg_dump exit 0/stderr vazio, TOC e decodificação integral aprovados. **4 objetos**, **2265208 bytes** de Storage privados exportados; buckets vazios incluídos no manifesto.

15 hashes originais reverificados sem divergência. Fingerprints de todos os dados capturados iguais antes/depois do conjunto; metadados Storage também estáveis. Não existe snapshot atômico compartilhado banco/Storage; estabilidade observada não substitui captura coordenada em uma janela de atualização futura.

ACL restrita a usuário proprietário, SYSTEM e Administradores, fora de Git/OneDrive. Senhas de conexão e API keys usadas apenas em memória para exportação, não copiadas ao restore. O dump contém dados sensíveis de Auth como parte do backup completo e permanece protegido; isso é distinto do ambiente sintético. `credential_exports=false` em status inicial significa ausência de exportação de chaves/senhas de conexão, não ausência de dados Auth no dump.

Restore efetivo em container independente PostgreSQL 17 `norveo-post025-restore-isolated`, `--network none`, sem portas, Auth/SMTP ou acesso a produção. Banco novo template0, roles/memberships sem senhas. Artefatos originais não reescritos nem dump editado. Imagem Supabase exige administrador local e ajuste temporário do owner para criação de event trigger; flag original de postgres restabelecida antes da validação. Qualificação de nomes do catálogo comparada com search_path equivalente à fonte, sem substituir diferenças no JSON.

Evidência final **restore-result.json**:

- pg_restore exit 0, transação única e exit-on-error;
- **59 tabelas** com contagens/fingerprints iguais;
- **871 entradas de catálogo** iguais: estruturas, constraints, índices, funções, owners, RLS, políticas, ACLs e bindings cobertos pelo auditor;
- RLS exercitada com **2 perfis ativos** somente na cópia restaurada: Superadmin vê todas empresas, usuário empresarial vê sua empresa e nenhum perfil de outro tenant;
- **4 arquivos** efetivamente copiados aos caminhos originais bucket/objeto em `restored-storage`, tamanhos e SHA-256 iguais, associados à metadata restaurada;
- container de restore encerrado/removido depois da prova, sem volumes ou serviços da homologação sintética compartilhados.

`status.json` registra o instante anterior ao ensaio (restore_tested=false); a evidência final é `restore-result.json` e `RECOVERY_STATUS.md`. `RESTORE_SHA256SUMS.txt` registra oito artefatos de restore. Tentativas preliminares falharam em autenticação/ownership local e qualificação de nomes; foram diagnosticadas e corrigidas no runner, sem adaptar/excluir dados ou relaxar comparações do conjunto.

Limites da prova: não confirma descriptografia Vault com chaves da plataforma, SMTP externo, secrets/configuração da hospedagem ou restauração integral de um projeto Supabase hospedado. Os bytes Storage foram restaurados em destino protegido e sua metadata no banco; não foi iniciado um serviço Storage com dados reais. RTO operacional completo e RPO zero não foram declarados.

Scripts preparados: `scripts/backup_post025_readonly.py` e `scripts/restore_post025_isolated.py`. O primeiro faz somente leituras de produção e escreve destino protegido; o segundo aceita apenas conjunto post025 no diretório de backups e fixa restore ao Docker local sem rede. Nunca usar backup real na stack de homologação de convites. Não passar credenciais em argumentos/logs. Preservar também o backup pré-025-A.

## Próxima etapa, ainda não autorizada

Antes de instalar: repetir/atualizar backup se houve qualquer escrita relevante desde a captura, conferir hashes e estabilidade, restaurar novo conjunto quando necessário e repetir preflight da candidata com hash congelado. Inventariar versões/configuração Auth e validar callback/template SMTP em destino de teste. Apresentar resultados e obter autorização específica para instalar SOMENTE `public_company_signup.sql`, ainda com gate fechado.

Após uma instalação futura autorizada: postflight, comparação de baseline e smoke dos usuários/empresas existentes; manter convites e cadastro público desativados até autorização própria de abertura. CAPTCHA permanece separado. Em falha, rollback transacional antes de COMMIT; depois, manter controles fechados e reparar de forma dirigida. Restore integral de produção é último recurso, exige autorização específica e reconciliação de dados posteriores ao snapshot.

Referências oficiais: [convite Auth](https://supabase.com/docs/reference/python/auth-admin-inviteuserbyemail), [implementação GoTrue v2.189.0](https://github.com/supabase/auth/blob/v2.189.0/internal/api/invite.go), [backups](https://supabase.com/docs/guides/platform/backups).
