from collections.abc import Iterator
from typing import Annotated
import httpx
import pytest
from fastapi import Depends
from supabase import Client
from app.core.config import Settings
from app.core.dependencies import get_supabase_client
from app.core.security import get_bearer_token
from app.integrations.supabase import create_user_client

USER = 'cde82aba-f063-40f2-81b6-ceab59e543ed'
OWN = '74455974-ed31-40ba-b8af-dc335bf59801'
OTHER = 'cd60a82f-8ca9-4024-95a6-a136a28208ea'
HEADERS = {'Authorization': 'Bearer user-jwt'}


@pytest.fixture
def upstream(app):
    state = {'role': 'gestor', 'active': True, 'company_status': 'ativa', 'error': None,
             'auth_status': 200, 'operations': [], 'null_count': False}

    def handler(request):
        if request.url.path == '/rest/v1/empresa_features':
            return httpx.Response(200, json=[{'enabled': True}])
        assert request.headers['authorization'] == 'Bearer user-jwt'
        assert request.headers['apikey'] == 'public-anon-key'
        if request.url.path == '/auth/v1/user':
            if state['auth_status'] != 200:
                return httpx.Response(401, json={'msg': 'invalid token'})
            return httpx.Response(200, json={'id': USER, 'email': 'user@example.com', 'aud': 'authenticated',
                                           'app_metadata': {}, 'user_metadata': {'role': 'admin'},
                                           'created_at': '2026-01-01T00:00:00Z'})
        if request.url.path == '/rest/v1/user_profiles':
            return httpx.Response(200, json=[{'id': USER, 'full_name': 'Test', 'role': state['role'],
                                            'empresa_id': OWN, 'active': state['active']}])
        if request.url.path == '/rest/v1/empresas' and request.url.params.get('select') == 'id,status':
            return httpx.Response(200, json=[{'id': OWN, 'status': state['company_status']}])
        state['operations'].append(request)
        if state['error']:
            return httpx.Response(400, json={'code': state['error'], 'message': 'private detail', 'hint': None, 'details': None})
        table = request.url.path.split('/')[-1]
        if request.method == 'HEAD':
            headers = {} if state['null_count'] else {'content-range': '0-0/1500'}
            return httpx.Response(200, headers=headers)
        assert table in {'vw_dashboard_documentos', 'vw_dashboard_treinamentos'}
        row = {'empresa_id': OWN, 'status_calculado': 'vencido', 'dias_restantes': -1}
        row.update({'titulo': 'Doc', 'vencimento': '2026-01-01'} if table == 'vw_dashboard_documentos'
                   else {'colaborador_nome': 'Employee', 'treinamento_nome': 'Train', 'data_vencimento': '2026-01-01'})
        return httpx.Response(200, json=[row])

    settings = Settings(_env_file=None, supabase_url='https://project.supabase.co', supabase_anon_key='public-anon-key')

    def dependency(token: Annotated[str, Depends(get_bearer_token)]) -> Iterator[Client]:
        with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
            yield create_user_client(settings, token, http_client)
    app.dependency_overrides[get_supabase_client] = dependency
    return state


@pytest.mark.parametrize('role', ['gestor', 'empresa', 'operacional'])
def test_b04_counts_exact_and_actor_scope(client, upstream, role):
    upstream['role'] = role
    response = client.get('/api/v1/dashboard/kpis', headers=HEADERS)
    assert response.status_code == 200
    assert response.json()['totalDocumentos'] == 1500  # no 1000-row truncation
    assert response.json()['operacionalDisponivel'] is True
    assert response.headers['cache-control'] == 'no-store'
    assert len(upstream['operations']) == 9
    for request in upstream['operations']:
        assert request.method == 'HEAD'
        assert request.url.params['empresa_id'] == f'eq.{OWN}'
        assert request.headers['prefer'] == 'count=exact'
    classified=[r for r in upstream['operations'] if r.url.params.get('status_calculado')]
    assert len(classified)==3
    assert all(r.url.path=='/rest/v1/vw_dashboard_documentos' for r in classified)


def test_b04_alerts_scoped_sorted_and_limited(client, upstream):
    response = client.get(f'/api/v1/dashboard/alertas?scope={OWN}&limit=1', headers=HEADERS)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]['tipo'] == 'documento'
    for request in upstream['operations']:
        assert request.url.params['empresa_id'] == f'eq.{OWN}'
        assert request.url.params['limit'] == '1'
        assert request.url.params['status_calculado'] == 'in.(vencido,vencendo)'


@pytest.mark.parametrize('path', ['kpis', 'alertas'])
@pytest.mark.parametrize('scope', [OTHER, 'all'])
def test_b04_foreign_and_global_scope_denied_before_data_query(client, upstream, path, scope):
    assert client.get(f'/api/v1/dashboard/{path}?scope={scope}', headers=HEADERS).status_code == 403
    assert upstream['operations'] == []


def test_b04_admin_only_commercial_query_no_internal_data(client, upstream):
    upstream['role'] = 'admin'
    response = client.get('/api/v1/dashboard/kpis?scope=all', headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data['totalEmpresas'] == 1500
    assert data['totalDocumentos'] == 0 and data['totalColaboradores'] is None
    assert data['operacionalDisponivel'] is False
    assert [r.url.path for r in upstream['operations']] == ['/rest/v1/empresas']
    upstream['operations'].clear()
    assert client.get('/api/v1/dashboard/alertas', headers=HEADERS).json() == []
    assert upstream['operations'] == []
    assert client.get(f'/api/v1/dashboard/kpis?scope={OWN}', headers=HEADERS).status_code == 403
    assert upstream['operations'] == []


@pytest.mark.parametrize('path', ['kpis', 'alertas'])
@pytest.mark.parametrize('invalid', ['anon', 'inactive', 'suspended', 'bad_token'])
def test_b04_invalid_identity_cannot_read(client, upstream, path, invalid):
    if invalid == 'inactive': upstream['active'] = False
    if invalid == 'suspended': upstream['company_status'] = 'suspensa'
    if invalid == 'bad_token': upstream['auth_status'] = 401
    headers = {} if invalid == 'anon' else HEADERS
    assert client.get(f'/api/v1/dashboard/{path}', headers=headers).status_code in {401, 403}
    assert upstream['operations'] == []


@pytest.mark.parametrize('query', ['scope=bad', 'empresa_id='+OTHER, 'scope='+OWN+'&scope='+OTHER, 'limit=51', 'limit=0'])
def test_b04_forged_query_rejected(client, upstream, query):
    assert client.get(f'/api/v1/dashboard/alertas?{query}', headers=HEADERS).status_code == 422
    assert upstream['operations'] == []


@pytest.mark.parametrize('code,status', [('42501',403), ('PGRST301',401), ('XX000',503)])
def test_b04_db_error_no_fallback_or_private_details(client, upstream, code, status):
    upstream['error'] = code
    response = client.get('/api/v1/dashboard/kpis', headers=HEADERS)
    assert response.status_code == status
    assert 'private detail' not in response.text
    assert len(upstream['operations']) == 1


def test_b04_missing_exact_count_fails_closed(client, upstream):
    upstream['null_count'] = True
    assert client.get('/api/v1/dashboard/kpis', headers=HEADERS).status_code == 503
