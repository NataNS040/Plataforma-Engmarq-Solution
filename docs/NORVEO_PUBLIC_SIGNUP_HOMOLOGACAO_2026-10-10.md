# Cadastro público Norveo — homologação isolada

Resultado: provisionamento gratuito, fluxo interno, confirmação, recuperação, RLS e quota aprovados nos cenários executados. Convites legítimos não estão implementados/homologados; a API direta de convite sem admissão foi recusada corretamente. Não considerar o requisito de convites concluído nem liberar produção com base neste relatório.

Nenhuma conexão, leitura de credenciais/backup, escrita ou configuração do Supabase de produção nesta rodada. Nenhum deploy, commit ou push. Cadastro e CAPTCHA de produção não alterados. O gate foi aberto somente na stack local para testes sintéticos, fechado ao final e os serviços locais foram encerrados preservando os volumes.

## Ambiente e limites da prova

Docker Desktop local, endpoint fixado `npipe:////./pipe/dockerDesktopLinuxEngine`; projeto independente `norveo-homolog.local`, sem vínculo remoto. CLI usado para stack: 2.103.0. PostgreSQL local 17.6 (imagem 17.6.1.132), GoTrue v2.189.0, PostgREST v14.12 e Mailpit v1.22.3. Rede norveo-homolog-local. Portas finais 54321/54322/54324 restritas a 127.0.0.1; APIs acessadas exclusivamente por loopback. O CLI inicialmente publicou em todas as interfaces apesar da opção de rede; isso foi detectado e corrigido antes de criar usuários/instalar candidata, recriando somente os três containers descartáveis com bind explícito loopback e preservando volumes. Não reexecutar supabase start sem revalidar binds.

Somente dados sintéticos e senhas/chaves locais. Emails em example.com capturados no Mailpit, sem SMTP externo. Perfis e empresas reconstruídos pelos fixtures versionados, migrations 001–025-A executadas em fonte sintética PostgreSQL 16 e schemas public/engmarq_private transferidos para PostgreSQL 17 preservando Auth real. Nenhum dump de produção utilizado. Auth fixture simplificado não substituiu auth.users real. Event trigger global ensure_rls foi reconstruído no fixture, pois dump por schema o omite.

A transferência inicial herdou grants mais amplos dos defaults da stack local: preflight recusou antes de instalar. Corrigida a carga sintética para preservar ACLs da fonte, sem mudar candidata ou regenerar contrato. Preflight e postflight exatos passaram em PostgreSQL 17. Essa reprodução valida as dependências fixadas 024/025-A; não é uma réplica completa da plataforma de produção. Políticas/objetos Storage da fixture não foram transplantados para Storage real; isolamento aqui comprovado para dados públicos da aplicação, não um novo teste integral de arquivos Storage reais.

## Resultados

| Cenário | Evidência / resultado |
|---|---|
| Compatibilidade 024/025-A | Preflight exato em PostgreSQL 17 passou, candidata instalada integralmente apenas localmente, postflight passou |
| Preservação de empresas existentes | Fingerprints de 12 conjuntos de dados sintéticos iguais imediatamente antes/depois da instalação |
| Cadastro gratuito | Empresa nova isolada, perfil empresa e limite 100, ilimitado=false; metadados role/empresa_id fornecidos pelo cliente ignorados |
| Confirmação de email | Cadastro sem token de sessão; login antes da confirmação recusado; link do email real local consumido; email_confirmed_at e login validados |
| Criação interna | Serviço create_usuario real do backend, feature por JWT, SDK, admissão, GoTrue e provisionar_perfil_interno executados; UUID escolhido preservado, papel operacional e tenant correto; login funciona com gate público fechado |
| Convite direto | POST Auth invite com service_role e gate fechado sem admissão recusado, nenhuma conta criada. Convite autorizado completo continua pendente |
| Recuperação | Email local real de recuperação, link consumido, senha alterada; senha antiga recusada e nova aceita |
| Proteção do cadastro | Gate fechado recusa inserção sem admissão; gate aberto recusa identificação ausente, admissão falsificada, CNPJ inválido/duplicado e campo role extra no payload; sem linhas intermediárias |
| Identidade duplicada | Tentativa com email existente não duplica Auth/empresa nem altera vínculo; comportamento de obfuscação do Auth considerado |
| Isolamento | JWT empresa vê somente seu tenant, não lê perfis de outro; escrita cross-tenant recusada; RPC de admissão inacessível ao cliente autenticado |
| Superadmin | JWT sintético admin mantém visibilidade das quatro empresas; proprietário não consegue se promover a admin |
| Limite e transições | Lote de 100 ativos aceito; 101º recusado P2502; inativação libera vaga; reativação acima de 100 recusada |
| Concorrência empresa nova PG17 | Duas requisições REST pela última vaga: um commit e um P2502; contador e contagem real permanecem 100 |
| Fechamento local | Close preserva empresas/identidades; gate final false, 4 empresas e 12 usuários Auth sintéticos |

Suítes: 27/27 PGlite signup; 20/20 PostgreSQL real 16.15 de concorrência 025-A, nenhum skip (rollback, batches, reativação, alteração de limite, tenants independentes, serialização e locks); 48/48 backend usuarios/security; 11/11 frontend cadastro/recuperação. Mais 13 verificações integradas locais e 2 grupos adversariais com Auth/REST reais aprovados. Registro da concorrência: `supabase/tests/signup-homolog-concurrency.log`; da suite sintética: `supabase/tests/signup-homolog-tests.log` (logs ignorados por Git).

Resultados sanitizados: `docs/audits/2026-10-10/signup-real-local-results.json` e `signup-real-local-security-results.json`. Sem JWTs, senhas, links de confirmação ou chaves nesses arquivos. Artefatos privados exclusivamente locais em `.norveo-homolog.local/`, ignorada por Git.

## Correções e pendências

Nenhuma correção necessária na migration para os cenários aprovados. SHA-256 preservado: `b3faa96cbc60a8ee2cadffedc6d9c1c655edf2d10c7a1576ca01ed532ceecd60`. `public_signup_contract_generate.mjs --check` passou, sem regeneração. Ajustes foram no harness: encoding UTF-8, ACLs herdadas do destino, recriação do event trigger sintético e formato da resposta HTTP de signup. Testes retomados nos pontos pendentes sem reinstalar migration.

1. Convites: a aplicação não tem fluxo de convite e inviteUserByEmail direto não usa a admissão prévia vinculada a UUID do fluxo interno. Desenhar e implementar um fluxo autorizado com vínculo à identidade efetivamente criada, tenant/papel determinados no servidor, expiração e consumo único, então homologar envio/aceitação/reuso/expiração/rollback. Não liberar o trigger para aceitar convites por metadados arbitrários. Se convites fizerem parte da próxima fase, isso é pendência antes da instalação definitiva.
2. Cadastro cria empresa ativa e reserva CNPJ antes de confirmar email. Isso foi comprovado, é o desenho atual e não prova titularidade empresarial: origem autocadastro/titularidade autodeclarado. Definir suporte para reserva por email não confirmado/erro de digitação; não liberar ou transferir CNPJ automaticamente. Limite de 100 não substitui proteção contra abuso/volume de cadastros. CAPTCHA continua separado e desativado.
3. Emails comprovados no Mailpit local, não entregabilidade SMTP externa, templates/domínio/redirects de produção ou navegação ponta a ponta no frontend publicado. Frontend foi testado por testes automatizados locais. Homologar essas configurações em destino de teste apropriado antes da abertura, sem credenciais de produção nesta stack.
4. Versões/configurações de GoTrue e Data API de produção não foram reconsultadas nesta rodada. Repetir preflight de leitura e conferir versão/flags na janela aprovada; guard interno de produção permanece fechado conforme publicação anterior, sem ativação nesta sessão.
5. Esta homologação não é teste de restore do backup anterior. Tentativa alternativa de PostgreSQL nativo não iniciou porque instalação local não continha postgres.bki; a stack Docker PostgreSQL 17 forneceu a prova real.

## Repetição controlada

Scripts versionados de preparação/teste: `public_signup_homolog_bootstrap.mjs`, `public_signup_homolog_loopback.py`, `public_signup_homolog_local.py`, `public_signup_homolog_security.py`. O runner principal exige stack nova e ausência da candidata; `--resume-fixture` retoma fixture já carregado ainda sem migration, e `--resume-auth` retoma após signup criado e antes de confirmação. Não repetir flags de retomada fora desses estados. A suite complementar exige gate local fechado e o fecha novamente em finally. Nunca configurar esses runners com URLs ou segredos externos. Não usar os volumes sintéticos para um restore sensível.

## Antes da instalação definitiva

Seguir `docs/NORVEO_BACKUP_PRE_SIGNUP_PROCEDIMENTO.md`: novo backup pós-025-A, completo de banco e bytes Storage, hashes/manifestos, inventário de configurações, captura coordenada e restore efetivo em ambiente separado protegido. A autorização de dados sintéticos não autoriza copiar backup sensível para esta stack. Preservar backup anterior; não considerá-lo snapshot atual. A aceitação de risco antiga da 025-A não autoriza esta fase.

Resolver escopo de convites e pendências acima, validar backup atualizado, repetir preflight/estado dos controles por leitura e apresentar versão/hash final para autorização específica. Instalação futura deve nascer com gate fechado; abertura de Auth/frontend e CAPTCHA precisam de autorizações separadas. Nenhuma dessas ações executada aqui.

Referências: [Supabase local development](https://supabase.com/docs/guides/local-development), [templates de email](https://supabase.com/docs/guides/auth/auth-email-templates), [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) e [backups](https://supabase.com/docs/guides/platform/backups).
