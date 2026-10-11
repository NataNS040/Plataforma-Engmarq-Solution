# Checklist bloqueante — homologação Norveo

Conforme decisão operacional, usar o projeto existente somente em ensaio controlado e expressamente autorizado, com empresa fictícia, sem alterar contas ou dados anteriores. Nenhuma conexão ou mudança de produção foi realizada nesta preparação. Registrar responsável, data, ambiente, versão/hash, resultado e evidência sem senhas/tokens para cada item. Todos os itens abaixo bloqueiam abertura pública, salvo decisão operacional expressa e documentada.

## Compatibilidade e instalação fechada

- [ ] Conferir 024/025-A/hash/contratos sem reaplicar. Inventariar proprietários, ACLs, RLS, colunas Auth, hooks, providers e triggers.
- [ ] Preflight aborta em drift, trigger Auth preexistente inclusive desabilitada, owner/ACL indevido e registry incompleto; nenhum reparo ou instalação parcial.
- [ ] Backup de homologação restaurável e rollback ensaiado; autorização de produção separada.
- [ ] Todos os backends usam admissão privada anterior ao INSERT Auth. RPC continua validando ator/tenant/papel, sem Superadmin nem tenant arbitrário.
- [ ] Candidata instalada somente com autorização de teste, postflight aprovado, controle false.
- [ ] Auth direto fechado: payload válido/ausente, metadata falsificada e app_metadata indevida recusados sem Auth/empresa/perfil residuais.
- [ ] Anon/authenticated/service_role não acessam controle nem função. Sem secret em bundle/frontend.
- [ ] Empresas, perfis, usuários, limites/policies existentes preservados; login/cadastro interno continuam funcionando.

## Configuração e CAPTCHA

- [ ] SMTP/remetente/DNS/limites aprovados; entrega/spam testados. Site URL, callbacks login/nova senha, fallback SPA e CORS corretos.
- [ ] Secret no Auth, site key/domínio corretos, CAPTCHA required no frontend; clientes preparados antes de ligar proteção do serviço.
- [ ] Signup/login/resend/reset com token válido funcionam. Tokens ausentes/invalidos/reutilizados/expirados recusados em chamadas diretas e UI.
- [ ] CSP/rede lenta/timeout/expiração/retry/StrictMode não habilitam envio sem token nem duplicam widgets. Login antigo preservado.
- [ ] Rate limits signup/envio/login/resend/reset e mensagens 429 validados no serviço; cooldown visual não é proteção.
- [ ] Confirmação obrigatória; providers/convites não homologados bloqueados. Auth real testado com trigger, convites e usuários internos.

## Cadastro, confirmação e recuperação

- [ ] Controle aberto somente com evidência/autorização; abertura Auth/UI coordenada.
- [ ] UUID próprio, perfil empresa, sete features, limite 100, uso zero, origem autocadastro; sem Superadmin ou associação existente.
- [ ] Login/painel negados antes de confirmar; após confirmar login, `/me` e painel no tenant correto.
- [ ] Confirmação válida/expirada/reutilizada e reenvio recuperam mesma identidade/perfil/empresa sem criar novo tenant.
- [ ] Mesmo CNPJ com máscara diferente, mesmo e-mail, retry após timeout e signup concorrente pelo CNPJ não duplicam nem transferem.
- [ ] Falha SQL em cada estágio faz rollback completo. SMTP/HTTP falhos não são tratados como prova de conta ausente; recuperação original sem duplicação.
- [ ] E-mail inexistente/confirmado/conhecido recebe mensagens neutras, sem divulgação de reserva/empresa/proprietário ou detalhes internos.
- [ ] Reset completo: entrega, `/nova-senha`, link inválido/expirado, getUser real, política de senha, updateUser próprio, logout/login. Comprovar comportamento de outras sessões/tokens.
- [ ] Cadastro abandonado mantém reserva; terceiro não assume. Suporte/responsável/comprovação/disputa operacionais, sem limpeza ou transferência automática.

## Isolamento e limite

- [ ] Dois tenants sintéticos isolados via UI/API/REST/RPC/Storage. Troca de ids/empresa_id/claims/user_metadata não dá acesso alheio.
- [ ] Troca de perfil para admin, tenant, limite ou benefícios recusada. Sem segredo ou função administrativa pública.
- [ ] API admite 100 ativos, recusa 101º com mensagem e contador/empresa_uso exatos.
- [ ] Reativação acima do limite recusada; desligamento libera vaga com histórico. Limites pagos preservados.
- [ ] Com 99, duas criações admitem uma; repetir criação/reativação/importações concorrentes via serviço real sem ultrapassar 100 ou divergir uso.
- [ ] Importação sequencial preserva sucessos/para na cota; lote excedente aborta inteiro. Requisição direta não contorna banco.
- [ ] Registrar os 20 testes reais 025-A separadamente; não usá-los como homologação de signup/Auth/SMTP/HTTP novos.

## Rollback e abertura

- [ ] Fechamento com signup em andamento preserva commits anteriores e impede novos após confirmação; timeout não é declarado sucesso.
- [ ] UI fechada, gate false, trigger mantida: login/resend/reset/`/me`/cadastro interno continuam funcionando. Conferir se desligar signup no Auth impede resend; definir alternativa autorizada com configuração Auth aberta somente após comprovar gate fechado e íntegro.
- [ ] Inventário confirma que rollback não remove tenant/perfil/Auth/plano/colaborador/documento.
- [ ] Releases de reversão compatíveis com admissão prévia/RPC/CAPTCHA. Sem DROP/CASCADE/limpeza na rotina.
- [ ] Registrar monitoramento, responsáveis, referência aprovada e critérios de interrupção. Só então solicitar autorização específica de produção.
# Verificação adicional da admissão interna

- [ ] Conferir preflight corrigido com o tipo real `auth.users.email varchar(255)`; não alterar a tabela Auth. Executar como postgres em conexão SSL e transação READ ONLY, com autorização específica de acesso.

- [ ] Confirmar UUID fornecido em `admin.createUser` na versão instalada do Auth.
- [ ] Com gate fechado, criar usuário interno por admissão service-only e comprovar perfil na empresa do ator, sem empresa nova.
- [ ] Recusar ator sem autorização, UUID/e-mail divergentes, admissão expirada e payload público na admissão interna.
- [ ] Recusar marcador em app_metadata/user_metadata, papel admin e tenant fornecido pelo cliente.
- [ ] Simular falhas/timeout: nenhum retry automático; validar compensação e reconciliação sem alterar usuários anteriores.
- [ ] Coordenar suspensão temporária do endpoint interno, backend compatível, candidata autorizada, postflight e retomada; manter gate público fechado.

