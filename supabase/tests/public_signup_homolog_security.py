"""Supplemental tests exclusively on the already-created local synthetic stack."""
import json
import subprocess
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.norveo-homolog.local'
status = json.loads((WORK / 'status.json').read_text(encoding='utf-8'))
assert status['API_URL'] == 'http://127.0.0.1:54321'
key = status['ANON_KEY']
client = httpx.Client(timeout=20, trust_env=False)
results = []

def sql(source):
    p = subprocess.run(['docker', '--host', 'npipe:////./pipe/dockerDesktopLinuxEngine',
                        'exec', '-i', 'supabase_db_norveo-homolog.local', 'psql',
                        '-X', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                       input=source, capture_output=True, text=True, encoding='utf-8', timeout=60)
    assert p.returncode == 0, 'Local SQL failed'
    return p.stdout.strip()

def request(path, payload, token=None, method='POST'):
    return client.request(method, status['API_URL'] + path, json=payload,
                          headers={'apikey': key, 'Authorization': 'Bearer ' + (token or key)})

try:
    assert sql('SELECT enabled FROM engmarq_private.public_signup_control WHERE singleton') == 'f'
    sql("SET norveo.signup_approval_reference='ISOLATED-SECURITY-HOMOLOGATION';" + (ROOT / 'supabase/pending/public_company_signup_activate.sql').read_text(encoding='utf-8'))
    counts = sql('SELECT (SELECT count(*) FROM auth.users)||\':\'||(SELECT count(*) FROM empresas)')
    valid = {'version': '1', 'razao_social': 'Synthetic', 'full_name': 'Synthetic', 'cnpj': '33.000.167/0001-01'}
    for n, data in enumerate([{}, {'norveo_internal_provisioning': True},
                             {'norveo_signup': dict(valid, cnpj='11111111111111')},
                             {'norveo_signup': dict(valid, role='admin')}, {'norveo_signup': valid}]):
        r = request('/auth/v1/signup', {'email': f'attack{n}@example.com', 'password': 'Synthetic-only-password-123!', 'data': data})
        assert r.status_code >= 400 and r.status_code != 429, 'Expected trigger rejection, not rate limiting'
    assert sql('SELECT (SELECT count(*) FROM auth.users)||\':\'||(SELECT count(*) FROM empresas)') == counts
    results.append({'name': 'Real Auth missing identity/spoofed admission/invalid CNPJ/extra role/duplicate CNPJ', 'status': 'PASS'})
    r = request('/auth/v1/token?grant_type=password', {'email': 'owner@example.com', 'password': 'Synthetic-only-password-123!-changed'})
    assert r.status_code == 200
    session = r.json()
    token, uid = session['access_token'], session['user']['id']
    company = sql(f"SELECT empresa_id FROM user_profiles WHERE id='{uid}'")
    request('/rest/v1/user_profiles?id=eq.'+uid, {'role': 'admin'}, token, 'PATCH')
    assert sql(f"SELECT role FROM user_profiles WHERE id='{uid}'") == 'empresa'
    target = '00000000-0000-4000-8000-000000000101'
    r = request('/rest/v1/colaboradores', {'empresa_id': target, 'nome': 'Synthetic unauthorized', 'cpf': '00000888888',
                 'funcao_id': target, 'setor_id': target, 'data_admissao': '2026-01-01'}, token)
    assert r.status_code >= 400 and r.status_code != 429
    assert sql("SELECT count(*) FROM colaboradores WHERE cpf='00000888888'") == '0'
    r = request('/auth/v1/signup', {'email': 'owner@example.com', 'password': 'Synthetic-only-password-123!', 'data': {'norveo_signup': valid}})
    assert r.status_code in (200, 400, 422), 'Unexpected duplicate-email result'
    assert sql('SELECT (SELECT count(*) FROM auth.users)||\':\'||(SELECT count(*) FROM empresas)') == counts
    assert sql(f"SELECT empresa_id FROM user_profiles WHERE id='{uid}'") == company
    results.append({'name': 'Real JWT self-promotion/cross-tenant write denial and duplicate email preservation', 'status': 'PASS'})
finally:
    sql((ROOT / 'supabase/pending/public_company_signup_close.sql').read_text(encoding='utf-8'))
    assert sql('SELECT enabled FROM engmarq_private.public_signup_control WHERE singleton') == 'f'
    (WORK / 'security-results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    client.close()
print(json.dumps(results))
