import json
from datetime import date, timedelta
import httpx
import pytest
from app.core.config import Settings
from test_security import USER_ID, override_supabase
from test_colaboradores import COMPANY, OTHER, CATALOG, FOREIGN, HEADERS

PARTE, AGENTE, SITUACAO, LESAO = '753030000', '302010200', '200004300', '702000000'


@pytest.fixture
def acidentes(app):
    app.state.settings = Settings(_env_file=None, supabase_url='https://project.supabase.co', supabase_anon_key='test-anon-key')
    row = dict(id=CATALOG, empresa_id=COMPANY, colaborador_id=CATALOG, tipo='tipico', data_acidente='2026-03-10',
        hora_acidente='08:30:00', minutos_trabalhados_antes=90, local_tipo=1, local_descricao='Pátio',
        codigo_parte_atingida=PARTE, lateralidade=0, agente_tabela=14, codigo_agente_causador=AGENTE,
        codigo_situacao_geradora=SITUACAO, codigo_natureza_lesao=LESAO, descricao_lesao=None,
        gravidade='leve', piramide_bird='lesao_leve', houve_afastamento=False, ultimo_dia_trabalhado=None,
        data_retorno=None, dias_perdidos=None, houve_obito=False, data_obito=None, comunicado_policia=False,
        emitir_cat=False, numero_recibo_cat=None, status='aberto', detalhes='Escorregou no pátio',
        criado_por=USER_ID, created_at='2026-03-10T12:00:00+00:00', atualizado_em=None, anulado_por=None,
        anulado_em=None, motivo_anulacao=None, colaborador=dict(id=CATALOG, nome='Pessoa', setor=dict(nome='Manutenção')))
    state = dict(role='empresa', active=True, status='ativa', invalid_jwt=False, writes=[], selects=[], row=row,
                 db_error=None)

    def handler(req):
        assert req.headers['apikey'] == 'test-anon-key'
        assert req.headers['authorization'] == 'Bearer caller-jwt'
        path = req.url.path
        if path == '/auth/v1/user':
            if state['invalid_jwt']: return httpx.Response(401, json={'msg': 'invalid'})
            return httpx.Response(200, json=dict(id=USER_ID, email='test@example.com', aud='authenticated',
                app_metadata={}, user_metadata={}, created_at='2025-01-01T00:00:00Z'))
        if path == '/rest/v1/user_profiles':
            return httpx.Response(200, json=[dict(id=USER_ID, empresa_id=COMPANY, full_name='Actor', role=state['role'], active=state['active'])])
        if path == '/rest/v1/empresas': return httpx.Response(200, json=[dict(id=COMPANY, status=state['status'])])
        if path == '/rest/v1/colaboradores':
            assert req.url.params['empresa_id'] == f'eq.{COMPANY}'
            return httpx.Response(200, json=[dict(id=CATALOG)] if req.url.params['id'] == f'eq.{CATALOG}' else [])
        if path == '/rest/v1/vw_acidentes_resumo':
            assert req.url.params['empresa_id'] == f'eq.{COMPANY}'
            return httpx.Response(200, json=[dict(mes='2026-03-01', tipo='tipico', gravidade='leve',
                piramide_bird='lesao_leve', houve_afastamento=False, emitir_cat=False, total=2, dias_perdidos=0)])
        assert path == '/rest/v1/acidentes'
        if state['db_error']:
            return httpx.Response(400, json=dict(code=state['db_error'], message='raw database detail', details=None, hint=None))
        if req.method != 'POST':
            assert req.url.params['empresa_id'] == f'eq.{COMPANY}'
        if req.method == 'GET':
            state['selects'].append(req.url.params['select'])
        if req.url.params.get('id') == f'eq.{FOREIGN}': return httpx.Response(200, json=[])
        if req.method in ('POST', 'PATCH'):
            payload = json.loads(req.content)
            state['writes'].append(payload)
            if req.method == 'POST': assert payload['empresa_id'] == COMPANY
            else:
                assert 'empresa_id' not in payload
                assert req.url.params['anulado_em'] == 'is.null'
            row.update(payload)
            if 'motivo_anulacao' in payload:
                row.update(anulado_em='2026-03-11T00:00:00+00:00', anulado_por=USER_ID)
        return httpx.Response(200, json=[row])

    override_supabase(app, handler)
    return state


PAYLOAD = dict(colaborador_id=CATALOG, tipo='tipico', data_acidente='2026-03-10', gravidade='leve',
               codigo_parte_atingida=PARTE, lateralidade=0, agente_tabela=14, codigo_agente_causador=AGENTE,
               codigo_situacao_geradora=SITUACAO, codigo_natureza_lesao=LESAO, piramide_bird='lesao_leve')


@pytest.mark.parametrize('role', ['empresa', 'gestor', 'operacional'])
def test_read_scope(client, acidentes, role):
    acidentes['role'] = role
    for path in ['/acidentes', '/acidentes/resumo', f'/acidentes/{CATALOG}', f'/colaboradores/{CATALOG}/acidentes']:
        response = client.get('/api/v1' + path, headers=HEADERS)
        assert response.status_code == 200, response.text
        assert response.headers['cache-control'] == 'no-store'
    resumo = client.get('/api/v1/acidentes/resumo', headers=HEADERS).json()
    assert resumo == [dict(mes='2026-03-01', tipo='tipico', gravidade='leve', piramide_bird='lesao_leve',
                           houve_afastamento=False, emitir_cat=False, total=2, dias_perdidos=0)]


def test_list_is_compact_and_detail_is_complete(client, acidentes):
    item = client.get('/api/v1/acidentes', headers=HEADERS).json()[0]
    assert 'detalhes' not in item and 'local_descricao' not in item and 'criado_por' not in item
    assert item['codigo_parte_atingida'] == PARTE and item['colaborador']['setor']['nome'] == 'Manutenção'
    assert 'detalhes' not in acidentes['selects'][0]
    assert client.get(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS).json()['detalhes'] == 'Escorregou no pátio'


@pytest.mark.parametrize('role', ['empresa', 'gestor'])
def test_create_update_annul(client, acidentes, role):
    acidentes['role'] = role
    assert client.post('/api/v1/acidentes', headers=HEADERS, json=PAYLOAD).status_code == 201
    assert client.patch(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS, json={'status': 'em_investigacao'}).status_code == 200
    annulled = client.post(f'/api/v1/acidentes/{CATALOG}/anular', headers=HEADERS, json={'motivo': 'Registro duplicado'})
    assert annulled.status_code == 200 and annulled.json()['anulado_por'] == USER_ID
    assert acidentes['writes'][-1] == {'motivo_anulacao': 'Registro duplicado'}
    for write in acidentes['writes']:
        assert not {'criado_por', 'anulado_por', 'anulado_em', 'atualizado_por', 'created_at'} & set(write)


def test_annulled_record_is_immutable(client, acidentes):
    acidentes['row']['anulado_em'] = '2026-03-11T00:00:00+00:00'
    assert client.patch(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS, json={'status': 'concluido'}).status_code == 409
    assert client.post(f'/api/v1/acidentes/{CATALOG}/anular', headers=HEADERS, json={'motivo': 'De novo'}).status_code == 409
    assert not acidentes['writes']


@pytest.mark.parametrize('changes', [dict(role='admin'), dict(active=False), dict(status='suspensa'), dict(status='pendente')])
def test_denied_identity(client, acidentes, changes):
    acidentes.update(changes)
    for method, path, data in [('get', '/acidentes', None), ('get', '/acidentes/resumo', None),
            ('get', f'/acidentes/{CATALOG}', None), ('post', '/acidentes', PAYLOAD),
            ('patch', f'/acidentes/{CATALOG}', {'status': 'concluido'}),
            ('post', f'/acidentes/{CATALOG}/anular', {'motivo': 'Duplicado'})]:
        response = client.request(method, '/api/v1' + path, headers=HEADERS, **({'json': data} if data else {}))
        assert response.status_code == 403, response.text
    assert not acidentes['writes']


def test_operacional_read_only(client, acidentes):
    acidentes['role'] = 'operacional'
    assert client.post('/api/v1/acidentes', headers=HEADERS, json=PAYLOAD).status_code == 403
    assert client.patch(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS, json={'status': 'concluido'}).status_code == 403
    assert client.post(f'/api/v1/acidentes/{CATALOG}/anular', headers=HEADERS, json={'motivo': 'Duplicado'}).status_code == 403
    assert not acidentes['writes']


def test_anon_and_bad_token(client, acidentes):
    assert client.get('/api/v1/acidentes').status_code == 401
    acidentes['invalid_jwt'] = True
    assert client.get('/api/v1/acidentes', headers=HEADERS).status_code == 401


def test_no_delete_route(client, acidentes):
    assert client.delete(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS).status_code == 405


@pytest.mark.parametrize('extra', [dict(empresa_id=OTHER), dict(criado_por=USER_ID), dict(anulado_por=USER_ID),
    dict(anulado_em='2026-01-01T00:00:00Z'), dict(motivo_anulacao='x'), dict(created_at='2026-01-01'), dict(parte_tabela=13)])
def test_forged_fields(client, acidentes, extra):
    assert client.post('/api/v1/acidentes', headers=HEADERS, json=PAYLOAD | extra).status_code == 422
    assert client.patch(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS, json=extra).status_code == 422
    assert not acidentes['writes']


def test_foreign_employee_and_record(client, acidentes):
    assert client.post('/api/v1/acidentes', headers=HEADERS, json=PAYLOAD | {'colaborador_id': FOREIGN}).status_code == 422
    assert client.patch(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS, json={'colaborador_id': FOREIGN}).status_code == 422
    assert client.get(f'/api/v1/colaboradores/{FOREIGN}/acidentes', headers=HEADERS).status_code == 404
    assert client.get(f'/api/v1/acidentes/{FOREIGN}', headers=HEADERS).status_code == 404
    assert client.get('/api/v1/acidentes?empresa_id=' + OTHER, headers=HEADERS).status_code == 422
    assert not acidentes['writes']


FUTURE = (date.today() + timedelta(days=3)).isoformat()


@pytest.mark.parametrize('payload', [
    {'data_acidente': FUTURE},
    {'tipo': 'doenca', 'agente_tabela': None, 'codigo_agente_causador': None, 'hora_acidente': '08:00'},
    {'agente_tabela': 15, 'codigo_agente_causador': SITUACAO},
    {'agente_tabela': None},
    {'codigo_parte_atingida': None},
    {'data_retorno': '2026-03-20'},
    {'houve_afastamento': True, 'data_retorno': '2026-03-01'},
    {'houve_obito': True, 'data_obito': '2026-03-12'},
    {'houve_obito': True, 'gravidade': 'fatal'},
    {'data_obito': '2026-03-12'},
    {'codigo_natureza_lesao': '12345'},
    {'lateralidade': 7},
    {'gravidade': 'gravissima'},
    {'numero_recibo_cat': 'abc'},
])
def test_business_rules(client, acidentes, payload):
    assert client.post('/api/v1/acidentes', headers=HEADERS, json=PAYLOAD | payload).status_code == 422
    assert not acidentes['writes']


def test_doenca_may_use_table_15_agent(client, acidentes):
    body = PAYLOAD | {'tipo': 'doenca', 'agente_tabela': 15, 'codigo_agente_causador': SITUACAO}
    assert client.post('/api/v1/acidentes', headers=HEADERS, json=body).status_code == 201


@pytest.mark.parametrize('payload', [{}, {'tipo': None}, {'gravidade': None}, {'houve_afastamento': None}])
def test_invalid_patch(client, acidentes, payload):
    assert client.patch(f'/api/v1/acidentes/{CATALOG}', headers=HEADERS, json=payload).status_code == 422


@pytest.mark.parametrize('code,status', [('23503', 422), ('23514', 422), ('42501', 403), ('40001', 409), ('XX000', 503)])
def test_database_errors_are_safe(client, acidentes, code, status):
    acidentes['db_error'] = code
    response = client.post('/api/v1/acidentes', headers=HEADERS, json=PAYLOAD)
    assert response.status_code == status
    assert 'raw database detail' not in response.text
