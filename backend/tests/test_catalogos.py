import json

import httpx
import pytest

from test_security import USER_ID, override_supabase
from test_colaboradores import COMPANY, OTHER, CATALOG, FOREIGN, HEADERS


@pytest.fixture(params=["funcoes", "setores", "ambientes"])
def catalog(request, app):
    table = request.param
    row = dict(id=CATALOG, empresa_id=COMPANY, nome="Catalog", descricao=None, active=True)
    if table == "funcoes":
        row["riscos"] = None
    state = dict(role="empresa", active=True, status="ativa", invalid_jwt=False, requests=[], writes=[], error=None)

    def handler(req):
        assert req.headers["apikey"] == "test-anon-key"
        assert req.headers["authorization"] == "Bearer caller-jwt"
        assert "secret" not in str(req.headers)
        path = req.url.path
        if path == "/auth/v1/user":
            if state["invalid_jwt"]:
                return httpx.Response(401, json={"msg": "invalid token"})
            return httpx.Response(200, json=dict(id=USER_ID, email="test@example.com", aud="authenticated",
                app_metadata={}, user_metadata={}, created_at="2025-01-01T00:00:00Z"))
        if path == "/rest/v1/user_profiles":
            assert req.url.params["id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=[dict(id=USER_ID, empresa_id=COMPANY, full_name="Actor",
                role=state["role"], active=state["active"])])
        if path == "/rest/v1/empresas":
            return httpx.Response(200, json=[dict(id=COMPANY, status=state["status"])])
        assert path == f"/rest/v1/{table}"
        state["requests"].append(req)
        if req.method != "POST":
            assert req.url.params["empresa_id"] == f"eq.{COMPANY}"
        if state["error"]:
            return httpx.Response(400, json=dict(code=state["error"], message="private details", details=None, hint=None))
        if req.method == "GET":
            # Inactive records remain available for history/import name resolution.
            assert "active" not in req.url.params
            return httpx.Response(200, json=[row, row | {"id": FOREIGN, "active": False}])
        payload = json.loads(req.content)
        if req.method == "PATCH":
            assert req.url.params.get("id") is not None
            if req.url.params["id"] != f"eq.{CATALOG}":
                return httpx.Response(200, json=[])
            assert "empresa_id" not in payload
        else:
            assert req.method == "POST"
            assert payload["empresa_id"] == COMPANY
            assert payload["active"] is True
        state["writes"].append(payload)
        row.update(payload)
        return httpx.Response(200, json=[row])

    override_supabase(app, handler)
    return f"/api/v1/{table}", state


@pytest.mark.parametrize("role", ["empresa", "gestor", "operacional"])
def test_own_tenant_list(client, catalog, role):
    base, state = catalog
    state["role"] = role
    response = client.get(base, headers=HEADERS)
    assert response.status_code == 200, response.text
    assert all(x["empresa_id"] == COMPANY for x in response.json())
    assert response.json()[1]["active"] is False
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("role", ["empresa", "gestor"])
def test_crud_and_soft_deactivation_without_privileged_key(client, catalog, role):
    base, state = catalog
    state["role"] = role
    response = client.post(base, headers=HEADERS, json={"nome": "Created", "descricao": "Description"})
    assert response.status_code == 201, response.text
    assert response.json()["empresa_id"] == COMPANY
    response = client.patch(f"{base}/{CATALOG}", headers=HEADERS, json={"nome": "Edited", "descricao": None})
    assert response.status_code == 200
    assert response.json()["nome"] == "Edited"
    for active in [False, True]:
        response = client.patch(f"{base}/{CATALOG}", headers=HEADERS, json={"active": active})
        assert response.status_code == 200
        assert response.json()["active"] is active


@pytest.mark.parametrize("changes", [{"role": "admin"}, {"active": False}, {"status": "suspensa"}, {"status": "pendente"}])
def test_blocked_actor(client, catalog, changes):
    base, state = catalog
    state.update(changes)
    assert client.get(base, headers=HEADERS).status_code == 403
    assert client.post(base, headers=HEADERS, json={"nome": "Test"}).status_code == 403
    assert client.patch(f"{base}/{CATALOG}", headers=HEADERS, json={"active": False}).status_code == 403
    assert not state["requests"]


def test_operational_cannot_write(client, catalog):
    base, state = catalog
    state["role"] = "operacional"
    assert client.post(base, headers=HEADERS, json={"nome": "Test"}).status_code == 403
    for patch in [{"nome": "Edited"}, {"active": False}]:
        assert client.patch(f"{base}/{CATALOG}", headers=HEADERS, json=patch).status_code == 403
    assert not state["writes"]


def test_missing_invalid_jwt(client, catalog):
    base, state = catalog
    assert client.get(base).status_code == 401
    state["invalid_jwt"] = True
    assert client.get(base, headers=HEADERS).status_code == 401
    assert not state["requests"]


@pytest.mark.parametrize("payload", [{"empresa_id": OTHER}, {"id": FOREIGN}, {"unexpected": True}])
def test_forged_tenant_and_extra_fields(client, catalog, payload):
    base, state = catalog
    for method, path in [("POST", base), ("PATCH", f"{base}/{CATALOG}")]:
        assert client.request(method, path, headers=HEADERS, json={"nome": "Test"} | payload).status_code == 422
    assert not state["writes"]


def test_cross_tenant_or_missing_id(client, catalog):
    base, state = catalog
    response = client.patch(f"{base}/{FOREIGN}", headers=HEADERS, json={"nome": "Changed"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "catalogo_not_found"
    assert not state["writes"]


@pytest.mark.parametrize("payload", [{}, {"nome": None}, {"active": None}, {"active": "false"}, {"nome": "x"}])
def test_invalid_patch(client, catalog, payload):
    base, state = catalog
    assert client.patch(f"{base}/{CATALOG}", headers=HEADERS, json=payload).status_code == 422
    assert not state["writes"]


@pytest.mark.parametrize("code,status", [("23505", 409), ("42501", 403), ("unknown", 503)])
def test_errors_sanitized(client, catalog, code, status):
    base, state = catalog
    state["error"] = code
    response = client.post(base, headers=HEADERS, json={"nome": "Duplicate"})
    assert response.status_code == status
    assert "private details" not in response.text


def test_riscos_only_for_funcoes(client, catalog):
    base, _ = catalog
    response = client.post(base, headers=HEADERS, json={"nome": "Test", "riscos": "Noise"})
    assert response.status_code == (201 if base.endswith('funcoes') else 422)


def test_no_tenant_query_or_physical_delete(client, catalog):
    base, _ = catalog
    assert client.get(base, params={"empresa_id": OTHER}, headers=HEADERS).status_code == 422
    assert client.delete(f"{base}/{CATALOG}", headers=HEADERS).status_code == 405
