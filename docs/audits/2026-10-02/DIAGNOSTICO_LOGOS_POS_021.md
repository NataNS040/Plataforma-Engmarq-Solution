# Logos após a 021 — diagnóstico e proposta

## Conclusão

As policies logos_storage_insert/select/update são criadas pela **013_configuracoes_gaps.sql**, não pela 021. A 021 aplicada não cria nem remove policies de Storage. Sucesso da 021 com essas três policies ausentes é, portanto, comportamento possível e reproduzido localmente; não demonstra execução parcial da 021.

O postflight exige objetos que a própria 021 não implementa: seu expected_policies vem do catálogo completo da fixture local, que executa a 013. O preflight da 021, por outro lado, não exige as três policies de logos: sua baseline anterior não as contém. Esta inconsistência de cobertura deixou passar uma dependência funcional legada e só a detectou depois. Os checks não são prova de que a 021 deveria criá-las.

A origem histórica da ausência remota não está demonstrada: 013 não aplicada, execução parcial antiga, policies removidas ou renomeadas posteriormente são possibilidades. Não existe evidência de que a 021 as tenha apagado. Não se atribui falha de ownership à 021 porque ela não tenta esse DDL.

## Escopo e uso atual

Logos pertence à identidade visual de Empresas/Configurações, módulo existente. Não é o mesmo caso de EPI/assinaturas futuro. O upload continua um fluxo legado de Storage, separado da API atual de Empresas.

- frontend/src/services/empresasService.ts: uploadEmpresaLogo usa bucket `logos`, path `${empresaId}/logo.${ext}`, extensão do nome original, upload com upsert:true/cacheControl:3600; retorna getPublicUrl com query `?v=<timestamp>`.
- frontend/src/modules/configuracoes/ConfiguracoesPage.tsx: LogoCard faz upload e depois atualiza logo_url via hook de Empresas.
- Backend: schemas/repositório de Empresas aceitam e retornam logo_url; o serviço aplica as regras de atualização de Empresas. Não há upload de bytes ou cliente Storage alternativo no backend desse fluxo.
- A 013 declara bucket público, 2 MB e MIME PNG/JPEG/WebP/SVG, mas ON CONFLICT DO NOTHING não corrige uma configuração já existente. A configuração real remota do bucket não foi fornecida.

## Policies equivalentes

No repositório a definição nominal é a 013; a 021 não cria uma alternativa. O CSV remoto fornecido contém as policies de documentos/certificados e nenhuma linha de policy adicional em Storage. Isso não oferece candidato de nome diferente para logos.

Porém, o resultado fornecido é o relatório final, não o result set integral de pg_policies. O postflight ainda exclui nomes assinaturas_% da detecção de policies adicionais; é preciso examinar todas as expressões para excluir definitivamente equivalência ou autorização ampla por outro nome. A configuração do bucket também continua desconhecida. Foi criado logos_audit_readonly.sql, independente da 021, que coleta todos os nomes/cmd/roles/USING/WITH CHECK de Storage, bucket, RLS/owner/hook e referências logo_url. Não foi executado remotamente.

## Impacto de segurança e funcionalidade

A ausência das permissive policies não abre acesso por si só. Com RLS ativo e sem outra policy que autorize logos, INSERT é negado e a edição de identidade visual falha. SELECT+UPDATE também são necessários para upsert. O teste local confirma INSERT negado com SQLSTATE 42501, enquanto os checks críticos de Documentos/Empresas/Users continuam OK.

Se o bucket for público, a falta da policy SELECT não torna URLs públicas privadas: recuperação pública de bytes e acesso autenticado/listagem são caminhos distintos. Não há evidência de perda de logos ou de exposição adicional causada pela 021. A configuração real, existência de objetos e policies amplas precisam do inventário específico.

Não recomendar replay cego da 013: além de alterar Users fora desta correção, sua policy UPDATE permite admin ou qualquer usuário com pasta do próprio tenant, sem restringir role/active/status. Um teste local demonstra operacional ativo atualizando metadata de logo do próprio tenant. A condição não tem WITH CHECK explícito; PostgreSQL reutiliza USING, o que não corrige a autorização ampla do ator. A 013 não é o contrato seguro a restaurar automaticamente só para satisfazer os nomes esperados.

Referências: [Supabase: permissões necessárias para upsert](https://supabase.com/docs/guides/storage/security/access-control), [buckets públicos](https://supabase.com/docs/guides/storage/buckets/fundamentals), [PostgreSQL: USING e WITH CHECK](https://www.postgresql.org/docs/17/sql-createpolicy.html).

## Correção proposta — ainda não implementada como migration

1. Inventariar bucket, objetos e **todas** as policies de Storage com o diagnóstico somente leitura. Confirmar MIME/tamanho/publicidade atuais e o contrato de upload para os atores de Empresas.
2. Se existir autorização equivalente e segura, corrigir o auditor para verificar explicitamente a definição reconhecida, não apenas o nome. Uma policy arbitrária não deve satisfazer o check. Registrar logos separadamente como dependência funcional de Empresas, distinguindo-a da correção implementada pela 021.
3. Se não existir autorização adequada, preparar uma correção **aditiva posterior à 021**, própria de logos. Nenhuma 022 foi criada nesta tarefa. Não editar ou reaplicar 015–021, nem reaplicar a 013 inteira.
4. A correção deverá ser transacional e idempotente: validar bucket/RLS/capacidade hospedada de policy DDL e catálogo conhecido; criar/substituir somente policies próprias de logos; abortar diante de drift não reconhecido; preservar objetos/bytes, bucket documentos, demais policies e Users. Não assumir ownership nem executar ALTER TABLE storage.objects. Não converter a configuração/publicidade do bucket silenciosamente.
5. Autorizar SELECT/INSERT/UPDATE necessários ao upsert com papéis explícitos. Para write: ator ativo, gestor/empresa no tenant próprio com empresa ativa, ou admin autorizado conforme o contrato de administração de Empresas; validar empresa existente e path de logo desse tenant. Usar USING e WITH CHECK explícitos no UPDATE para proteger origem e destino, rejeitando mudança de bucket/tenant/path. Operacional, inativo, empresa suspensa e anon não devem ganhar write. Não conceder DELETE sem necessidade do fluxo. Considerar guards restritivos no bucket para que permissive policies amplas não contornem a regra; avaliar também roles PUBLIC/anon antes de escolher o desenho final.
6. Validar upload novo e substituição, cross-tenant, escalada, rename, bucket diferente, MIME/tamanho, leituras públicas conforme contrato, idempotência e preservação documental. Ajustar postflight para o contrato novo dessa correção, sem reescrever a história da 021.

## Validação local e preservação

Testes em logos_diagnosis.test.mjs demonstram: preservação das policies 013 pela 021; ausência reproduzindo 3 BLOQUEIOS/5 ATENÇÕES; ausência negando INSERT; policies equivalentes renomeadas funcionando mas falhando no check nominal; autorização operacional ampla da 013; diagnóstico executado em READ ONLY sem mudar policies/bucket. A suíte remediation.test.mjs foi executada junto para verificar segurança crítica da 021.

Resultado: **56/56 testes passaram** (5 de diagnóstico + 51 da 021), zero falhas, zero ignorados. Log: logos-diagnosis-tests.log. Os sete hashes SHA-256 de 015–021 permaneceram iguais ao manifest capturado no início desta investigação. Não foi necessário ampliar a execução para toda a suíte Supabase: não houve mudança de migration, aplicação ou auditores existentes.

Alterações desta tarefa: somente este relatório, logos_audit_readonly.sql, logos_diagnosis.test.mjs, log de testes e manifest SHA-256. Migrations 015–021, preflight/postflight e seu gerador não foram modificados. Não se apagaram checks para obter aprovação artificial.

STATUS LOCAL: diagnóstico reproduzido; correção proposta e condicionada ao inventário de logos. Correções críticas da 021 aprovadas pelo resultado remoto fornecido; homologação integral de logos ainda pendente. Nenhuma execução remota, push, 022 ou avanço para Exames/ASO.
