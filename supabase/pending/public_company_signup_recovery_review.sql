-- Prepared support triage, READ ONLY. No release, transfer, reset or deletion.
-- Set norveo.support_cnpj to the submitted CNPJ in the approved trusted session.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Support review requires trusted operator'; END IF;
 IF NOT engmarq_private.cnpj_valido(current_setting('norveo.support_cnpj',true)) THEN
  RAISE EXCEPTION 'Support review requires one valid CNPJ'; END IF;
END $$;
SELECT e.id empresa_id,e.cnpj_canonico,e.status,p.id auth_user_id,p.active,
 s.id IS NOT NULL cadastro_publico,
 CASE WHEN s.id IS NOT NULL THEN u.email_confirmed_at IS NOT NULL END email_confirmado,s.estado provisionamento,
 s.criado_em,s.expira_em,clock_timestamp()>s.expira_em prazo_operacional_ultrapassado,
 'Nao liberar CNPJ nem transferir empresa automaticamente' orientacao
FROM public.empresas e
LEFT JOIN engmarq_private.onboarding_solicitacoes s ON s.empresa_id=e.id AND s.estado='completed'
LEFT JOIN auth.users u ON u.id=s.auth_user_id
LEFT JOIN public.user_profiles p ON p.id=u.id AND p.empresa_id=e.id
WHERE e.cnpj_canonico=engmarq_private.cnpj_canonico(current_setting('norveo.support_cnpj',true));
ROLLBACK;
