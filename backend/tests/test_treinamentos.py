import json

import httpx
import pytest

from test_security import USER_ID, override_supabase
from test_colaboradores import COMPANY, OTHER, CATALOG, FOREIGN, HEADERS


@pytest.fixture(params=["treinamentos", "matriz-treinamentos"])
def training(request, app):
    resource = request.param
    table = resource.replace("-", "_")
    tipo = dict(id=CATALOG, nome="NR", descricao=None, nr_referencia="NR-10", validade_meses=12)
    row = dict(id=CATALOG, empresa_id=COMPANY, treinamento_tipo_id=CATALOG, treinamento_tipo=tipo)
    if table == "treinamentos":
        row.update(colaborador_id=CATALOG, data_realizacao="2025-01-01", data_vencimento=None,
                   carga_horaria=None, instrutor=None, modalidade=None, certificado_url=None,
                   status="em_dia", created_at=None, colaborador=dict(id=CATALOG, nome="Pessoa"))
        payload = dict(colaborador_id=CATALOG, treinamento_tipo_id=CATALOG, data_realizacao="2025-01-01")
        patch = dict(instrutor="Instrutor")
    else:
        row.update(funcao_id=CATALOG, obrigatorio=True, funcao=dict(id=CATALOG, nome="Funcao"))
        payload = dict(funcao_id=CATALOG, treinamento_tipo_id=CATALOG, obrigatorio=True)
        patch = dict(obrigatorio=False)
    state = dict(role="empresa", active=True, status="ativa", invalid_jwt=False, writes=[], error=None, requests=[])

    def handler(req):
        assert req.headers["apikey"] == "test-anon-key"
        assert req.headers["authorization"] == "Bearer caller-jwt"
        path = req.url.path
        if path == "/auth/v1/user":
            if state["invalid_jwt"]:
                return httpx.Response(401, json={"msg": "invalid token"})
            return httpx.Response(200, json=dict(id=USER_ID, email="test@example.com", aud="authenticated",
                app_metadata={}, user_metadata={}, created_at="2025-01-01T00:00:00Z"))
        if path == "/rest/v1/user_profiles":
            return httpx.Response(200, json=[dict(id=USER_ID, empresa_id=COMPANY, full_name="Actor",
                role=state["role"], active=state["active"])])
        if path == "/rest/v1/empresas":
            return httpx.Response(200, json=[dict(id=COMPANY, status=state["status"])])
        state["requests"].append(req)
        if path == "/rest/v1/treinamento_tipos":
            return httpx.Response(200, json=[] if req.url.params.get("id") == f"eq.{FOREIGN}" else [tipo])
        if path in ("/rest/v1/colaboradores", "/rest/v1/funcoes"):
            assert req.url.params["empresa_id"] == f"eq.{COMPANY}"
            return httpx.Response(200, json=[dict(id=CATALOG)] if req.url.params["id"] == f"eq.{CATALOG}" else [])
        assert path == f"/rest/v1/{table}"
        if req.method != "POST":
            assert req.url.params["empresa_id"] == f"eq.{COMPANY}"
        if state["error"]:
            return httpx.Response(400, json=dict(code=state["error"], message="private details", hint=None, details=None))
        if req.url.params.get("id") == f"eq.{FOREIGN}":
            return httpx.Response(200, json=[])
        if req.method in ("POST", "PATCH"):
            data = json.loads(req.content)
            if req.method == "POST": assert data["empresa_id"] == COMPANY
            else: assert "empresa_id" not in data
            state["writes"].append(data)
            row.update(data)
        return httpx.Response(200, json=[row])
    override_supabase(app, handler)
    return f"/api/v1/{resource}", state, payload, patch


@pytest.mark.parametrize("role", ["empresa", "gestor", "operacional"])
def test_read_own_tenant(client, training, role):
    base, state, _, _ = training
    state["role"] = role
    response = client.get(base, headers=HEADERS)
    assert response.status_code == 200, response.text
    assert response.json()[0]["empresa_id"] == COMPANY
    assert response.headers["cache-control"] == "no-store"
    assert client.get('/api/v1/treinamento-tipos', headers=HEADERS).status_code == 200
    if base.endswith('/treinamentos'):
        assert client.get(f'{base}/{CATALOG}', headers=HEADERS).status_code == 200
        assert client.get(f'/api/v1/colaboradores/{CATALOG}/treinamentos', headers=HEADERS).status_code == 200


@pytest.mark.parametrize("role", ["empresa", "gestor"])
def test_create_update_without_privileged_credentials(client, training, role):
    base, state, payload, patch = training
    state["role"] = role
    response = client.post(base, headers=HEADERS, json=payload)
    assert response.status_code == 201, response.text
    assert client.patch(f'{base}/{CATALOG}', headers=HEADERS, json=patch).status_code == 200
    if base.endswith('/treinamentos'):
        assert client.delete(f'{base}/{CATALOG}', headers=HEADERS).status_code == 405
    else:
        assert client.delete(f'{base}/{CATALOG}', headers=HEADERS).status_code == 204


@pytest.mark.parametrize('changes', [dict(role='admin'), dict(active=False), dict(status='suspensa'), dict(status='pendente')])
def test_blocked_actor(client, training, changes):
    base,state,payload,patch=training
    state.update(changes)
    for response in [client.get(base,headers=HEADERS), client.post(base,headers=HEADERS,json=payload),
                     client.patch(f'{base}/{CATALOG}',headers=HEADERS,json=patch)]:
        assert response.status_code == 403
    assert not state['writes']


def test_operacional_read_only(client, training):
    base,state,payload,patch=training
    state['role']='operacional'
    assert client.post(base,headers=HEADERS,json=payload).status_code == 403
    assert client.patch(f'{base}/{CATALOG}',headers=HEADERS,json=patch).status_code == 403
    if 'matriz' in base: assert client.delete(f'{base}/{CATALOG}',headers=HEADERS).status_code == 403


def test_authentication(client, training):
    base,state,_,_=training
    assert client.get(base).status_code == 401
    state['invalid_jwt']=True
    assert client.get(base,headers=HEADERS).status_code == 401


@pytest.mark.parametrize('extra', [dict(empresa_id=OTHER),dict(id=FOREIGN),dict(status='pendente')])
def test_forged_fields_and_tenant(client,training,extra):
    base,_,payload,patch=training
    assert client.post(base,headers=HEADERS,json=payload|extra).status_code == 422
    assert client.patch(f'{base}/{CATALOG}',headers=HEADERS,json=patch|extra).status_code == 422
    assert client.get(base+'?empresa_id='+OTHER,headers=HEADERS).status_code == 422


def test_foreign_or_missing_record(client,training):
    base,_,_,patch=training
    assert client.patch(f'{base}/{FOREIGN}',headers=HEADERS,json=patch).status_code == 404
    if base.endswith('/treinamentos'):
        assert client.get(f'{base}/{FOREIGN}',headers=HEADERS).status_code == 404
        assert client.get(f'/api/v1/colaboradores/{FOREIGN}/treinamentos',headers=HEADERS).status_code == 404


def test_relations_are_validated(client,training):
    base,state,payload,_=training
    relation='funcao_id' if 'matriz' in base else 'colaborador_id'
    for field in [relation,'treinamento_tipo_id']:
        assert client.post(base,headers=HEADERS,json=payload|{field:FOREIGN}).status_code == 422
    assert not state['writes']


@pytest.mark.parametrize('code,status', [('23505',409),('23503',422),('42501',403),('XX000',503)])
def test_sanitized_errors(client,training,code,status):
    base,state,_,_=training
    state['error']=code
    response=client.get(base,headers=HEADERS)
    assert response.status_code == status
    assert 'private details' not in response.text


def test_patch_and_certificate_validation(client,training):
    base,_,_,_=training
    assert client.patch(f'{base}/{CATALOG}',headers=HEADERS,json={}).status_code == 422
    if base.endswith('/treinamentos'):
        for payload in [dict(colaborador_id=None),dict(data_realizacao='invalid'),dict(modalidade='fake'),
                        dict(certificado_url=f'{OTHER}/certificados/file.pdf'),dict(certificado_url='https://external/file.pdf')]:
            assert client.patch(f'{base}/{CATALOG}',headers=HEADERS,json=payload).status_code == 422
        assert client.patch(f'{base}/{CATALOG}',headers=HEADERS,json=dict(certificado_url=f'{COMPANY}/certificados/file.pdf')).status_code == 200
