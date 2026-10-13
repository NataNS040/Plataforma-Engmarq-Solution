// Files only. Does not open a database, run SQL, read env or contact Supabase.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { catalog } from './025-catalog.mjs'
const audit = await readFile(new URL('./025_fundacao_postflight_readonly.sql',import.meta.url),'utf8')
if(createHash('sha256').update(audit).digest('hex')!=='9cc2cf3fd15bab76cbcdaa48c6504737b2193f599497a7f1913a164884ccc637') {
  throw new Error('Reviewed dependency source changed; review the pinned evidence before regeneration')
}
const match = audit.match(/jsonb_to_recordset\('((?:[^']|'')*)'::jsonb\)/)
if (!match) throw new Error('Reviewed 025-A structural contract not found')
const scope = String.raw`^(relation|column|policy|trigger|constraint|index|grant):public\.(empresas|user_profiles|colaboradores|funcoes|setores|ambientes|features|empresa_comercial|empresa_features|empresa_limites|empresa_uso|auditoria_comercial)(\.|$)|^(relation|column|policy|trigger|constraint|index|grant):engmarq_private\.onboarding_solicitacoes(\.|$)|^function:(engmarq_private\.|get_user_|provisionar_perfil_interno|rls_auto_enable)|^schema:engmarq_private$`
const pattern = new RegExp(scope)
const expected = JSON.parse(match[1].replaceAll("''","'")).filter(r=>pattern.test(r.identity))
if (expected.length<250) throw new Error('Incomplete signup dependency contract')
const compare = `WITH actual AS (SELECT * FROM (${catalog}) catalog WHERE identity ~ '${scope}'),
expected AS (SELECT * FROM jsonb_to_recordset('${JSON.stringify(expected).replaceAll("'","''")}'::jsonb) e(identity text,detail jsonb,optional boolean))
SELECT coalesce(a.identity,e.identity) dependency FROM actual a FULL JOIN expected e USING(identity)
WHERE a.detail IS DISTINCT FROM e.detail`
const assertion = `-- BEGIN GENERATED SIGNUP DEPENDENCY CONTRACT
-- Pinned 024/025-A catalog contract: functions/bodies/owners/ACLs, RLS, policies, columns, constraints and trigger bindings.
-- Changes require review; never regenerate to silence drift. No user-data fingerprints here.
DO $signup_contract$ DECLARE mismatch text; BEGIN
 SELECT dependency INTO mismatch FROM (${compare}) differences ORDER BY dependency LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Signup dependency drift: %; review 024/025-A, no automatic repair',mismatch; END IF;
 IF (SELECT count(*) FROM public.features WHERE feature_key IN
 ('empresa.cadastro','usuarios.gestao','colaboradores.gestao','treinamentos','exames','documentos','relatorios.sst'))<>7 THEN
  RAISE EXCEPTION 'Signup dependency drift: incomplete feature registry'; END IF;
END $signup_contract$;
-- END GENERATED SIGNUP DEPENDENCY CONTRACT`
const url=new URL('../pending/public_company_signup.sql',import.meta.url)
const sql=await readFile(url,'utf8')
const invitations=(await readFile(new URL('../pending/user_invitations.sql',import.meta.url),'utf8')).replaceAll('\r\n','\n')
if(!sql.replaceAll('\r\n','\n').includes('-- BEGIN REVIEWED USER INVITATIONS\n'+invitations+'\n-- END REVIEWED USER INVITATIONS')) throw new Error('Reviewed invitation component is not synchronized')
const result=sql.replace(/-- BEGIN GENERATED SIGNUP DEPENDENCY CONTRACT[\s\S]*?-- END GENERATED SIGNUP DEPENDENCY CONTRACT/,()=>assertion)
if(process.argv.includes('--check')) { if(result!==sql) throw new Error('Signup dependency contract is stale') }
else await writeFile(url,result)

const preflight = `-- Prepared standalone preflight. Catalog only, no mutation or automatic repair.\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${result.match(/DO \$\$ DECLARE required_column[\s\S]*?END \$\$;/)[0]}\n${assertion}\nROLLBACK;\n`
const body = result.match(/CREATE FUNCTION engmarq_private\.provision_public_company\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1]
const bodyHash = createHash('md5').update(body.replaceAll('\r\n','\n')).digest('hex')
const postCompare = compare.replace(`identity ~ '${scope}'`, () => `identity ~ '${scope}' AND identity NOT IN ('function:engmarq_private.provision_public_company()','trigger:public.user_profiles.guard_pending_invitation')`)
const postContract = assertion.replace(compare,()=>postCompare)
const admissionBody=result.match(/CREATE FUNCTION public\.autorizar_auth_interno\(actor_id uuid,user_id uuid,email text\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1]
const admissionHash=createHash('md5').update(admissionBody.replaceAll('\r\n','\n')).digest('hex')
const invitationFunctions=[
 ['convite_autorizado','uuid,uuid',true],['convite_criar','uuid,uuid,text,text,user_role,text',true],
 ['convite_listar','uuid,uuid',true],['convite_cancelar','uuid,uuid',true],
 ['convite_falhou','uuid,uuid',true],['convite_aceitar','uuid,uuid',true],['convite_guard_profile','',false],
].map(([name,args,service])=>{
 const source=invitations.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`))[1]
 const hash=createHash('md5').update(source.replaceAll('\r\n','\n')).digest('hex')
 return `IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.${name}(${args})') AND p.prosecdef
 AND p.proowner='postgres'::regrole AND p.proconfig=ARRAY['search_path=""'] AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))='${hash}'
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND has_function_privilege('service_role',p.oid,'EXECUTE')=${service}) THEN RAISE EXCEPTION 'Invitation function drift: ${name}'; END IF;`
}).join('\n')
const installed = `DO $signup_installed$ BEGIN
 ${invitationFunctions}
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('engmarq_private.user_invitations') AND relrowsecurity AND relowner='postgres'::regrole)
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='engmarq_private' AND tablename='user_invitations')
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permission
 WHERE has_table_privilege(r,'engmarq_private.user_invitations',permission))
 OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) permission
 WHERE a.attrelid='engmarq_private.user_invitations'::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r,a.attrelid,a.attnum,permission))
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_profiles'::regclass AND tgname='guard_pending_invitation' AND tgenabled='O' AND tgtype=23
 AND tgfoid='public.convite_guard_profile()'::regprocedure) THEN RAISE EXCEPTION 'Invitation table/trigger drift'; END IF;
 IF current_user<>'postgres' OR current_setting('session_replication_role')<>'origin' THEN
  RAISE EXCEPTION 'Signup postflight requires trusted origin executor'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('engmarq_private.provision_public_company()')
 AND p.prosecdef AND p.proowner='postgres'::regrole AND p.prorettype='trigger'::regtype
 AND p.proconfig=ARRAY['search_path=""'] AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))='${bodyHash}'
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'Signup postflight: provisioning body, owner or ACL drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass
 AND tgname='norveo_public_company_signup' AND tgenabled='O' AND tgtype=5
 AND tgfoid='engmarq_private.provision_public_company()'::regprocedure)
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal
 AND (tgtype & 4)=4 AND tgname<>'norveo_public_company_signup') THEN
  RAISE EXCEPTION 'Signup postflight: incompatible Auth INSERT triggers'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('engmarq_private.public_signup_control')
 AND relrowsecurity AND relowner='postgres'::regrole)
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='engmarq_private' AND tablename='public_signup_control')
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permission
 WHERE has_table_privilege(r,'engmarq_private.public_signup_control',permission))
 OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) permission
 WHERE a.attrelid='engmarq_private.public_signup_control'::regclass AND a.attnum>0 AND NOT a.attisdropped
 AND has_column_privilege(r,a.attrelid,a.attnum,permission)) THEN
  RAISE EXCEPTION 'Signup postflight: gate RLS, ownership or privilege drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.autorizar_auth_interno(uuid,uuid,text)')
 AND p.prosecdef AND p.proowner='postgres'::regrole AND p.proconfig=ARRAY['search_path=""']
 AND md5(replace(p.prosrc,E'\\r\\n',E'\\n'))='${admissionHash}'
 AND has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'Signup postflight: internal admission function drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('engmarq_private.internal_auth_admissions') AND relrowsecurity AND relowner='postgres'::regrole)
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='engmarq_private' AND tablename='internal_auth_admissions')
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) permission
 WHERE has_table_privilege(r,'engmarq_private.internal_auth_admissions',permission))
 OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) permission
 WHERE a.attrelid='engmarq_private.internal_auth_admissions'::regclass AND a.attnum>0 AND NOT a.attisdropped
 AND has_column_privilege(r,a.attrelid,a.attnum,permission)) THEN
  RAISE EXCEPTION 'Signup postflight: internal admission table privilege drift'; END IF;
 IF (SELECT count(*) FROM engmarq_private.public_signup_control)<>1
 OR NOT EXISTS(SELECT 1 FROM engmarq_private.public_signup_control WHERE singleton) THEN
  RAISE EXCEPTION 'Signup postflight: singleton gate missing'; END IF;
END $signup_installed$;`
const postflight=`-- Prepared catalog validation only; no writes or Auth/SMTP requests.\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${postContract}\n${installed}\nSELECT enabled,review_reference,changed_at,changed_by FROM engmarq_private.public_signup_control WHERE singleton;\nROLLBACK;\n`
for(const [name,content] of [['public_company_signup_preflight_readonly.sql',preflight],['public_company_signup_postflight_readonly.sql',postflight]]) {
 const path=new URL(`../pending/${name}`,import.meta.url)
 if(process.argv.includes('--check')) { if(await readFile(path,'utf8')!==content) throw new Error(`${name} is stale`) }
 else await writeFile(path,content)
}
const activationUrl=new URL('../pending/public_company_signup_activate.sql',import.meta.url)
let activation=await readFile(activationUrl,'utf8')
const validation=`-- BEGIN GENERATED SIGNUP ACTIVATION VALIDATION\n${postContract}\n${installed}\n-- END GENERATED SIGNUP ACTIVATION VALIDATION`
const next=activation.includes('-- BEGIN GENERATED SIGNUP ACTIVATION VALIDATION')
 ? activation.replace(/-- BEGIN GENERATED SIGNUP ACTIVATION VALIDATION[\s\S]*?-- END GENERATED SIGNUP ACTIVATION VALIDATION/,()=>validation)
 : activation.replace('UPDATE engmarq_private.public_signup_control',()=>`${validation}\nUPDATE engmarq_private.public_signup_control`)
if(process.argv.includes('--check')) { if(next!==activation) throw new Error('Activation validation is stale') }
else await writeFile(activationUrl,next)
