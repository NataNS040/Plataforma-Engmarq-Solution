# Preparação da instalação controlada — 12/10/2026

Preparação concluída; instalação e liberação NÃO executadas. Esta rodada teve apenas consultas de leitura em produção, testes locais e preparação de arquivos locais. Não houve migration, deploy, restart, habilitação de convites/CAPTCHA/signup ou envio SMTP. Este documento substitui a sequência do plano antigo para a candidata ampliada; não executar os scripts antigos `.release/precut.sh` e `cutover.sh`.

## Versões e evidência

- Candidata única: `supabase/pending/public_company_signup.sql`, SHA256 **cfe94a0de30925d4dd95eb95eb68453286cf58295f000cd2b2226f212bcba97b**. Continua fora das migrations automáticas. `user_invitations.sql` é componente incorporado, nunca instalar separadamente. Não reaplicar 001–025-A.
- Contrato gerado conferido sem alteração da baseline. Preflight remoto executado com `default_transaction_read_only=on`, BEGIN READ ONLY e ROLLBACK: passou. Produção: 3 empresas (2 ativas), 2 usuários/perfis ativos, todas as 3 empresas ilimitadas, zero divergências do contador. Sem trigger INSERT Auth da candidata; gate/admissão ainda ausentes. Documentos: bucket privado, 4 objetos; logos: privado, vazio.
- VPS consultada por SSH root, exclusivamente leitura. API healthy, imagem efetiva **engmarq-api:norveo-8f342e9**, digest **sha256:0a7f99bf9231177d9aec1acce56b1ce130a4e9e343fb58d31283afa5fc7a2fdf**. Runtime `INTERNAL_USER_CREATION_ENABLED=false`; esta versão não tem o novo controle/rotas de convites. Código em execução contém `autorizar_auth_interno`; hash do repository de usuários: `5f6a65b4f8b1fb2a296206f6e8cf07f2d1c65c201d886a80e2ebee8e520cc5cd`.
- API health 200, `/api/v1/me` sem JWT 401; OpenAPI sem rotas de convite. Frontend index corresponde byte a byte ao artefato publicado registrado, SHA256 `d7b789ee8079e527ae8f014fc67ee602e64cb7acc63766ec498c286bd299f96d`; release documentada gh-pages `5b87e76f1367a20dd682d830dbc5a6530091301d`.
- Auth GET settings: `disable_signup=true`, `mailer_autoconfirm=false`. Este GET não prova SMTP, redirects, templates nem configuração administrativa CAPTCHA; conferir esses campos em leitura no painel antes da execução. Não inferir CAPTCHA desligado apenas do frontend.
- Evidência sanitizada: `docs/audits/2026-10-12-release-readonly.json`. Não registra emails, CNPJ, dados pessoais ou credenciais.

## Revisão e compatibilidade

A candidata adiciona estruturas privadas/RPCs exclusivas service_role e dois triggers; não converte empresas existentes para gratuitas nem altera seus limites. O trigger Auth só atua em novos usuários; login, confirmação e recuperação dos existentes não são novos INSERTs Auth. A admissão interna desta release publicada corresponde ao protocolo novo, mas a criação interna continuará explicitamente pausada. Não habilitar esse fluxo nesta instalação.

Convites criam apenas acesso, conforme decisão do usuário; não criam colaboradores, não reservam vagas e não contam na cota. Perfil fica inativo até confirmação e aceite, vinculado ao email/empresa/papel fixados no servidor. Autorização do emissor é revalidada; capability aleatória tem somente hash persistido; clientes não podem escolher papel admin, mudar empresa ou ativar perfil pendente. A cota 100 continua na 025-A para todas as operações sobre colaboradores, incluindo concorrência; empresas ilimitadas permanecem ilimitadas.

Cancelamento/expiração impedem ativação do acesso, mas não apagam automaticamente identidade ou liberam email. Envio ambíguo não deve ser repetido automaticamente; reconciliar estado Auth/convite antes de qualquer ação. Fechar o controle da API bloqueia criação e aceite futuros, sem revogar acessos já aceitos. Solicitações em voo exigem drenagem e conferência de resultado.

Homologação real GoTrue/SDK/Mailpit anterior permanece aplicável: 10 grupos de convites e concorrência aprovados, 477 backend e 228 frontend na regressão anterior. Nesta revisão: **22 testes backend**, **8 frontend**, **27 SQL signup**, typecheck, contrato e diff-check aprovados. Não repetimos o restore ou a stack GoTrue porque a candidata não mudou. Não houve teste autenticado novo de produção nesta rodada.

Dois ajustes preparados somente localmente no workflow:

1. `user_invitations` booleano, default false, alimenta `VITE_USER_INVITATIONS_ENABLED` explicitamente.
2. `VITE_TURNSTILE_SITE_KEY` fica vazio quando `captcha_required=false`. Isso é necessário porque `useCaptcha` também exige CAPTCHA quando existe site key, mesmo com flag false. Apenas configurar a variável GitHub não deve ativar CAPTCHA na próxima publicação fechada.

Nenhuma alteração de SQL/backend foi necessária nesta revisão. Antes de publicar, congelar commit completo e manifestos dos artefatos; os arquivos ainda estão no working tree, sem commit/push nesta rodada.

## Backup e recuperação disponíveis

Backup protegido: `C:\Backups\EngMarq\engmarq_post025a_20261010_235555`. Dump 610707 bytes, 4 arquivos Storage (2265208 bytes). Os dois manifestos SHA256 foram relidos e passaram. Restore existente continua comprovado: PostgreSQL 17 isolado sem rede/portas, exit 0, 59 tabelas e 871 entradas de catálogo iguais, RLS exercitada com 2 perfis, bytes Storage nos caminhos originais iguais. As 59 tabelas e as 871 entradas de catálogo ainda coincidem com produção na leitura desta rodada. Isso não congela produção nem comprova bytes remotos atuais apenas pela metadata.

**Pendência operacional de rollback:** na VPS existe apenas a imagem API Norveo atual. A antiga tag `rollback-pre-norveo-20261010` não existe mais. Arquivos antigos Compose/Caddy/backend.env existem; backend.env modo 600. O tar frontend antigo não foi encontrado no caminho específico `/root/norveo-rollback-20261010/frontend-rollback-975a892.tar`; não foi feita busca global. Não usar esse conjunto antigo como garantia de rollback desta instalação.

Antes do corte autorizado, criar um NOVO conjunto protegido contendo imagem atual exportada por digest, artefato completo do frontend atual, Compose/Caddy atuais, ambiente atual protegido e configuração Auth recuperável. Conferir hashes e capacidade de carregar a imagem/artefato em destino isolado. Não fazer prune. Não divulgar conteúdo de env, dump Auth ou caminhos dos objetos em Git/OneDrive.

Atualização imediatamente antes da instalação:

```powershell
# Gera somente uma consulta local de catálogo, sem conexão.
node scripts/prepare_backup_catalog.mjs
# Exportação somente leitura; escreve novo conjunto protegido fora do repositório.
python scripts/backup_post025_readonly.py
# Usar EXATAMENTE o novo caminho retornado; nunca restaurar sobre produção.
python scripts/restore_post025_isolated.py 'C:/Backups/EngMarq/engmarq_post025a_<timestamp-novo>'
```

O gerador foi preparado para eliminar dependência de um arquivo ignorado não reproduzível; a consulta gerada confirmou os mesmos 871 objetos em produção. A exportação exige estabilidade dos fingerprints antes/depois e metadata Storage; snapshot DB e Storage não é atomicamente comum. Havendo escritas concorrentes ou qualquer divergência, parar e recapturar em janela com escrita controlada, previamente autorizada. Conferir também Auth/configuração externa, manifesto, roles sem senhas, restore-result final, FKs, RLS, contadores, arquivos e privacidade. Não sobrescrever status/hash originais para declarar sucesso; manter evidência complementar de restore. Repetir leitura no instante do corte e registrar delta/RPO. Não prometer RPO zero ou RTO integral sem ensaio da recuperação hospedada.

Restore comprovado não cobre descriptografia Vault, credenciais externas/SMTP ou recuperação completa da plataforma Supabase. Preservar secrets necessários no cofre e confirmar procedimento suportado de restauração hospedada. Full restore de produção necessita autorização própria, indisponibilidade e reconciliação de todas as escritas posteriores ao snapshot.

## Sequência exata futura, com todos os controles fechados

1. **Congelar e preparar:** autorizar commit/push/release; revisar lista de arquivos sem segredos, fixar hash da migration e digest do novo backend, construir/testar Linux isolado. Preparar frontend com `public_signup=false`, `captcha_required=false`, `user_invitations=false` e chave Turnstile vazia. Não disparar workflow de ref antigo ou flutuante.
2. **Janela e recuperação:** autorização de instalação/deploy deve incluir janela e impacto de lock/corte API. Preservar release ATUAL e atualizar/restaurar backup conforme acima. Revalidar image/runtime, configuração Auth, redirects/templates e preflight final. Não prosseguir se houver drift, falha de restore ou falta do rollback atual.
3. **Banco primeiro:** manter Auth signup bloqueado, criação interna false, convites false e UI fechada. Executar exclusivamente candidata congelada uma única vez com postgres confiável/origin, sessão com escrita permitida e ON_ERROR_STOP. Não usar `supabase db push`, não envolver arquivo em outra transação e não instalar componente separado.

```powershell
# SOMENTE APÓS AUTORIZAÇÃO ESPECÍFICA PARA A MIGRATION.
& 'C:/Program Files/PostgreSQL/17/bin/psql.exe' 'service=engmarq_backup connect_timeout=15 options=-cdefault_transaction_read_only=off' -X -w -v ON_ERROR_STOP=1 -f supabase/pending/public_company_signup.sql
# O arquivo já contém BEGIN/COMMIT, lock_timeout 5s e statement_timeout 60s.
# Validação posterior volta ao modo somente leitura.
& 'C:/Program Files/PostgreSQL/17/bin/psql.exe' 'service=engmarq_backup connect_timeout=15 options=-cdefault_transaction_read_only=on' -X -w -v ON_ERROR_STOP=1 -f supabase/pending/public_company_signup_postflight_readonly.sql
```

4. **Validar banco:** postflight exato (corpos/owners/ACL/RLS/triggers), gate false e privacidade, mesmas empresas/usuários/limites/uso/Storage. Comparar fingerprints de tabelas existentes com snapshot imediatamente anterior, diferenciando escritas legítimas da janela; tabelas novas devem estar vazias exceto linha gate fechado. Falha interrompe sequência, sem deploy automático.
5. **API depois:** instalar imagem congelada e configuração preservada, com `INTERNAL_USER_CREATION_ENABLED=false`, `USER_INVITATIONS_ENABLED=false`; preparar `INVITATION_CALLBACK_URL=https://norveo.com.br/aceitar-convite` sem habilitar. Atualizar apenas serviço API via Compose, sem `down -v` e sem reiniciar Caddy desnecessariamente. Validar Compose com `config --quiet`; se necessário validar Caddy em container separado `--network none`, evitando colisão do IP estático. Confirmar runtime, health, CORS, autenticação e novos endpoints fechados (401 sem JWT; 503 para usuário autorizado com controle false).
6. **Frontend por último:** publicar ref congelado com os três inputs false. Validar assets/SPA/404, login, recuperação, Superadmin, empresas e isolamento com sessões do operador; nenhuma sessão sensível nos logs. Confirmar `/cadastro` e `/aceitar-convite` indisponíveis e ausência da interface de convites/CAPTCHA. Comparar integridade novamente.
7. **Aceite da instalação fechada:** registrar versões, hashes, postflight, testes e zero habilitações. Encerrar janela. Isso aprova infraestrutura instalada; testes positivos dos novos fluxos em produção dependem das autorizações abaixo.

## Teste real Brevo preparado, sem nova empresa

Nenhuma mensagem enviada nesta rodada. Usar primeiro **uma conta existente controlada pelo operador**, cujo dono autorize recuperação; confirmar destinatário antes do envio e evitar afetar outros usuários ou a única conta administrativa sem contingência.

Em leitura no painel: confirmar SMTP Brevo salvo, remetente/domínio autenticados, host `smtp-relay.brevo.com`, login SMTP, porta/TLS compatíveis, chave SMTP (não API key), DKIM/DMARC e limites Auth/Brevo. Não exportar senha SMTP em evidência pública. Conferir templates recovery/invite/confirmation e RedirectTo, URL Site e callbacks login/nova-senha/aceitar-convite, preservando clientes antigos necessários. Conferir allowlist do callback com query `convite=UUID` no provedor; usar padrão estritamente limitado ao caminho confiável se necessário, nunca wildcard de domínio inteiro.

Após autorização de envio: solicitar UMA recuperação em `https://norveo.com.br/recuperar-acesso`, registrar horário/correlation id, verificar log Brevo delivered e caixa/spam; verificar SPF/DKIM/DMARC nos headers e hostname/callback HTTPS. HTTP 200 não comprova entrega, nem mensagem inexistente prova SMTP. Link/OTP/JWT não entram no relatório. Para completar o teste da senha, o dono pode consumir o link e definir senha sob autorização explícita; isso modifica Auth e deve ser contabilizado no delta do backup. Testar uso único/expiração sem esgotar rate limits.

Essa prova verifica recuperação e transporte SMTP; não substitui convite/confirmation completos. Convite real só após autorização separada de habilitação: uma identidade sintética com mailbox controlada na empresa de teste já existente e autorizada (sem criar empresa), emissor autorizado, confirmar entrega → perfil inativo → aceite → empresa/papel exatos → login/recuperação. Registrar conta para reconciliação; não apagar automaticamente. Se nenhuma empresa adequada existir, parar e obter autorização para fixture — não usar empresa de cliente como laboratório.

Signup real positivo cria Auth/empresa antes da confirmação e reserva CNPJ; não é possível provar esse fluxo com gate fechado. Não abrir gate global apenas para testar nem usar CNPJ inventado em produção. Um ensaio público requer janela e dados/empresa especificamente aprovados. O código atual não possui gate por email nem controle de convite por emissor piloto: habilitar API de convites libera todos os emissores autorizados; considerar essa abrangência na aprovação.

Fontes consultadas: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha). Changelog consultado: aviso TLS de 12/10 com retirada de cifras antigas a partir de novembro; não altera o contrato desta migration. [Changelog](https://supabase.com/changelog).

## Habilitações independentes e autorizações específicas

| Operação futura | Autorização e controles |
|---|---|
| Commit/push, build/publicação e corte API/Pages | Aprovação da release congelada e deploy fechado; sem habilitar recursos. |
| Instalar candidata SQL | Aprovação específica do hash acima, janela e backup/rollback atualizados. |
| Enviar email Brevo/consumir recovery | Aprovação de destinatário, volume e eventual alteração de senha. Não requer abrir signup nem convites. |
| Convites | Aprovação própria. Banco/postflight e callback prontos; publicar UI `user_invitations=true`, demais false; depois habilitar backend `USER_INVITATIONS_ENABLED=true`, mantendo criação interna false e Auth signup bloqueado. Validar Auth nativo com signup bloqueado no projeto hospedado e monitorar. Voltar backend false primeiro ao fechar. Sem configuração CAPTCHA neste passo. |
| CAPTCHA | Aprovação própria de Turnstile e Supabase Auth. Site key pública e secret somente no provedor; domínio correto. Publicar frontend CAPTCHA pronto primeiro, signup ainda fechado; habilitar proteção Auth depois e testar login/recovery/confirmation e clientes legados. Não habilitar Auth CAPTCHA com cliente antigo sem token. Em recuo, desligar exigência Auth antes de publicar cliente sem CAPTCHA. |
| Cadastro público | Aprovação própria após evidência SMTP e CAPTCHA. Postflight passa, confirmação obrigatória, rate limits e monitoramento definidos. Ativar gate por `public_company_signup_activate.sql` com referência operacional aprovada na mesma sessão, enquanto Auth signup continua bloqueado; então alterar Auth `disable_signup=false` e publicar `public_signup=true`, CAPTCHA validado. Quando gate e Auth estiverem abertos já existe acesso direto à API, mesmo com UI ainda fechada: esse instante é a abertura pública, não ensaio privado. Não executar nenhum desses passos nesta rodada. |
| Criação interna antiga | Continuará false; habilitação futura necessita decisão própria, não decorre de convites/signup. |
| Fechamento emergencial, reparo SQL ou restore em produção | Precisa autorização específica ou autorização operacional de contingência incluída no corte; não presumir autorização permanente. |

Antes de abertura geral: ensaio autorizado de empresa gratuita/limite 100, importações/concurrency, confirmação/login/recovery, abuso e tenant isolation; preservar o resultado isolado como prova de cenários destrutivos/de carga, sem encher empresas de produção com 101 colaboradores. Métricas: Auth/SMTP errors, convites failed/pending, falhas quota, integridade e suporte; definir janela de observação e responsável.

## Falhas e recuperação

- **Antes de COMMIT:** ON_ERROR_STOP interrompe; sessão/transação revertida ao encerrar. Lock timeout não autoriza desativar triggers, elevar timeout ou retentar sem verificar estado. Repetir preflight e integridade, corrigir causa em isolado, pedir nova decisão se hash mudar.
- **Conexão perdida / resultado incerto:** não reaplicar candidata (não é reentrante). Ler presença e definição dos objetos/gate e executar postflight se presentes. Se instalação completa, preservar; se ausente, preflight; qualquer estado divergente exige diagnóstico antes de outra escrita.
- **Após COMMIT, falha API/frontend:** manter controles fechados; reverter somente aplicação para imagem Norveo atual preservada por digest e artefato frontend atual, mantendo criação interna false. A release antiga não contém rotas de convite, mas login/dados e admissão compatível permanecem. Não remover schema/trigger nem editar dados para recuperar aplicação.
- **Após habilitação futura:** sob autorização de contingência, bloquear Auth signup e gate com `public_company_signup_close.sql`, convites backend false e UI fechada; drenar/reconciliar operações em voo. Não desabilitar trigger Auth para contornar proteção. Acessos já aceitos não são revogados por fechar flags.
- **Dano aos dados / necessidade full restore:** suspender escrita de forma autorizada, preservar evidências/backup do estado falho, reconciliar alterações pós-snapshot, restaurar primeiro em isolado e validar DB/Storage/configuração antes de corte de recuperação aprovado. Não restaurar diretamente o backup antigo sobre produção sem análise de perda. Restore hospedado e segredos de plataforma têm procedimento próprio.

Critério de parada: backup/rollback indisponível, drift 025-A, postflight divergente, integridade alterada inexplicavelmente, login/empresa/Superadmin/Storage regressivos, SMTP não comprovado ou qualquer controle aberto inadvertidamente. Não liberar público com essas pendências.
