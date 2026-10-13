# Ponto de recuperação anterior à nova migration — 12/10/2026

**Disponível e validado. Pronto para solicitar autorização da instalação controlada com os controles fechados.** A aprovação desta rodada foi usada exclusivamente para criar cópias, exportar dados em leitura e testar recuperação local. Nenhuma migration, deploy, restart/substituição de container de produção, ativação, email ou alteração de credencial ocorreu.

## Conjunto preservado

| Componente | Destino e evidência |
|---|---|
| Imagens/configuração na VPS | `/root/norveo-recovery-20261012_020841`, diretório 700, arquivos 600; manifesto remoto validado. |
| Cópia fora da VPS + frontend | `C:\Backups\EngMarq\norveo_recovery_20261012_230841`, fora de Git/OneDrive, ACL somente usuário local, SYSTEM e Administradores. |
| Supabase atualizado | `C:\Backups\EngMarq\engmarq_post025a_20261012_230657`, mesmas ACLs privadas; captura concluída em 12/10 à noite, America/Sao_Paulo. |

API preservada: `engmarq-api:norveo-8f342e9`, digest OCI **sha256:0a7f99bf9231177d9aec1acce56b1ce130a4e9e343fb58d31283afa5fc7a2fdf**. Exportação `api-image.tar`: **61169664 bytes**, SHA256 **7163801119115cb49cb558601894211de684594aa644cf7e4cfed9dab6661b9a**. A cópia remota e a local são iguais; Docker local carregou a imagem com o mesmo digest. Container novo sem rede, sem portas e sem env/credenciais de produção respondeu health **200**, depois foi removido. A prova cobre carga/startup, não integração online com Supabase.

Também preservados: imagem Caddy por digest `sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`, Compose atual, Caddyfile atual, `/etc/engmarq/backend.env`, `.env` Compose, inspect completo privado dos containers/imagens e volumes Caddy `/data` e `/config` (incluem chaves TLS, portanto são secretos). Caddy carregado e configuração validada em container local sem rede. Foi permitida somente a capability NET_BIND_SERVICE exigida pelo binário, sem publicação de portas. Nenhum Caddy de produção foi parado.

Frontend: branch remota gh-pages conferida antes/depois, commit exato **5b87e76f1367a20dd682d830dbc5a6530091301d**; main **8f342e932e3e9708509f11a802baa4e0d71e1bdb**. `frontend-gh-pages.tar`: SHA256 **9c1407597fc549e04535c7b4d353c0f3ed1c74632fd16f11714ed935c36c2a23**. Contém **10 arquivos**, incluindo CNAME/.nojekyll. Os **8 arquivos HTTP** foram comparados byte a byte com o site público. Extração local em `frontend-restored` conferiu todos os hashes. Arquivo construído dos blobs Git originais, evitando conversão CRLF do Windows; não houve rebuild ou publicação.

Na VPS, IDs, digests e StartedAt dos containers API/Caddy permaneceram iguais antes/depois; API healthy. Criação interna false, sem rotas de convites na versão atual. Auth permanece `disable_signup=true`, confirmação de email exigida. Settings públicos Auth foram preservados em arquivo privado; não constituem exportação completa da configuração administrativa.

## Banco, RLS e Storage

Dump `postgres.dump`: **610707 bytes**, SHA256 **276287714d15d8939650ed6defb1aa451a68ab2cd293895297e96f8223907cb2**. Banco exportado integralmente com pg_dump custom, preservando schema, funções, triggers, constraints, índices, ACLs e políticas. Roles/memberships exportadas sem senhas de conexão. Auth está no dump: seus hashes de senha e demais dados sensíveis exigem a proteção aplicada ao diretório.

Os **4 objetos privados Storage**, **2265208 bytes**, foram baixados por GET autenticado, com metadata, bucket/caminho original no manifesto privado e SHA256 por arquivo. Buckets vazios também preservados. Fingerprints antes/depois da captura iguais; uma segunda consulta, após os ensaios, confirmou **59/59 tabelas e 871/871 entradas de catálogo iguais à produção**. Produção continuou em leitura. Não foi alegado snapshot atômico comum DB/Storage; antes do corte será necessário confirmar novamente estabilidade/delta.

Restauração nova efetiva em PostgreSQL **17.6**, container independente `norveo-post025-restore-isolated`, `--network none`, nenhuma porta, sem serviços Auth/SMTP, sem credenciais de conexão produção. Resultado final:

- pg_restore `--exit-on-error --single-transaction`: exit **0**.
- **59 tabelas**: contagens e fingerprints exatos.
- **871 entradas de catálogo**: schema/RLS/ACL/owners/funções/triggers iguais.
- RLS exercitada com **2 perfis**: Superadmin enxerga todas as empresas; perfil empresa somente a própria e nenhum perfil de outra empresa.
- Contadores de colaboradores: **zero divergências**.
- **4 arquivos** extraídos nos caminhos originais, bytes/hashes iguais, metadata restaurada no banco.
- **Preflight da candidata ampliada passou somente em leitura no banco restaurado**; a migration NÃO foi aplicada, nem mesmo neste ensaio com dados reais.
- Container de restore removido; nenhum container local de ensaio API/DB permaneceu.

A imagem de teste exige bootstrap local temporário para criar event trigger; flag postgres restabelecida antes da comparação. As roles copiadas são NOLOGIN; o preflight usa administrador local com SET ROLE postgres. Nenhuma senha foi redefinida. As primeiras tentativas detectaram conversão CRLF/formato OCI e limitações de login/capability locais; foram corrigidas e o resultado final foi validado, sem contornar contratos ou mudar dump/dados. Logs diagnósticos históricos privados não substituem o resultado final.

Manifestos conferidos: **15 entradas** do backup original, **14 entradas** de preservação dos artefatos, **11 entradas** de prova da restauração; `VALIDATION_SHA256SUMS.txt` protege também os resultados complementares. `status.json` registra o momento da captura (`restore_tested=false`) e permanece intacto; prova final é `restore-result.json` e `RECOVERY_STATUS.md`. O conjunto anterior `engmarq_post025a_20261010_235555` foi preservado, sem sobrescrita.

Evidências públicas sanitizadas: `docs/audits/2026-10-12-recovery.json` e `docs/audits/2026-10-12-recovery-source-check.json`. Dados/segredos reais ficam somente nos diretórios privados. Scripts usados: preserve_norveo_vps.py, preserve_norveo_local.py, validate_norveo_artifacts_local.py, backup_post025_readonly.py, restore_post025_isolated.py, finalize_norveo_recovery.py e prepare_backup_catalog.mjs. Os scripts de preservação desta rodada apontam explicitamente para este conjunto; não são scripts genéricos de deploy/rollback.

## Procedimento de recuperação futura — requer autorização própria

### API

1. Confirmar janela/aprovação e preservar estado falho antes de substituir qualquer configuração. Conferir SHA256SUMS remoto e local; se VPS perdida, usar a cópia privada local por transferência SSH protegida.
2. Carregar `api-image.tar` com `docker image load --input <cópia-protegida>/api-image.tar`; conferir image inspect com digest exato acima. Exportação por digest pode não recriar a tag: executar `docker image tag sha256:0a7f99bf9231177d9aec1acce56b1ce130a4e9e343fb58d31283afa5fc7a2fdf engmarq-api:norveo-8f342e9` somente na recuperação aprovada. Não rebuildar de fontes flutuantes nem usar latest.
3. Restaurar Compose/Caddyfile/.env preservados quando necessário e backend.env para `/etc/engmarq/backend.env` com modo 600, diretório restrito. Conferir `INTERNAL_USER_CREATION_ENABLED=false`, convites false e controles Auth fechados. Preservar secrets de produção apenas no destino privado, nunca no stdout.
4. Em `/opt/engmarq/production`, validar `docker compose config --quiet`, depois `docker compose up -d --no-deps --pull never api`. Esse comando é um corte/restart e **NÃO foi executado nesta rodada**. Confirmar image ID/health, HTTPS, CORS, login e `/me`, Superadmin/isolamento/Storage.
5. Para rollback apenas da aplicação após instalação da candidata, manter schema instalado e gates fechados: a imagem preservada contém admissão compatível, com criação interna pausada. Não remover triggers ou executar restore antigo para corrigir somente código.

Caddy não precisa ser reiniciado para rollback API. Em recuperação completa da VPS, carregar `caddy-image.tar`, validar digest; usar imagem carregada exata, preservando referência e sem pull/rebuild. Restaurar volumes `/data` e `/config` somente nos volumes correspondentes, sob parada autorizada do Caddy, conferindo propriedade/permissões; nunca extrair sobre um serviço ativo nem executar `down -v`. Se o engine não resolver o nome com digest após load, usar override Compose de recuperação com a imagem local por ID exato, sem alterar a candidata. Validar Caddy sem rede antes do corte, depois HTTPS/certificados. Os volumes copiados foram lidos com serviço ativo; hashes da cópia são comprovados, mas não foi feita prova de renovação TLS/restauração completa da VPS.

### Frontend

1. Verificar SHA do tar e commit registrados; extrair em diretório novo e validar todos os hashes do manifesto. Manter CNAME norveo.com.br, .nojekyll e 404.html. Não gerar bundle novamente: variáveis de build fazem parte dos bytes preservados.
2. Sob autorização de deploy, publicar **o conteúdo exato de `frontend-restored`** com mecanismo Pages de rollback que publique diretório existente (sem npm build), somente para gh-pages. Fazer novo commit de recuperação contendo a árvore preservada sobre o HEAD atual, mantendo histórico; não force-push de branch nem publicar os outros diretórios privados do ponto de recuperação.
3. Conferir conclusão do Pages, CDN, hashes dos 8 arquivos, SPA/404, login/recovery e controles fechados. Esperar propagação/cache antes de concluir. Esse deploy futuro não foi disparado; workflow atual de build normal não é a prova de restauração de bytes exatos.

### Banco e arquivos Storage

1. Banco não é o primeiro recurso para falhas de código. Antes de full restore, autorização específica de indisponibilidade, suspensão coordenada de escrita e reconciliação de alterações após a captura. Fazer backup do estado falho para auditoria; não sobrescrever conjuntos existentes.
2. Verificar manifestos, decodificação do dump e executar novamente ensaio em destino novo sem rede. O comando local comprovado foi `backend/.venv/Scripts/python.exe scripts/restore_post025_isolated.py C:/Backups/EngMarq/engmarq_post025a_20261012_230657`. Ele é somente ensaio e **não é comando de restore hospedado**.
3. Para Supabase hospedado, escolher procedimento suportado de restauração do projeto ou recuperação em projeto separado; compatibilizar versão PG/extensões/roles gerenciadas e schema Auth/Storage. Não executar cegamente pg_restore integral sobre banco gerenciado ativo: conflitos de objetos/owners/serviços exigem preparação e validação próprias.
4. Restaurar os bytes Storage pela API/fluxo suportado com metadata consistente, bucket/caminho/cotas/privacidade preservados. Não tratar somente restore de `storage.objects` como restore dos arquivos. O ensaio atual provou metadata DB + arquivos em filesystem protegido, não upload em serviço hospedado.
5. Conferir fingerprints de negócio, FKs/constraints, catálogo/RLS, isolamento, empresas/usuários/limites/uso, buckets privados e hashes/legibilidade de arquivos. Reconciliar deltas antes da retomada de escrita. Auth deve permanecer fechado durante validação; teste real de email/senha requer aprovação separada.

## Limitações explícitas

- **Auth:** tabelas/identidades/hashes preservados e comparados, mas não foi iniciado GoTrue com dados reais. Signing keys/JWT secrets, configurações externas de providers, redirects, hooks administrativos, templates, SMTP, CAPTCHA e rate limits não são totalmente recuperados pelo dump. Backend.env preserva as credenciais já usadas pela API, sem rotação; settings públicos não substituem um export administrativo/cofre. Sessões antigas não são garantia de login após mudança de projeto/chaves. Planejar reautenticação/reconciliação com aprovação, sem alteração automática de senha.
- **Vault:** dump não comprova descriptografia; depende das chaves e infraestrutura de criptografia do projeto. Nenhuma chave mestre foi exportada, testada ou substituída.
- **Serviços hospedados:** engine/infraestrutura Supabase, APIs, Storage, Realtime, Edge Functions/secrets, DNS/Pages e configuração Brevo exigem recuperação própria. Este ponto não é uma réplica integral inicializável da plataforma. [Backup Supabase](https://supabase.com/docs/guides/platform/backups), [recuperação entre projetos](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- **RPO/RTO:** snapshot DB é consistente, mas DB/Storage/configuração externa não são um snapshot atômico único. Estabilidade foi conferida antes/depois e no fim desta rodada; futuras escritas exigem renovar/reconciliar. RPO zero e RTO integral não foram prometidos.

**Conclusão operacional:** API/frontend podem ser recuperados dos artefatos preservados; banco/RLS/arquivos possuem restauração isolada comprovada e compatibilidade com a candidata validada em leitura. O novo ponto anterior à migration está disponível e utilizável dentro dessas limitações. A próxima autorização pode abranger somente a instalação/deploy com gates fechados, exigindo nova conferência de hashes e delta imediatamente antes do corte. SMTP real, convites, CAPTCHA e cadastro público continuam pendentes de autorizações separadas.
