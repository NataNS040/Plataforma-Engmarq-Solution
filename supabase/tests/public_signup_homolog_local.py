"""Destructive synthetic homologation; hard-pinned to local Docker and loopback APIs.

Requires fresh .norveo-homolog.local stack, synthetic-app.sql and local status.json.
Never reads production env, backup files or remote credentials.
"""
import html
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import httpx

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.norveo-homolog.local'
HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
DB = 'supabase_db_norveo-homolog.local'
API = 'http://127.0.0.1:54321'
MAIL = 'http://127.0.0.1:54324'
PASSWORD = 'Synthetic-only-password-123!'
results = []


def sql(source):
    p = subprocess.run(['docker', '--host', HOST, 'exec', '-i', DB,
                        'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-qAt',
                        '-v', 'ON_ERROR_STOP=1'], input=source, text=True,
                       capture_output=True, encoding='utf-8', timeout=90)
    if p.returncode:
        raise RuntimeError(p.stderr[-1500:])
    return p.stdout.strip()


def record(name, action):
    try:
        detail = action()
        results.append({'name': name, 'status': 'PASS', 'detail': detail})
        print('PASS', name, flush=True)
        return detail
    except Exception as e:
        # Do not print exception bodies containing local Auth tokens.
        results.append({'name': name, 'status': 'FAIL', 'error_type': type(e).__name__})
        print('FAIL', name, type(e).__name__, flush=True)
        raise


status = json.loads((WORK / 'status.json').read_text(encoding='utf-8-sig'))
assert urlparse(status['API_URL']).hostname in ('127.0.0.1', 'localhost')
anon, service = status['ANON_KEY'], status['SERVICE_ROLE_KEY']
client = httpx.Client(timeout=20, follow_redirects=False, trust_env=False)


def request(path, payload=None, *, key=anon, token=None, method='POST'):
    assert path.startswith('/') and not path.startswith('//')
    return client.request(method, API + path, json=payload,
                          headers={'apikey': key, 'Authorization': 'Bearer ' + (token or key)})


def ok(response):
    assert response.status_code < 300, f'Unexpected HTTP {response.status_code}'
    return response.json() if response.content else None


def ident(n):
    return f'00000000-0000-4000-8000-{n:012d}'


def mail_link(email, kind):
    for _ in range(30):
        messages = client.get(MAIL + '/api/v1/messages').json().get('messages', [])
        for message in messages:
            if any(item.get('Address') == email for item in message.get('To', [])):
                body = client.get(MAIL + '/api/v1/message/' + message['ID']).json()
                links = re.findall(r'https?://[^\s"<>]+', html.unescape(body.get('HTML', '') + body.get('Text', '')))
                for link in links:
                    parsed = urlparse(link)
                    if parsed.hostname in ('127.0.0.1', 'localhost') and parsed.port == 54321 and '/auth/v1/verify' in parsed.path:
                        if parse_qs(parsed.query).get('type', [''])[0] == kind:
                            return link
        time.sleep(.2)
    raise AssertionError('Expected local email not received')


def follow_link(link):
    assert urlparse(link).hostname in ('127.0.0.1', 'localhost')
    response = client.get(link)
    assert response.status_code in (302, 303)
    location = response.headers['location']
    assert urlparse(location).hostname in ('127.0.0.1', 'localhost')
    values = parse_qs(urlparse(location).fragment)
    assert 'access_token' in values
    return values['access_token'][0]


try:
    if '--resume-auth' not in sys.argv:
        # Refuse reuse of an already-migrated local instance.
        assert sql("SELECT to_regclass('engmarq_private.public_signup_control') IS NULL") == 't'
        if '--resume-fixture' not in sys.argv:
            assert sql("SELECT to_regclass('public.empresas') IS NULL") == 't'
            for n in range(1, 11):
                created = ok(request('/auth/v1/admin/users', {'id': ident(n), 'email': f'user{n}@example.com',
                             'password': PASSWORD, 'email_confirm': True}, key=service))
                assert created['id'] == ident(n), 'GoTrue failed to preserve supplied UUID'
            dump = (WORK / 'synthetic-app.sql').read_text(encoding='utf-8')
            # Do not inherit broad destination ACLs absent from synthetic source.
            sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated,service_role;'
                'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon,authenticated,service_role;'
                'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon,authenticated,service_role;')
            dump = dump.replace('CREATE SCHEMA public;', '-- existing managed local public schema')
            sql(dump)
            # pg_dump --schema omits global event triggers.
            sql("CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable()")
        protected = ['empresas', 'user_profiles', 'colaboradores', 'empresa_comercial',
                     'empresa_features', 'empresa_limites', 'empresa_uso', 'documentos',
                     'funcoes', 'setores', 'ambientes', 'auditoria_comercial']
        def snapshot():
            return {table: sql(f"SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY to_jsonb(e)::text),'[]'::jsonb)::text) FROM public.{table} e") for table in protected}
        before = snapshot()
        record('025-A synthetic schema candidate preflight', lambda: sql((ROOT / 'supabase/pending/public_company_signup_preflight_readonly.sql').read_text(encoding='utf-8')))
        record('candidate installed only locally, gate closed', lambda: sql((ROOT / 'supabase/pending/public_company_signup.sql').read_text(encoding='utf-8')))
        record('installation preserves all 12 existing synthetic data sets', lambda: snapshot() == before or (_ for _ in ()).throw(AssertionError('Data changed')))
        sql("NOTIFY pgrst, 'reload schema'")
        time.sleep(2)

        def closed():
            for data in ({}, {'norveo_internal_provisioning': True}, {'role': 'admin', 'empresa_id': ident(101)}):
                response = request('/auth/v1/signup', {'email': 'denied@example.com', 'password': PASSWORD, 'data': data})
                assert response.status_code >= 400
            assert sql("SELECT count(*) FROM auth.users WHERE email='denied@example.com'") == '0'
            return 'Auth blocks creation and leaves no rows'
        record('closed gate denies unauthorized Auth signup', closed)

        def internal():
            sys.path.insert(0, str(ROOT / 'backend'))
            from app.core.config import Settings
            from app.integrations.supabase import create_user_client
            from app.services.usuarios_service import create_usuario
            from app.schemas.profile import MeResponse
            from app.schemas.usuarios import UsuarioCreate
            from uuid import UUID
            data = UsuarioCreate(email='internal@example.com', password=PASSWORD, full_name='Synthetic Internal', role='operacional')
            settings = Settings(_env_file=None, supabase_url=API, supabase_anon_key=anon,
                                supabase_service_role_key=service, internal_user_creation_enabled=True)
            actor_token = ok(request('/auth/v1/token?grant_type=password', {'email': 'user3@example.com', 'password': PASSWORD}))['access_token']
            actor = MeResponse(id=UUID(ident(3)), full_name='User 3', role='gestor', empresa_id=UUID(ident(101)), active=True)
            with httpx.Client(timeout=20, trust_env=False) as user_http:
                user_client = create_user_client(settings, actor_token, user_http)
                user = create_usuario(data, actor, settings, user_client).user_id
            assert sql(f"SELECT role||':'||empresa_id::text FROM public.user_profiles WHERE id='{user}'") == 'operacional:' + ident(101)
            ok(request('/auth/v1/token?grant_type=password', {'email': 'internal@example.com', 'password': PASSWORD}))
            return 'Actual backend repository + SDK + GoTrue + RPC; supplied UUID preserved'
        record('internal creation with gate closed', internal)

        def invite():
            response = request('/auth/v1/invite', {'email': 'invite@example.com'}, key=service)
            assert response.status_code >= 400
            assert sql("SELECT count(*) FROM auth.users WHERE email='invite@example.com'") == '0'
            return 'Unsupported invite without admission is safely denied; application invite flow absent'
        record('invite API cannot bypass internal admission', invite)

        sql("SET norveo.signup_approval_reference='ISOLATED-SYNTHETIC-HOMOLOGATION';" + (ROOT / 'supabase/pending/public_company_signup_activate.sql').read_text(encoding='utf-8'))
        def signup(email, cnpj):
            return ok(request('/auth/v1/signup', {'email': email, 'password': PASSWORD, 'data': {
                'norveo_signup': {'version': '1', 'razao_social': 'Synthetic Company', 'full_name': 'Synthetic Owner', 'cnpj': cnpj},
                'role': 'admin', 'empresa_id': ident(101)}}))
        owner = record('public signup creates company before email confirmation', lambda: signup('owner@example.com', '33.000.167/0001-01'))
    else:
        results.extend(json.loads((WORK / 'results.json').read_text(encoding='utf-8')))
        assert sql("SELECT enabled FROM engmarq_private.public_signup_control WHERE singleton") == 't'
        owner = {'id': sql("SELECT id FROM auth.users WHERE email='owner@example.com'")}
    uid = (owner.get('user') or owner)['id']
    assert owner.get('access_token') is None
    assert sql(f"SELECT role FROM user_profiles WHERE id='{uid}'") == 'empresa'
    company = sql(f"SELECT empresa_id FROM user_profiles WHERE id='{uid}'")
    assert sql(f"SELECT max_colaboradores_ativos||':'||ilimitado FROM empresa_limites WHERE empresa_id='{company}'") == '100:false'

    def confirmation():
        assert request('/auth/v1/token?grant_type=password', {'email': 'owner@example.com', 'password': PASSWORD}).status_code >= 400
        token = follow_link(mail_link('owner@example.com', 'signup'))
        ok(request('/auth/v1/token?grant_type=password', {'email': 'owner@example.com', 'password': PASSWORD}))
        assert sql(f"SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id='{uid}'") == 't'
        return token
    token = record('real local confirmation email and login', confirmation)

    def isolation():
        companies = ok(request('/rest/v1/empresas?select=id', token=token, method='GET'))
        assert [x['id'] for x in companies] == [company]
        assert ok(request('/rest/v1/user_profiles?select=id&empresa_id=eq.'+ident(101), token=token, method='GET')) == []
        admin = ok(request('/auth/v1/token?grant_type=password', {'email': 'user1@example.com', 'password': PASSWORD}))['access_token']
        assert len(ok(request('/rest/v1/empresas?select=id', token=admin, method='GET'))) == 4
        assert request('/rest/v1/rpc/autorizar_auth_interno', {'actor_id': uid, 'user_id': ident(991), 'email': 'bad@example.com'}, token=token).status_code >= 400
        return 'Company owner sees own tenant; synthetic Superadmin sees all 4; owner cannot call privileged admission'
    record('real JWT isolation and Superadmin', isolation)

    def quota():
        for table in ('funcoes', 'setores'):
            ok(request('/rest/v1/' + table, {'empresa_id': company, 'nome': 'Synthetic'}, token=token))
        func = ok(request('/rest/v1/funcoes?select=id', token=token, method='GET'))[0]['id']
        sector = ok(request('/rest/v1/setores?select=id', token=token, method='GET'))[0]['id']
        rows = [{'empresa_id': company, 'nome': 'Synthetic', 'cpf': f'{n:011d}', 'funcao_id': func,
                 'setor_id': sector, 'data_admissao': '2026-01-01'} for n in range(100)]
        ok(request('/rest/v1/colaboradores', rows, token=token))
        extra = dict(rows[0], cpf='99999999999')
        response = request('/rest/v1/colaboradores', extra, token=token)
        assert response.status_code >= 400 and response.json()['code'] == 'P2502'
        assert sql(f"SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id='{company}'") == '100'
        employee = sql(f"SELECT id FROM colaboradores WHERE empresa_id='{company}' ORDER BY id LIMIT 1")
        ok(request('/rest/v1/colaboradores?id=eq.'+employee, {'active': False, 'data_demissao': '2026-10-10'}, token=token, method='PATCH'))
        ok(request('/rest/v1/colaboradores', extra, token=token))
        assert request('/rest/v1/colaboradores?id=eq.'+employee, {'active': True, 'data_demissao': None}, token=token, method='PATCH').json()['code'] == 'P2502'
        return '100 accepted; 101st rejected; dismissal frees slot; reactivation beyond cap rejected'
    record('real REST quota boundary and reactivation', quota)

    def race():
        sql(f"DELETE FROM colaboradores WHERE id=(SELECT id FROM colaboradores WHERE empresa_id='{company}' AND active ORDER BY id LIMIT 1)")
        func = sql(f"SELECT id FROM funcoes WHERE empresa_id='{company}' LIMIT 1")
        sector = sql(f"SELECT id FROM setores WHERE empresa_id='{company}' LIMIT 1")
        def insert(n):
            return request('/rest/v1/colaboradores', {'empresa_id': company, 'nome': 'Race synthetic',
                'cpf': f'{n:011d}', 'funcao_id': func, 'setor_id': sector, 'data_admissao': '2026-01-01'}, token=token)
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(insert, [80001, 80002]))
        assert sum(r.status_code < 300 for r in responses) == 1
        assert [r.json()['code'] for r in responses if r.status_code >= 400] == ['P2502']
        assert sql(f"SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id='{company}'") == '100'
        assert sql(f"SELECT count(*) FROM colaboradores WHERE empresa_id='{company}' AND active") == '100'
        return 'Two real REST requests competing for last slot: one commit, one P2502, exact count 100'
    record('new public tenant last-slot concurrency PostgreSQL 17', race)

    def recovery():
        ok(request('/auth/v1/recover', {'email': 'owner@example.com'}))
        recovery_token = follow_link(mail_link('owner@example.com', 'recovery'))
        changed = PASSWORD + '-changed'
        ok(request('/auth/v1/user', {'password': changed}, token=recovery_token, method='PUT'))
        assert request('/auth/v1/token?grant_type=password', {'email': 'owner@example.com', 'password': PASSWORD}).status_code >= 400
        ok(request('/auth/v1/token?grant_type=password', {'email': 'owner@example.com', 'password': changed}))
        return 'Local recovery email consumed, password changed and login checked'
    record('real recovery email and password reset', recovery)
    record('local postflight and close preserves tenants', lambda: sql((ROOT / 'supabase/pending/public_company_signup_postflight_readonly.sql').read_text(encoding='utf-8')) and sql((ROOT / 'supabase/pending/public_company_signup_close.sql').read_text(encoding='utf-8')))
finally:
    # Never serialize response objects, JWTs, passwords or local API keys.
    for item in results:
        if isinstance(item.get('detail'), (dict, list)) or item['name'] == 'real local confirmation email and login':
            item['detail'] = 'Validated; response/tokens omitted'
    (WORK / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    client.close()
