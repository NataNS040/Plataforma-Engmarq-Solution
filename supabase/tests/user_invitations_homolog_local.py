"""Real backend routes + GoTrue + local mailbox, synthetic data only."""
import html
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.config import Settings

WORK = ROOT / '.norveo-homolog.local'
status = json.loads((WORK / 'status.json').read_text(encoding='utf-8'))
assert status['API_URL'] == 'http://127.0.0.1:54321'
API = status['API_URL']
ANON = status['ANON_KEY']
PASSWORD = 'Synthetic-only-password-123!'
http = httpx.Client(timeout=20, trust_env=False, follow_redirects=False)
app = create_app(Settings(_env_file=None, supabase_url=API, supabase_anon_key=ANON,
    supabase_service_role_key=status['SERVICE_ROLE_KEY'], user_invitations_enabled=True,
    invitation_callback_url='http://127.0.0.1:3000/aceitar-convite'))
backend = TestClient(app)
results = []
prefix = 'invite' + uuid4().hex[:8]

def sql(source):
    p = subprocess.run(['docker','--host','npipe:////./pipe/dockerDesktopLinuxEngine','exec','-i',
        'supabase_db_norveo-homolog.local','psql','-X','-U','postgres','-qAt','-v','ON_ERROR_STOP=1'],
        input=source, text=True, capture_output=True, encoding='utf-8', timeout=60)
    if p.returncode: raise AssertionError(p.stderr[-600:])
    return p.stdout.strip()

def auth(path, body, token=None):
    return http.post(API+'/auth/v1/'+path, json=body, headers={'apikey': ANON, 'Authorization': 'Bearer '+(token or ANON)})

def login(email, password=PASSWORD):
    r = auth('token?grant_type=password', {'email':email,'password':password})
    assert r.status_code==200, f'Login {r.status_code}'
    return r.json()['access_token']

def api(path, token, body=None, method='POST'):
    return backend.request(method, '/api/v1'+path, json=body, headers={'Authorization':'Bearer '+token})

def record(name, run):
    run(); results.append({'scenario': name, 'status': 'PASS'}); print('PASS',name,flush=True)

def create(token, suffix, **extras):
    email = prefix+suffix+'@example.com'
    r = api('/convites',token,dict(email=email,full_name='Synthetic Invited',role='operacional',**extras))
    assert r.status_code==201, f'Create HTTP {r.status_code}: {r.json()}'
    return r.json()['invitation_id'], email

def consume(email, kind='invite'):
    for _ in range(40):
        messages=http.get('http://127.0.0.1:54324/api/v1/messages').json()['messages']
        for m in messages:
            if any(t.get('Address')==email for t in m['To']):
                b=http.get('http://127.0.0.1:54324/api/v1/message/'+m['ID']).json()
                links=re.findall(r'https?://[^\s"<>]+',html.unescape(b.get('HTML','')+b.get('Text','')))
                for link in links:
                    parsed=urlparse(link)
                    if parsed.hostname=='127.0.0.1' and '/auth/v1/verify' in parsed.path and parsed.port==54321 and parse_qs(parsed.query).get('type')==[kind]:
                        r=http.get(link); assert r.status_code in (302,303)
                        target=urlparse(r.headers['location']);assert target.hostname=='127.0.0.1'
                        values=parse_qs(target.fragment); assert 'access_token' in values
                        if kind=='invite': assert target.path=='/aceitar-convite' and 'convite' in parse_qs(target.query)
                        return values['access_token'][0]
        time.sleep(.2)
    raise AssertionError('Local email missing')

try:
    sql("NOTIFY pgrst,'reload schema';")
    manager=login('user3@example.com'); admin=login('user1@example.com')
    operational=login('user5@example.com'); wrong=login('user8@example.com')
    owner=login('owner@example.com',PASSWORD+'-changed')
    companies=sql('SELECT count(*) FROM empresas')
    original_limits=sql("SELECT md5(jsonb_agg(to_jsonb(l) ORDER BY empresa_id)::text) FROM empresa_limites l")
    quota_company=sql("SELECT empresa_id FROM user_profiles WHERE email='owner@example.com'")
    assert sql(f"SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id='{quota_company}'")=='100'

    invitation,email=create(manager,'ok')
    uid=sql(f"SELECT user_id FROM engmarq_private.user_invitations WHERE id='{invitation}'")
    record('native invite creates inactive identity in exact tenant',lambda: (
        None if sql(f"SELECT active||':'||empresa_id||':'||role FROM user_profiles WHERE id='{uid}'")=='false:00000000-0000-4000-8000-000000000101:operacional' else (_ for _ in ()).throw(AssertionError())))
    def denied():
        for token,extra in [(operational,{}),(wrong,{}),(manager,{'empresa_id':'00000000-0000-4000-8000-000000000102'}),(manager,{'role':'admin'})]:
            r=api('/convites',token,dict(email=prefix+'bad@example.com',full_name='Synthetic',**extra))
            assert r.status_code in (403,422)
        assert api('/convites/'+invitation+'/aceitar',manager).status_code in (403,409)
        assert api('/convites/'+invitation+'/cancelar',wrong).status_code==403
        assert api('/convites',wrong,method='GET').status_code==403
        assert backend.post('/api/v1/convites',json={'email':'bad@example.com'}).status_code==401
        assert api('/usuarios/'+uid,manager,{'active':True},method='PATCH').status_code==403
    record('unauthorized issuer, tenant spoof, admin role, wrong accept/cancel and early activation denied',denied)
    token=consume(email)
    assert api('/me',token,method='GET').status_code==403
    def accept():
        r=api('/convites/'+invitation+'/aceitar',token);assert r.status_code==200
        assert r.json()['empresa_id']=='00000000-0000-4000-8000-000000000101'
        assert api('/me',token,method='GET').status_code==200
        assert api('/convites/'+invitation+'/aceitar',token).status_code==409
        assert api('/convites/'+invitation+'/cancelar',manager).status_code==409
        r=api('/convites',manager,{'email':email,'full_name':'Synthetic'});assert r.status_code==409
    record('email confirmation then one-use accept, duplicate and accepted-cancel denied',accept)
    def recovery():
        r=http.put(API+'/auth/v1/user',json={'password':PASSWORD},headers={'apikey':ANON,'Authorization':'Bearer '+token});assert r.status_code==200
        login(email)
        assert auth('recover',{'email':email}).status_code==200
        recovered=consume(email,'recovery')
        r=http.put(API+'/auth/v1/user',json={'password':PASSWORD+'new'},headers={'apikey':ANON,'Authorization':'Bearer '+recovered});assert r.status_code==200
        login(email,PASSWORD+'new')
    record('invited identity sets password and real recovery remains compatible',recovery)

    def cancel_expire():
        for suffix,expire in [('cancel',False),('expire',True)]:
            iid,em=create(manager,suffix)
            if expire:
                sql(f"UPDATE engmarq_private.user_invitations SET created_at=clock_timestamp()-interval '49 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE id='{iid}'")
            else: assert api('/convites/'+iid+'/cancelar',manager).status_code==204
            t=consume(em)
            assert api('/convites/'+iid+'/aceitar',t).status_code==409
            assert api('/me',t,method='GET').status_code==403
            assert sql(f"SELECT active FROM user_profiles WHERE id=(SELECT user_id FROM engmarq_private.user_invitations WHERE id='{iid}')")=='f'
    record('expired/cancelled native links cannot activate access even after Auth confirmation',cancel_expire)
    def superadmin_and_quota():
        iid,em=create(admin,'admin',empresa_id='00000000-0000-4000-8000-000000000102')
        t=consume(em);assert api('/convites/'+iid+'/aceitar',t).json()['empresa_id']=='00000000-0000-4000-8000-000000000102'
        iid,em=create(owner,'full');t=consume(em);assert api('/convites/'+iid+'/aceitar',t).status_code==200
        assert sql(f"SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id='{quota_company}'")=='100'
        func=sql(f"SELECT id FROM funcoes WHERE empresa_id='{quota_company}' LIMIT 1")
        sector=sql(f"SELECT id FROM setores WHERE empresa_id='{quota_company}' LIMIT 1")
        def insert(n):
            return http.post(API+'/rest/v1/colaboradores',json={'empresa_id':quota_company,'nome':'Synthetic invite quota','cpf':f'{n:011d}',
                'funcao_id':func,'setor_id':sector,'data_admissao':'2026-01-01'},headers={'apikey':ANON,'Authorization':'Bearer '+owner})
        with ThreadPoolExecutor(max_workers=2) as pool: rs=list(pool.map(insert,[99001,99002]))
        assert all(r.status_code>=400 and r.json()['code']=='P2502' for r in rs)
        assert sql(f"SELECT colaboradores_ativos FROM empresa_uso WHERE empresa_id='{quota_company}'")=='100'
    record('Superadmin chooses tenant; invitation at full quota creates access only; concurrent 101st rejected',superadmin_and_quota)
    def race():
        iid,em=create(manager,'race');t=consume(em)
        with ThreadPoolExecutor(max_workers=2) as pool:
            rs=list(pool.map(lambda _:api('/convites/'+iid+'/aceitar',t),[1,2]))
        assert sorted(r.status_code for r in rs)==[200,409]
    record('concurrent accept commits exactly once',race)
    def abuse_and_revocation():
        iid,em=create(manager,'revoke');t=consume(em)
        sql("UPDATE user_profiles SET active=false WHERE id='00000000-0000-4000-8000-000000000003'")
        try: assert api('/convites/'+iid+'/aceitar',t).status_code==403
        finally: sql("UPDATE user_profiles SET active=true WHERE id='00000000-0000-4000-8000-000000000003'")
        iid,em=create(manager,'cancelrace');t=consume(em)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(api,'/convites/'+iid+'/aceitar',t)
            second=pool.submit(api,'/convites/'+iid+'/cancelar',manager)
            accepted,cancelled=first.result(),second.result()
        state=sql(f"SELECT state FROM engmarq_private.user_invitations WHERE id='{iid}'")
        active=sql(f"SELECT active FROM user_profiles WHERE id=(SELECT user_id FROM engmarq_private.user_invitations WHERE id='{iid}')")
        assert (state,active) in [('accepted','t'),('cancelled','f')]
        assert (accepted.status_code,cancelled.status_code) in [(200,409),(409,204)]
        current_token=login(email,PASSWORD+'new')
        r=http.get(API+'/auth/v1/user',headers={'apikey':ANON,'Authorization':'Bearer '+current_token});assert r.status_code==200
        capability=r.json()['user_metadata']['norveo_invite']
        for data in [{'norveo_invite':'forged'}, {'norveo_invite':capability}, {'norveo_invite':capability,'norveo_signup':{'role':'admin'}}]:
            r=auth('signup',{'email':prefix+'spoof@example.com','password':PASSWORD,'data':data})
            assert r.status_code>=400 and r.status_code!=429
        assert sql(f"SELECT count(*) FROM auth.users WHERE email='{prefix}spoof@example.com'")=='0'
        r=http.post(API+'/rest/v1/rpc/convite_aceitar',json={'invitee':uid,'invitation':invitation},headers={'apikey':ANON,'Authorization':'Bearer '+current_token})
        assert r.status_code>=400
    record('revoked issuer, cancel/accept race, forged/replayed capability and direct privileged RPC denied',abuse_and_revocation)
    def duplicate_race():
        em=prefix+'duplicate@example.com'
        with ThreadPoolExecutor(max_workers=2) as pool:
            rs=list(pool.map(lambda _:api('/convites',manager,{'email':em,'full_name':'Synthetic Duplicate'}),[1,2]))
        assert sorted(r.status_code for r in rs)==[201,409]
        assert sql(f"SELECT count(*) FROM auth.users WHERE email='{em}'")=='1'
        assert sql(f"SELECT count(*) FROM engmarq_private.user_invitations WHERE email='{em}'")=='1'
        iid=next(r.json()['invitation_id'] for r in rs if r.status_code==201)
        rows=api('/convites',manager,method='GET');assert rows.status_code==200
        assert any(i['id']==iid and i['state']=='pending' for i in rows.json())
        assert api('/convites/'+iid+'/cancelar',manager).status_code==204
    record('concurrent duplicate invitations produce one identity and list/cancel correctly',duplicate_race)
    assert sql('SELECT count(*) FROM empresas')==companies
    assert sql("SELECT md5(jsonb_agg(to_jsonb(l) ORDER BY empresa_id)::text) FROM empresa_limites l")==original_limits
    record('existing unlimited limits and company records preserved',lambda:None)
    sql((ROOT/'supabase/pending/public_company_signup_postflight_readonly.sql').read_text(encoding='utf-8'))
finally:
    sql((ROOT/'supabase/pending/public_company_signup_close.sql').read_text(encoding='utf-8'))
    (WORK/'invite-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    http.close();backend.close()
