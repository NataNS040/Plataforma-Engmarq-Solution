"""Entitlement HTTP mocks are explicit and never contact a Supabase project."""
from types import SimpleNamespace
from uuid import UUID
import httpx
import pytest
from postgrest.exceptions import APIError
from app.core.entitlements import require_feature, database_error, DATABASE_ERRORS
from app.core.errors import AppError
from app.integrations.supabase import create_user_client
from app.core.config import Settings
from app.services.profiles import get_authorized_profile
from app.schemas.auth import AuthenticatedUser
from test_security import USER_ID, override_supabase
from test_usuarios import COMPANY, HEADERS, PAYLOAD


@pytest.mark.parametrize('rows', [[], [{'enabled':False}], [{'enabled':None}], [{'enabled':True}]])
def test_explicit_grant_with_caller_jwt_and_derived_tenant(rows):
    def handler(request):
        assert request.url.path == '/rest/v1/empresa_features'
        assert request.url.params['empresa_id'] == 'eq.'+COMPANY
        assert request.url.params['feature_key'] == 'eq.colaboradores.gestao'
        assert request.headers['authorization'] == 'Bearer local-test-jwt'
        assert request.headers['apikey'] == 'synthetic-anon'
        return httpx.Response(200,json=rows)
    settings=Settings(_env_file=None,supabase_url='https://synthetic.test',supabase_anon_key='synthetic-anon')
    actor=SimpleNamespace(active=True,role='gestor',empresa_id=UUID(COMPANY))
    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        client=create_user_client(settings,'local-test-jwt',transport)
        if rows and rows[0]['enabled'] is True:
            require_feature(client,actor,'colaboradores.gestao')
        else:
            with pytest.raises(AppError) as exc: require_feature(client,actor,'colaboradores.gestao')
            assert exc.value.code=='feature_not_enabled'


@pytest.mark.parametrize('method,path,payload', [('GET',path,None) for path in ['/api/v1/colaboradores','/api/v1/funcoes','/api/v1/treinamentos','/api/v1/exames','/api/v1/usuarios','/api/v1/dashboard/kpis']] + [('POST','/api/v1/usuarios',PAYLOAD)])
@pytest.mark.parametrize('grant', [False,None])
def test_existing_endpoints_deny_off_or_missing_before_operational_query(app,client,method,path,payload,grant):
    requests=[]
    def handler(request):
        requests.append(request.url.path)
        if request.url.path=='/auth/v1/user':
            return httpx.Response(200,json={'id':USER_ID,'email':'actor@example.com','aud':'authenticated',
                'app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'})
        if request.url.path=='/rest/v1/user_profiles':
            return httpx.Response(200,json=[{'id':USER_ID,'full_name':'Actor','role':'gestor','empresa_id':COMPANY,'active':True}])
        if request.url.path=='/rest/v1/empresas':
            return httpx.Response(200,json=[{'id':COMPANY,'status':'ativa'}])
        assert request.url.path=='/rest/v1/empresa_features', 'Operational query before grant'
        return httpx.Response(200,json=[] if grant is None else [{'enabled':grant}])
    override_supabase(app,handler,entitlements=False)
    response=client.request(method,path,headers=HEADERS,json=payload)
    assert response.status_code==403,response.text
    assert response.json()['error']['code']=='feature_not_enabled'


@pytest.mark.parametrize('sqlcode', list(DATABASE_ERRORS))
def test_sql_errors_have_safe_distinct_codes(sqlcode):
    with pytest.raises(AppError) as exc:
        database_error(APIError({'code':sqlcode,'message':'private credential','hint':None,'details':None}))
    assert exc.value.code==DATABASE_ERRORS[sqlcode][1]
    assert 'private' not in exc.value.message


@pytest.mark.parametrize('active,status,reason', [(False,'ativa','user_inactive'),(True,'suspensa','company_inactive')])
def test_state_errors_distinct_internally_without_public_details(monkeypatch,active,status,reason):
    import app.services.profiles as module
    monkeypatch.setattr(module,'get_profile',lambda *args:SimpleNamespace(id=UUID(USER_ID),active=active,empresa_id=UUID(COMPANY)))
    monkeypatch.setattr(module,'company_is_active',lambda *args:status=='ativa')
    with pytest.raises(AppError) as exc:
        get_authorized_profile(None,AuthenticatedUser(id=USER_ID,email='actor@example.com'))
    assert exc.value.code=='access_denied'
    assert exc.value.internal_code==reason


from test_colaboradores import upstream as employee_upstream, EMPLOYEE

@pytest.mark.parametrize('role', ['empresa','gestor'])
def test_existing_employee_reactivation_payload_is_supported(client,employee_upstream,role):
    employee_upstream['role']=role
    employee_upstream['row'].update(active=False,data_demissao='2026-01-01')
    response=client.patch('/api/v1/colaboradores/'+EMPLOYEE,headers=HEADERS,json={'active':True,'data_demissao':None})
    assert response.status_code==200,response.text
    assert response.json()['active'] is True
    assert response.json()['data_demissao'] is None
    assert employee_upstream['writes']==[{'active':True,'data_demissao':None}]
