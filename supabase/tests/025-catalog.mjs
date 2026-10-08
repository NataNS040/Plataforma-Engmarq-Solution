import {catalog as previous} from './024-catalog.mjs'
import {reviewedBodyHashSql} from './025-reviewed-infrastructure.mjs'
export const catalog=previous
 .replace(/\(n\.nspname='public' AND c\.relname IN \([^)]*\)\)/, "(n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))")
 .replace(/\(n\.nspname='public' AND p\.proname IN \([^)]*\)\)/, "(n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'))")
 .replace("c.relname='onboarding_solicitacoes'","c.relname IN ('onboarding_solicitacoes','fundacao_025_legado','colaborador_transicoes','documento_tipo_features','documento_objeto_features')")
 .replaceAll("tablename='onboarding_solicitacoes'","tablename IN ('onboarding_solicitacoes','fundacao_025_legado','colaborador_transicoes','documento_tipo_features','documento_objeto_features')")
 .replace("('get_user_empresa_id','get_user_role','update_documento_status','update_treinamento_status','update_ficha_epi_item_status')",
  "('get_user_empresa_id','get_user_role','update_documento_status','update_treinamento_status','update_ficha_epi_item_status','reservar_arquivo_sst','provisionar_perfil_interno')")
 .replace("(VALUES('anon'),('authenticated'))","(VALUES('anon'),('authenticated'),('service_role'))")
 // Sequences have SELECT/UPDATE/USAGE, not table or column ACLs. In particular
 // has_table_privilege silently misses USAGE. Keep strict comparison: observing
 // a platform default is evidence of origin, not permission to accept any ACL.
 .replace("r.role,jsonb_build_object(", "r.role,CASE WHEN c.relkind='S' THEN jsonb_build_object('sequence',ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','UPDATE','USAGE']) privilege WHERE has_sequence_privilege(r.role,c.oid,privilege) ORDER BY privilege)) ELSE '{}'::jsonb END || jsonb_build_object(")
 .replace("WHERE has_table_privilege(r.role,c.oid,privilege)","WHERE c.relkind<>'S' AND has_table_privilege(r.role,c.oid,privilege)")
 .replace("WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege", "WHERE c.relkind<>'S' AND a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege")
 // Strict known external object. No name-only exemption: its body tokens,
 // language, ordinary function kind, PUBLIC EXECUTE and ALL attached event
 // trigger bindings are part of both the PRE and POST structural contracts.
 .replace("'hash',md5(replace(p.prosrc,E'\\r\\n',E'\\n'))",
  `'hash',CASE WHEN n.nspname='public' AND p.proname='rls_auto_enable' AND p.pronargs=0 THEN ${reviewedBodyHashSql} ELSE md5(replace(p.prosrc,E'\\r\\n',E'\\n')) END`)
 .replace("'service',has_function_privilege('service_role',p.oid,'EXECUTE'))",
  `'service',has_function_privilege('service_role',p.oid,'EXECUTE')) ||
 CASE WHEN n.nspname='public' AND p.proname='rls_auto_enable' AND p.pronargs=0 THEN jsonb_build_object(
 'hash_scheme','lexical-tokens-v1','language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),'kind',p.prokind,
 'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
 'event_triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.evtname,'event',t.evtevent,'enabled',t.evtenabled,
 'tags',ARRAY(SELECT tag FROM unnest(t.evttags) tag ORDER BY tag)) ORDER BY t.evtname),'[]'::jsonb) FROM pg_event_trigger t WHERE t.evtfoid=p.oid)
 ) ELSE '{}'::jsonb END`)
export const preservationTables=['empresas','user_profiles','colaboradores','funcoes','setores','ambientes','documentos',
 'documento_tipos','treinamentos','treinamento_tipos','matriz_treinamentos','exames_catalogo','storage.objects','storage.buckets',
 'fichas_epi','fichas_epi_itens','engmarq_private.onboarding_solicitacoes','empresa_diagnostico_sst']
export const preservation=preservationTables.map(t=>`SELECT 'Preservação: ${t}' check_name,
 CASE WHEN to_regclass('${t.includes('.')?t:'public.'+t}') IS NULL THEN 'ausente' ELSE
 (xpath('/table/row/fingerprint/text()',query_to_xml('SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,''[]'')) fingerprint FROM ${t.includes('.')?t:'public.'+t} r',true,false,'')))[1]::text END result`).join('\nUNION ALL ')
export function contractDiff(expected,{pre=false}={}) {
 const json=JSON.stringify(expected).replaceAll("'","''")
 return `WITH actual AS (${catalog}),expected AS (SELECT * FROM jsonb_to_recordset('${json}'::jsonb)e(identity text,detail jsonb,optional boolean))
 SELECT coalesce(a.identity,e.identity) check_name,CASE WHEN a.detail IS NOT DISTINCT FROM e.detail THEN 'contrato conferido'
 WHEN a.identity IS NULL THEN 'ausente' WHEN e.identity IS NULL THEN 'objeto adicional' ELSE 'contrato divergente' END result,
 CASE WHEN a.detail IS NOT DISTINCT FROM e.detail THEN 'OK'
 WHEN a.identity IS NULL AND e.optional THEN 'ATENÇÃO' ELSE 'BLOQUEIO' END status,
 jsonb_build_object('atual',a.detail,'esperado',e.detail,'opcional_ausente',a.identity IS NULL AND e.optional) details
 FROM actual a FULL JOIN expected e USING(identity)
 WHERE NOT (coalesce(a.identity,e.identity) LIKE 'optional-presence:%')`
}
