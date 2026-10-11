# Implantacao Norveo - procedimento vigente

Usar [NORVEO_PRODUCTION_RELEASE.md](../docs/NORVEO_PRODUCTION_RELEASE.md). Ele substitui a configuracao Pages por subdiretorio e os comandos antigos sem imagem versionada. Frontend raiz norveo.com.br; API api.norveo.com.br; CORS inclui Norveo e mantem legado durante transicao. Usar API_IMAGE por release, criacao interna pausada e workflow Pages manual. As notas historicas abaixo sao da fundacao 025-A e nao autorizam sua reaplicacao.

# Deploy preparado — Norveo / EngMarq

Estes arquivos preparam a publicação; nenhum comando deste guia foi executado na VPS.
A 025-A já está aplicada. **Não executar migrations, criar banco local ou copiar backups/pgpass para a VPS.**

## Arquitetura

GitHub Pages → HTTPS api.norveo.com.br → Caddy → api:8000 → Supabase externo.
O navegador também acessa Supabase Auth e Storage privado com a chave pública e seu JWT.
Só Caddy publica portas. A API não tem `ports`, roda como UID 10001 e possui filesystem read-only.
Caddy mantém certificados em volumes `caddy_data` e `caddy_config`.

## Antes de publicar, após aprovação

1. Apontar o registro A de `api.norveo.com.br` para o IP da VPS. Se houver AAAA, confirmar que aponta para IPv6 funcional dessa VPS.
2. Confirmar portas TCP 80/443 disponíveis e permitidas no firewall Hostinger. UDP 443 é usado para HTTP/3. Não abrir 8000.
3. Conferir que `172.30.25.0/24` não conflita com uma rede existente. Se conflitar, ajustar subnet/IP do Caddy e `FORWARDED_ALLOW_IPS` juntos.
4. Transferir a versão revisada do projeto, excluindo `.env`, `.venv`, backups e auditorias com dados. Não construir a partir de uma versão antiga do GitHub.
5. Criar o arquivo privado na VPS usando o exemplo, então preencher as chaves diretamente no computador/servidor. Não enviar chaves pelo chat.

```bash
# Na VPS, no diretório da versão revisada do projeto:
sudo install -d -m 700 /etc/engmarq
sudo install -m 600 deploy/backend.env.example /etc/engmarq/backend.env
sudo nano /etc/engmarq/backend.env
```

Substituir `REPLACE_ON_VPS`. `SUPABASE_ANON_KEY` é a chave pública; `SUPABASE_SECRET_KEY` é exclusivamente do backend.
Não colocar aspas nas chaves: `env_file` usa `format: raw` para preservar `$` e outros caracteres sem interpolação.
`CORS_ORIGINS` deve ser JSON: `["https://norveo.com.br","https://natans040.github.io"]`, sem caminhos. Preservar a origem antiga durante a transição; aplicar ao arquivo privado existente sem substituir suas demais configurações.
Não é necessário `SUPABASE_SERVICE_ROLE_KEY` quando a Secret Key moderna está configurada.
As variáveis são injetadas em runtime. Não copiar o arquivo para a imagem, usar build args secretos nem publicar a saída de `docker compose config`/`docker inspect`.
Não modificar `backend/.env` local: ele não entra no contexto Docker.

## Verificações e publicação autorizada futura

```bash
sudo docker compose config --quiet
sudo docker compose build api
sudo docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker compose up -d --wait
sudo docker compose ps
curl --fail --silent --show-error https://api.norveo.com.br/health
curl --fail --silent --show-error https://api.norveo.com.br/api/v1/health
```

Caddy solicita HTTPS automaticamente quando DNS e portas estão corretos. Não remover os volumes de certificados (`down -v`).
`restart: unless-stopped` reinicia processos que saem; um healthcheck unhealthy sozinho não reinicia automaticamente o container.
O healthcheck é liveness; autenticação/conexão Supabase exigem o smoke abaixo.
Proxy preserva `/api/v1`; não usar `handle_path` para remover esse prefixo.
Uvicorn confia em headers encaminhados apenas pelo Caddy `172.30.25.2`, não por qualquer cliente.

## Frontend GitHub Pages

- Origem atual inferida do repositório: `https://natans040.github.io`.
- Caminho da aplicação: `/Plataforma-Engmarq-Solution/`, mantido em Vite/React Router.
- API de produção: `https://api.norveo.com.br/api/v1`, fixada no workflow e `.env.production` (somente URL pública).
- GitHub Actions ainda precisa dos secrets públicos `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do mesmo projeto.
- Nunca fornecer Secret Key, senha PostgreSQL ou service_role em qualquer variável `VITE_`.
- Publicar primeiro o backend e validar HTTPS/CORS; só então autorizar publicação do frontend. Não disparar o workflow durante a preparação.
- O fallback SPA usa `__spa` para restaurar rotas, queries e fragments sem duplicar o prefixo. Fragments de Auth não são enviados em query HTTP.

## Smoke curto após publicação

1. Health HTTPS e OPTIONS de `/api/v1/me` com origem Pages e header Authorization.
2. Sem JWT, `/api/v1/me` deve negar acesso (401), não retornar dados.
3. Login de usuário existente no frontend; `/api/v1/me` e leituras por empresa devem funcionar.
4. Abrir documento privado existente por URL assinada; verificar que outro tenant/Super Admin não obtém acesso SST.
5. Recarregar `/login` e `/documentos` diretamente no Pages.

Não criar usuários/empresas/documentos artificiais nem relaxar RLS/Storage para testar o deploy.
EPI/assinaturas/onboarding público/cobrança continuam fora do escopo da fundação 025-A.

## Reprodutibilidade e limites

Dependências diretas Python e as 41 dependências runtime estão fixadas nas versões do ambiente validado.
`requirements.lock` é uma lista de versões exatas, sem hashes de wheels; não é um lock criptográfico.
Imagens Python 3.13 e Caddy estão fixadas por digest multiarch consultado no Docker Hub oficial. Atualizações são deliberadas, acompanhadas de testes.
Docker não instala o projeto via resolução livre: instala a lista fixada e copia apenas `app/`.
O Dockerfile exige wheels; falta de wheel na plataforma alvo interrompe o build, sem compilar silenciosamente dependências diferentes.
Antes de publicar, validar o build Linux e o Caddy real. Validação estática do Compose não substitui esses testes nem prova disponibilidade da VPS.
Para problemas de release, preservar Supabase e usar a imagem anterior compatível; não improvisar rollback do banco.
