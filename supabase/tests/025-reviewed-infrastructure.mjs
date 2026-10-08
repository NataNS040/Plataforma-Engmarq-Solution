// Reviewed PRE-025 evidence supplied by the user on 2026-10-05.
// Local fixture only: this module never installs anything in a remote project.
import assert from 'node:assert/strict'
// Creation date/installer are unknown. This is compatible with the Supabase
// auto-RLS example, but its exception handler logs without re-raising.
export const reviewedRlsBody = `
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
       AND cmd.schema_name IN ('public')
       AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format(
          'alter table if exists %s enable row level security',
          cmd.object_identity
        );
        RAISE LOG
          'rls_auto_enable: enabled RLS on %',
          cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG
            'rls_auto_enable: failed to enable RLS on %',
            cmd.object_identity;
      END;
    ELSE
      RAISE LOG
        'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
        cmd.object_identity,
        cmd.schema_name;
    END IF;
  END LOOP;
END;
`
export const reviewedRlsFixture = `
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $reviewed$${reviewedRlsBody}$reviewed$;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC,anon,authenticated,service_role;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
EXECUTE FUNCTION public.rls_auto_enable();`

// pg_get_functiondef and pasted text do not preserve the source's indentation.
// Hash the ordered lexical tokens, preserving quoted literals/identifiers,
// words and multi-character operators. Do NOT strip whitespace inside literals
// or merge words/operators: such transformations could hide meaningful drift.
// Other functions retain their existing raw prosrc hash contract.
export const reviewedBodyHashSql = String.raw`md5(to_jsonb(ARRAY(
 SELECT token[1] FROM regexp_matches(replace(p.prosrc,E'\r\n',E'\n'),
 $tokens$('(?:[^']|'')*'|"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9$]*|[0-9]+|:=|<>|!=|<=|>=|\|\||\S)$tokens$,
 'g') WITH ORDINALITY AS tokens(token,ord) ORDER BY ord
))::text)`

// Independently pinned review decision: generation must fail if the fixture
// starts producing a different external body or binding. This is not generated
// from the observed fixture and is not a replacement for remote data evidence.
export const reviewedRlsContract = {
 identity:'function:rls_auto_enable()',optional:false,
 detail:{anon:true,authenticated:true,service:true,public_execute:true,
  hash:'0de24df5c1137e470b28c2d0bb471b0c',hash_scheme:'lexical-tokens-v1',
  kind:'f',type:'event_trigger',owner:'postgres',config:['search_path=pg_catalog'],
  definer:true,language:'plpgsql',volatility:'v',client_owner_member:false,
  event_triggers:[{name:'ensure_rls',event:'ddl_command_end',enabled:'O',tags:['CREATE TABLE','CREATE TABLE AS','SELECT INTO']}]}
}
export function assertReviewedInfrastructure(entries,{post=false}={}){
 assert.deepEqual(entries.find(r=>r.identity===reviewedRlsContract.identity),reviewedRlsContract,'Reviewed external RLS contract changed; do not regenerate an unreviewed baseline')
 for(const role of ['anon','authenticated','service_role']){
  const grant=entries.find(r=>r.identity===`grant:public.exames_catalogo_id_seq.${role}`)
  assert.deepEqual(grant.detail,{sequence:post?(role==='service_role'?['USAGE']:[]):['SELECT','UPDATE','USAGE'],table:[],columns:[]},'PRE/POST sequence contract changed')
 }
}
