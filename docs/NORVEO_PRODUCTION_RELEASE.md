# Publicação controlada Norveo — 10/10/2026

Este plano está preparado, não executado. O usuário confirmou SMTP Brevo salvo, remetente verificado, DKIM/DMARC e preflight corrigido aprovado. Backup validado: `C:\Backups\EngMarq\norveo_pre_signup_20261010_01`, dump 610704 bytes, SHA-256 `a616d74d59f1c672214958421ec3126dfcf70f76b0180b66a79a110b980de19f`; quatro objetos Storage preservados. Restore não testado; exportações não têm snapshot comum. Não reaplicar 024/025-A.

## Código e controle de publicação

Frontend padrão na raiz `/`, CNAME `norveo.com.br`, API `https://api.norveo.com.br/api/v1`. Rotas usam BASE_URL; fallback 404 preserva fragments Auth. Para legado Pages, definir explicitamente `VITE_BASE_PATH=/Plataforma-Engmarq-Solution/`. Workflow de publicação passa a ser somente manual; commit/push não publicam automaticamente por este workflow. Pages deve servir branch `gh-pages`, pasta `/`, com domínio configurado e HTTPS obrigatório. CNAME no artefato não configura sozinho DNS/Settings. Confirmar outros workflows antes de qualquer push.

O backend tem `INTERNAL_USER_CREATION_ENABLED=false` no exemplo de implantação. Isso pausa somente criação interna antes de chamar Auth/RPC, sem bloquear login, leitura ou administração de empresas pelo Superadmin. Depois da migration e postflight, mudar para true e recriar API. A admissão não tem fallback inseguro. A imagem usa `API_IMAGE` para manter versões distintas; guardar a imagem anterior, configurações e artefato frontend anterior. Não editar limites, papéis ou tenants existentes.

Antes da migration não existe gate no banco: manter `Allow new users to sign up` desligado no Auth e `VITE_PUBLIC_SIGNUP_ENABLED=false`. Confirmar esse estado com consulta autorizada; a UI não é uma barreira. Após instalar, o gate nasce false e bloqueia INSERT público direto. Se Auth estiver aberto hoje, parar antes de publicar e solicitar autorização específica para fechá-lo. Nenhuma configuração real foi alterada nesta preparação.

## Auth e CAPTCHA

Consulta GET ao health Auth em 10/10/2026 retornou **v2.197.0**. O [código dessa versão](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go) aceita `id` administrativo, atribui UUID ao usuário antes de `tx.Create(user)` e só depois grava app_metadata. Compatibilidade documental da admissão confirmada; não foi criado usuário real. Provar integração Auth/PostgREST/JWT em ensaio posteriormente autorizado.

Site URL: `https://norveo.com.br`. Allowlist exata: `https://norveo.com.br/login` e `https://norveo.com.br/nova-senha`; conservar callbacks legados durante transição se usados por clientes reais. Conferir templates para respeitar RedirectTo, expiração e fluxo de recuperação. SMTP salvo não prova entrega: verificar confirmação, reenvio, recuperação e spam. [URLs oficiais](https://supabase.com/docs/guides/auth/redirect-urls).

Criar/configurar Turnstile com domínio Norveo; site key pública em variável GitHub `VITE_TURNSTILE_SITE_KEY`, secret apenas no Supabase. `VITE_SUPPORT_EMAIL` deve ser canal real. O cliente já trata falha, expiração, timeout e renovação em login/cadastro/recuperação. Publicar cliente com site key primeiro e testar todos os clientes existentes, inclusive legado; somente depois autorizar CAPTCHA no Auth. Não ativar antes nem reverter para cliente sem CAPTCHA após ativação. [CAPTCHA oficial](https://supabase.com/docs/guides/auth/auth-captcha).

## Pontos de parada e comandos futuros

Executar somente depois de aprovação específica de código/versão, acesso VPS/GitHub, configurações externas e janela. Revisar lista de arquivos; não incluir .env, certificados, dumps ou credenciais. Commit/push do conjunto revisado dependem de autorização. Congelar hash da candidata e release antes do corte. Renovar/reverificar backup se houver mudanças relevantes desde a exportação.

1. Confirmar DNS Pages e API, HTTPS, secrets públicos GitHub, canal de suporte, Auth fechado e CAPTCHA ainda desligado. Não remover registros Brevo/DKIM/DMARC. CORS na VPS deve incluir `https://norveo.com.br` e manter `https://natans040.github.io` enquanto existir cliente legado. Adicionar www somente se realmente servido sem redirect. [GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
2. Preservar imagem/artefato anterior e definir variável da nova release na VPS. Com criação interna pausada no arquivo privado `/etc/engmarq/backend.env`, publicar backend primeiro:

```bash
export API_IMAGE=engmarq-api:norveo-signup-20261010
sudo --preserve-env=API_IMAGE docker compose config --quiet
sudo --preserve-env=API_IMAGE docker compose build api
sudo --preserve-env=API_IMAGE docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo --preserve-env=API_IMAGE docker compose up -d --wait
curl --fail --silent --show-error https://api.norveo.com.br/health
curl --silent --show-error -o /dev/null -w '%{http_code}\n' https://api.norveo.com.br/api/v1/me
curl --silent --show-error -i -X OPTIONS https://api.norveo.com.br/api/v1/me -H 'Origin: https://norveo.com.br' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization'
```

`/me` sem JWT deve retornar 401; OPTIONS deve permitir exatamente a origem. Não publicar `docker compose config` sem --quiet nem inspect/env. Validar imagem Linux/Caddy real na VPS: Docker local indisponível nesta preparação.

3. Publicar frontend fechado, somente no ref aprovado já presente na branch padrão:

```bash
gh workflow run deploy.yml --ref main -f public_signup=false -f captcha_required=false
gh run list --workflow deploy.yml --limit 1
```

Conferir run correspondente e deploy Pages concluído, domínio, assets e reload direto de `/login`, `/recuperar-acesso`, `/nova-senha` e painel. Testar login existente, `/me`, leitura/Storage por tenant e ações Superadmin. Falha interrompe, sem migration.

4. Com conexão privada já validada (`PGSSLMODE=verify-full`, certificado confiável e PGPASSFILE, sem URI em comandos), executar preflight atual. **Parada para autorizar migration**, depois executar somente candidata e postflight:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -w -v ON_ERROR_STOP=1 -f supabase/pending/public_company_signup_preflight_readonly.sql
# Somente após autorização explícita; candidata possui sua própria transação:
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -w -v ON_ERROR_STOP=1 -f supabase/pending/public_company_signup.sql
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -w -v ON_ERROR_STOP=1 -f supabase/pending/public_company_signup_postflight_readonly.sql
```

Gate deve ser false, contrato 024/025-A preservado. Postflight não comprova dados: comparar antes/depois contagens por tabela, empresas/perfis/identidades existentes e hashes de dados autorizados em evidência protegida; não exibir dados pessoais. Falha mantém criação interna pausada. Retomar `INTERNAL_USER_CREATION_ENABLED=true` somente após sucesso e ensaio interno autorizado. A candidata é não idempotente: não repetir após sucesso.

5. Parada para autorizar configurações Auth/CAPTCHA e ensaio público. Gate fechado impede também empresa fictícia: não abrir globalmente para teste sem janela/controlos aprovados. Confirmar entrega SMTP, login, recuperação, `/me`, isolamento, papel empresa e cota 100/101/importações conforme checklist. Publicação geral depende da conclusão dessa integração.
6. Só depois autorizar ativação: configuração Auth, CAPTCHA validado, script activate com referência operacional aprovada definida na sessão postgres (`norveo.signup_approval_reference`) e UI coordenados. Conferir referência e postflight. Publicar UI com `public_signup=true`, `captcha_required=true` e site key configurada. Monitorar falhas Auth, quota, SMTP e suporte.

## Rollback

Antes da migration: manter Auth/UI fechados, retornar à imagem e artefato anterior aprovados. Depois da migration: fechar gate com `public_company_signup_close.sql` sob autorização, postflight, manter Auth/UI fechados e backend compatível com admissão; não remover tabela/trigger nem voltar a backend incompatível. Manter login e CAPTCHA compatíveis. Para trocar imagem compatível, definir `API_IMAGE` anterior e executar `docker compose up -d --no-build --wait api` preservando variável via sudo. Nenhum DROP, CASCADE, down -v, restore automático ou exclusão de usuário/empresa. Timeout no fechamento não confirma sucesso.

## Pendências externas

### Prechecks remotos da publicação autorizada — 10/10/2026

Publicação condicionada a todos os prechecks críticos e acesso operacional de rollback. Nesta conferência não houve commit, push, deploy nem alteração de produção.

- Auth: GET settings do projeto esperado confirmou `disable_signup=true` e confirmação de e-mail exigida. Callbacks/SMTP foram confirmados pelo operador; esta consulta pública não expõe a allowlist de redirects nem comprova entrega SMTP.
- DNS apex: os quatro A do Pages foram observados. `www` ainda aponta por CNAME para `norveo.com.br`; corrigir para `natans040.github.io`, conforme o procedimento oficial do Pages.
- HTTPS apex: HTTP 200 com validação de certificado. Pages informa certificado aprovado somente para `norveo.com.br`, expiração 08/01/2027, `https_enforced=false`. HTTPS de `www` falha por hostname incompatível. Parada até corrigir DNS, obter certificado válido para www e habilitar Enforce HTTPS.
- API: health HTTP 200; `/api/v1/me` sem JWT HTTP 401. OPTIONS Norveo HTTP 400 sem allow-origin; legado HTTP 200 com allow-origin exata. Configuração candidata já contém ambas as origens; falta aplicar na VPS após os prechecks.
- SSH: porta 22 acessível e arquivo local de identidade existente. Usuário SSH ainda não identificado; login, privilégios Docker, imagem de rollback e backups de configuração não conferidos remotamente. Não tentar usuários por suposição.
- Refs remotos antes da publicação: main `07f6eb72738d2517a3a90fa35e79b5272254c049`; gh-pages `22ed2ad378ffba1ef3f2dfc03b2b4bbb1f83cac4`. O ref frontend mudou após vincular domínio; preservar também o artefato anterior `8b1ea116ca04fbfbcb2b3902ff54741d97d6459b` para comparar base e CNAME antes de escolher rollback.
- Rollback informado pelo operador: `engmarq-api:rollback-pre-norveo-20261010`, ID `sha256:0f867055144cf86947f6fd7e0b44cf79871051da6aaa5561cba6fbcea168a72a`; configurações em `/root/norveo-rollback-20261010/`. Informação ainda depende de conferência via SSH antes de qualquer alteração.

Após resolver estes bloqueios, conferir build Linux/Caddy, publicação backend com criação interna pausada, frontend fechado e smoke autenticado com usuários existentes. Saúde/401/CORS não substituem login, `/me` autenticado, Superadmin e isolamento por empresa. Não usar credenciais reais em logs ou relatórios.

VPS/acesso/release atual e imagem de rollback; DNS/HTTPS/Settings Pages; secrets/vars GitHub; confirmação do Auth fechado e callbacks/templates; Turnstile/compatibilidade de clientes; ensaios Auth/SMTP reais e autorização de migration/ativação. SMTP e backup foram confirmados pelo usuário, não reconfigurados nesta rodada.

Validação local desta rodada: backend 460 passes; frontend 223 passes, typecheck e build raiz aprovados; SQL signup 27 passes e contrato gerado aprovado. Docker daemon indisponível: imagem Linux/Caddy real não executados. Avisos: depreciação preexistente de TestClient e bundle frontend acima de 500 kB. Migrations/policies/quotas existentes não alteradas. A consulta remota feita nesta rodada foi somente GET health Auth, sem usuários ou configurações. Rollout/configuração/migration/ativação continuam sujeitos a autorizações distintas.
