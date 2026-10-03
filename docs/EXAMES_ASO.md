# Exames / ASO — contrato definitivo preparado na 023

Implementação em 03/10/2026. Migration 023 e postflight remotos aprovados conforme
evidência informada pelo usuário. Homologação real HTTP/JWT permanece pendente;
ver [relatório de encerramento](audits/2026-10-03/RELATORIO_EXAMES_ASO_023.md).

## Modelo e decisões

`public.documentos` continua sendo a única fonte principal. ASO é identificado
explicitamente por `tipo_id` do tipo documental ASO, nunca pela presença de
`colaborador_id`. Os dois documentos não-ASO associados a colaboradores continuam
documentos comuns.

O campo `resultado_aso TEXT NULL` aceita `apto`, `apto_com_restricao` e `inapto`.
Não há backfill. Ampliar o vocabulário exige ajustar CHECK, schemas e interface
em uma migration futura; não se usa enum PostgreSQL nem catálogo paralelo.
Observações livres permanecem independentes e intactas. NULL significa não
informado, inclusive quando a observação legada contém “Apto”.

Novos ASOs exigem colaborador e um dos cinco subtipos. A FK composta existente
continua garantindo tenant. O trigger também valida conversões de documento comum
para ASO, impede retirar vínculos/subtipos preenchidos e mudar ASO para outro tipo.
Não há NOT NULL global. Campos legados nulos podem permanecer nulos numa edição
que não os altere. Procedimentos novos/alterados são validados contra o catálogo;
os arrays históricos não são reescritos.

`emissao` permanece data de emissão, nullable. Não adicionamos `data_realizacao`
porque não há necessidade funcional confirmada de uma segunda data. O formulário
usa o rótulo emissão. Vencimento e arquivo são opcionais. Não há sugestão de um ano
nem regra médica/periodicidade automática. Datas novas/alteradas não podem ter
vencimento anterior à emissão; datas legadas intactas não são reavaliadas ao editar
outro campo.

Status ASO é calculado em cada leitura: vencido antes de hoje; vencendo de hoje até
30 dias inclusive; vigente nos demais casos, incluindo vencimento não informado.
Backend e view usam o dia em `America/Sao_Paulo`. A dependência `tzdata` permite o
mesmo comportamento no Windows. O status persistido continua existindo por
compatibilidade, mas não é usado como verdade temporal do ASO. Documentos comuns
mantêm a janela de 60 dias da view existente. Dashboard agora conta documentos por
`status_calculado` dessa view, sem depender do status que envelhece no registro.

## API e autorização

Todas as rotas abaixo possuem prefixo `/api/v1`, exigem JWT validado e perfil/empresa
ativos. `empresa_id`, `tipo_id`, paths, URLs e status não são aceitos como inputs
de CRUD de ASO. Tenant vem do perfil verificado. Queries arbitrárias são recusadas.
O cliente Supabase usa a chave pública e o JWT do ator; nunca service_role.

| Método | Endpoint | Operação |
|---|---|---|
| GET | /exames | ASOs do tenant, com paginação interna completa |
| GET | /colaboradores/{id}/exames | ASOs do colaborador validado no tenant |
| GET | /exames/{id} | Obter ASO do tenant |
| POST | /exames | Cadastrar ASO |
| PATCH | /exames/{id} | Editar campos explicitamente enviados |
| DELETE | /exames/{id} | Excluir registro, preservando objetos |
| GET | /exames/catalogo | Procedimentos autorizados |
| POST | /exames/{id}/arquivo | Anexar/substituir PDF com corpo binário |
| GET | /exames/{id}/arquivo | Signed URL para visualização, 60 segundos |
| GET | /exames/{id}/download | Signed URL para download, 60 segundos |

Empresa/gestor gerenciam apenas o tenant próprio. Operacional lê, inclusive arquivos,
sem cadastro, edição ou exclusão. Admin não tem acesso operacional. Superadmin não
existe no enum atual e não integra nenhuma allowlist. Anon, inativo e empresa
suspensa são bloqueados. ID estrangeiro/inexistente resulta em 404; associação de
colaborador inválido é recusada. RLS permanece obrigatória, com FK e triggers como
proteções adicionais.

## Exclusão e arquivos

A exclusão física já era a semântica de Documentos e do serviço ASO. Não havia
auditoria/versionamento próprios. A API mantém essa semântica explícita, com
confirmação visual, sem inventar desativação ou tabela histórica nesta fase.
O histórico de exames cadastrados fica na coleção de documentos do colaborador;
isso não representa um log de alterações. Excluir remove o registro e é irreversível.

Arquivos existentes não são movidos/removidos. Leituras aceitam paths canônicos e
URLs públicas legadas do projeto configurado apenas como identidade para nova
assinatura. URLs assinadas e paths de outros tenants são recusados como identidade.
Signed URLs emitidas continuam utilizáveis até sua expiração de 60 segundos.

Novos anexos do módulo são PDFs, com MIME `application/pdf`, assinatura `%PDF-`
e limite de 10 MiB verificados no backend. A validação de assinatura não é análise
antivírus nem validação completa da estrutura do PDF. O bucket compartilhado mantém
os sete MIME existentes; arquivos legados em formatos suportados continuam legíveis.

O ASO é persistido antes do upload. O servidor só recebe o ID do ASO; gera um path
aleatório na pasta do tenant e persiste a referência após o envio. Em rejeição
definitiva da persistência, verifica se o novo objeto foi referenciado antes de
tentar compensar o upload. Em timeout/erro indeterminado, conserva o objeto para
inventário posterior, evitando apagar um arquivo cuja gravação possa ter sido
confirmada pelo banco. Não há transação distribuída entre Storage/PostgREST.
O formulário informa quando o registro foi salvo mas o anexo não foi confirmado,
e impede repetir o cadastro no mesmo modal. Substituições e exclusões conservam
objetos anteriores, pois podem ter referências compartilhadas ou URLs legadas.

## Consumidores

Exames, perfil do colaborador e exportações utilizam a API ASO e seu status atual.
Documentos consulta documentos comuns diretamente no Supabase, excluindo ASO,
e reúne os ASOs devolvidos pela API. As ações de ASO em Documentos levam a Exames
ou usam os endpoints de arquivos; o formulário genérico não cria/edita ASOs.
Caches ASO/Documentos/Dashboard são invalidados após mutações. Chaves das consultas
ASO incluem ator/tenant/permissão para não expor cache operacional após troca de papel.
Admin não vê indicadores fictícios de saúde ocupacional. Agenda simulada foi retirada;
agendamento permanece fora do módulo implementado.

## Runbook remoto já concluído

A sequência abaixo registra o procedimento concluído pelo usuário. Não reaplicar
a 023; o preflight é destinado ao estado anterior à migration.

1. Não publicar este frontend/backend antes da 023.
2. Em uma nova sessão administrativa do SQL Editor do projeto correto, executar
   **todo** `supabase/tests/023_exames_aso_preflight_readonly.sql`.
3. Salvar todos os resultados, inclusive os quatro fingerprints `Preservação:`.
   Qualquer BLOQUEIO ou erro reprova o estado: não aplicar a migration nesse caso.
   As ATENÇÕES de fingerprints exigem comparação posterior; não são correções.
4. Com zero bloqueios e sem alterações concorrentes dos dados entre as verificações,
   executar **todo** `supabase/migrations/023_exames_aso.sql`, uma única vez.
5. Executar **todo** `supabase/tests/023_exames_aso_postflight_readonly.sql`.
6. Exigir zero bloqueios e igualdade exata dos quatro fingerprints pre/post,
   além dos 12 documentos, 4 ASOs, 27 procedimentos e resultado novo NULL nos
   quatro ASOs. Enviar ambos os resultados para revisão antes da publicação.

Pre/post são apenas leitura e devolvem contagens, hashes e classificações do catálogo,
sem nomes, CPF, texto livre, dados médicos individuais ou paths/URLs de arquivos.
Contagens fixas representam o inventário aprovado: mudanças desde esse inventário
exigem análise. Os fingerprints devem coincidir no MESMO banco antes/depois;
não se comparam aos dados sintéticos dos testes. EPI/Assinaturas não são prerequisites
nem objetos modificados pela 023.
