# Escopo final da 021 — segundo preflight remoto

Este relatório substitui as conclusões de escopo dos relatórios anteriores da 021. Trabalho exclusivamente local, sem execução remota, push, 022 ou início de Exames/ASO.

## Escopo

A 021 corrige segurança da tabela documentos, da view vw_dashboard_documentos, dos writes administrativos de empresas, da referência documental ao colaborador do mesmo tenant e dos helpers públicos usados pelos módulos existentes. Também restaura nas duas funções Users a semântica tenant-only já definida pela 015, a partir de corpos conhecidos 014/015.

**EPI/assinaturas fora do escopo da 021; será tratado na migração própria do módulo EPI.**

Evidência no repositório: backend/app/api/router.py não registra API EPI; frontend/src/services/fichasEpiService.ts usa diretamente as tabelas Supabase e é o consumidor de assinaturas. A auditoria anterior de 2026-10-01 já recomendava escopo próprio para AT05; docs/STORAGE_DOCUMENTOS.md separa assinaturas de documentos/certificados. As migrations legadas 011/012 não demonstram que o módulo foi migrado para a arquitetura atual. O segundo resultado remoto confirma ausência das duas relações e das duas policies de assinaturas.

Foram retirados da 021 os locks, FKs, ACLs, policies e requisitos de RLS EPI, bem como os guards e requisito de bucket privado de assinaturas. Não criamos essas tabelas ou policies no remoto. Se já existem localmente, a 021 conserva seu catálogo e dados; há teste específico para isso. A migration não executa mais DDL em Storage e não precisa da capacidade CREATE/DROP POLICY de storage.objects; os checks de segurança de documentos/certificados das migrations anteriores continuam obrigatórios.

## Users: identificação e comparação semântica

| Função | Hash remoto recebido / corpo conhecido 014 | Corpo esperado 015 e pós-021 |
|---|---|---|
| can_manage_profile(uuid,user_role) | d480fa6014b6f8d31f7de479ebe4a087 | 4536fbb1e37b2407a080dafd59284ac0 |
| guard_profile_update() | 49f698e85e928d639557804e7d9612de | 5332dfa20dc5ad8f8b8a33f31102478c |

Os hashes remotos coincidem exatamente com os corpos lidos na migration 014 e normalizados por CRLF → LF. O segundo CSV também confirma tipos, SECURITY DEFINER, volatilidade, search_path, owner postgres e ACLs esperadas. Não recebemos o result set remoto de pg_get_functiondef: a identificação dos corpos é por correspondência exata com o código conhecido, cuja semântica foi inspecionada. Isso identifica o estado atual das funções, não prova se a 015 deixou de ser aplicada ou se houve restauração posterior da 014.

**can_manage_profile:** a 014 tem uma ramificação `p.role = 'admin'` que autoriza administração funcional global de profiles por admin ativo em empresa ativa. A 015 remove essa ramificação: somente gestor/empresa ativos na empresa ativa, com target_empresa igual ao tenant do ator; target_role não pode ser admin.

**guard_profile_update:** a 014 permite ator admin e aplica a restrição tenant/target-admin somente quando o ator não é admin. A 015 exclui admin dos atores funcionais e aplica a restrição tenant/target-admin a toda atualização authenticated. Ambas preservam id/empresa e todos os campos exceto role/active, negam edição própria e exigem ator ativo/empresa ativa. Ambas mantêm o caminho técnico privilegiado quando o role não é authenticated.

A diferença entre 014 e 015 **não** é uma nova proteção de gestor/empresa contra alteração de tenant ou promoção a admin: essas restrições já existem na 014 para tais atores. A diferença é retirar a gestão operacional global de Users do admin da plataforma. A 021 restaura exatamente as definições da 015, sem modificar policies, trigger ou privilégios funcionais de Users além dos REVOKE/GRANT já estabelecidos pela 015.

Nenhuma dessas funções escreve public.empresas ou seu status. A proteção de estado administrativo da empresa (B05) é guard_empresa_write, as policies e os privilégios de colunas da 021; não se atribui B05 às divergências de profiles. Gestor/empresa podem administrar role/active de outros usuários elegíveis no próprio tenant, conforme contrato já existente; não podem promover a admin, mudar tenant ou identidade. Testes da 021 verificam isso após partir da 014.

## Preflight

- Auditor SELECT integral exige somente os 14 objetos dos módulos existentes, sem EPI. No segundo CSV as únicas causas eram as duas relações EPI, agora excluídas do requisito.
- EPI/assinaturas aparecem como ATENÇÃO informativa explícita de dívida futura; não há aprovação fictícia do módulo.
- As 11 métricas de Documentos/Storage têm gate próprio: public.documentos, public.colaboradores, storage.objects e storage.buckets. A falha de auditoria de outro módulo continua bloqueando a migration, mas não mascara as métricas documentais disponíveis.
- Mantidas contagens 12 documentos, 4 referências legacy, 4 canonical, 0 backfill pendente, 4 objetos; zero MIME/tamanho/referências inválidas; bucket privado, 10 MB e os 7 MIME esperados.
- Users com os corpos seguros 015 permanecem OK; corpos conhecidos 014, **com todos os demais atributos e ACLs corretos**, são PRE_CORRECAO/ATENÇÃO porque a 021 agora os substitui. Corpo desconhecido ou atributo/ACL inseguro continua BLOQUEIO.
- Incluído requisito de ownership para as duas funções Users existentes que agora serão substituídas. Sem assumir ownership de Storage ou de qualquer tabela.

O preflight não aprova novas contagens remotas por inferência: os resultados documentais antigos eram indisponíveis e só a nova execução remota poderá medi-los. Não há garantia antecipada de zero bloqueios.

## Migration e postflight

A migration recusa corpos Users fora do conjunto conhecido 014/015 antes de substituí-los. A substituição está na mesma transação das demais correções. Os arquivos 015–020 permanecem intactos.

O postflight exige exatamente os hashes seguros 015, atributos e ACLs esperados; reaplicar a definição 014 depois da 021 gera BLOQUEIO. Documentos, view, empresas, constraints, triggers e privilégios continuam estritos. Não exige EPI/assinaturas nem altera seus dados.

## Arquivos e validação

Alterados: migration 021; preflight e postflight 021; remediation-fixture.mjs e remediation.test.mjs; expected-021-catalog.json; gerador build_security_checks.py; documentação de Storage/escopo e logs locais.

A fixture principal agora representa EPI e policies de assinaturas ausentes. Uma fixture opcional com o legado existente prova preservação. O gerador atualiza expectativas de catálogo nos SQL canônicos para evitar reintroduzir templates antigos com EPI obrigatório.

Validação final: **51/51 testes** na suíte afetada (`node --test supabase/tests/remediation.test.mjs`) e **348/348 testes** na suíte Supabase completa (`npm test` em supabase/tests), zero falhas e zero ignorados. Logs: scoped-021-tests.log e scoped-021-full-tests.log. A redução em relação aos números anteriores reflete a remoção dos testes de correção antecipada de EPI e sua substituição por testes do escopo real, preservação do legado e Users pré/pós-021. As seis migrations 015–020 coincidem com o manifest SHA-256 preservado. `git diff --check` sem erros.

Cobertura adicional: inventário documental disponível mesmo se a view de Treinamentos não puder ser auditada; objeto documental removido produz contagem 3/4 e referências inválidas mensuradas mesmo sem EPI; ACL insegura de Users continua bloqueando; corpo desconhecido é rejeitado também pela migration; Users 014 reaplicado pós-021 bloqueia o postflight; admin não administra profiles operacionais; gestor não pode alterar id, tenant ou promover a admin. São testes PostgreSQL local em memória (PGlite), não homologação remota.

STATUS LOCAL: escopo corrigido e validado; pronto para repetir somente o preflight remoto. Aplicação da 021 não executada nem homologada remotamente. Retornar o resultado completo do novo preflight antes de decidir sobre aplicação.

Simulação explícita do estado informado (EPI/assinaturas ausentes e corpos Users 014): preflight local com **0 bloqueios / 8 atenções**; após a 021, postflight local com **0 bloqueios / 5 atenções**. Resultados completos em scoped-021-local-checks.json. Estes números são da fixture sintética local; as métricas reais remotas ainda precisam ser medidas pelo novo preflight.
