"""Route-to-PostgREST contract tests. All upstream HTTP is isolated."""
import json

import httpx
import pytest

from test_security import USER_ID, override_supabase

COMPANY = "74455974-ed31-40ba-b8af-dc335bf59801"
OTHER = "84455974-ed31-40ba-b8af-dc335bf59801"
EMPLOYEE = "94455974-ed31-40ba-b8af-dc335bf59801"
CATALOG = "a4455974-ed31-40ba-b8af-dc335bf59801"
FOREIGN = "b4455974-ed31-40ba-b8af-dc335bf59801"
MISSING = "c4455974-ed31-40ba-b8af-dc335bf59801"
BASE = "/api/v1/colaboradores"
HEADERS = {"Authorization": "Bearer caller-jwt"}
PAYLOAD = dict(nome="Pessoa Teste", cpf="12345678901", funcao_id=CATALOG,
               setor_id=CATALOG, ambiente_id=CATALOG, data_admissao="2025-01-01")


@pytest.fixture
def upstream(app):
    row = dict(PAYLOAD, id=EMPLOYEE, empresa_id=COMPANY, matricula=None,
               data_demissao=None, active=True, created_at="2025-01-01T00:00:00Z",
               funcao={"id": CATALOG, "nome": "Função"},
               setor={"id": CATALOG, "nome": "Setor"},
               ambiente={"id": CATALOG, "nome": "Ambiente"})
    state = dict(role="empresa", active=True, company_status="ativa", auth_status=200,
                 requests=[], writes=[], row=row, duplicate=False)

    def handler(request):
        # Any privileged client or accidental remote request fails this contract.
        assert request.headers["apikey"] == "test-anon-key"
        assert request.headers["authorization"] == "Bearer caller-jwt"
        assert "secret" not in str(request.headers)
        state["requests"].append(request)
        path = request.url.path
        if path == "/auth/v1/user":
            if state["auth_status"] != 200:
                return httpx.Response(401, json={"msg": "invalid token"})
            return httpx.Response(200, json=dict(id=USER_ID, email="actor@example.com",
                aud="authenticated", app_metadata={}, user_metadata={}, created_at="2025-01-01T00:00:00Z"))
        if path == "/rest/v1/user_profiles":
            assert request.url.params["id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=[dict(id=USER_ID, full_name="Actor", role=state["role"],
                empresa_id=COMPANY, active=state["active"])])
        if path == "/rest/v1/empresas":
            return httpx.Response(200, json=[dict(id=COMPANY, status=state["company_status"])])
        if path in [f"/rest/v1/{table}" for table in ("funcoes", "setores", "ambientes")]:
            assert request.url.params["empresa_id"] == f"eq.{COMPANY}"
            return httpx.Response(200, json=[{"id": CATALOG}] if request.url.params["id"] == f"eq.{CATALOG}" else [])
        assert path == "/rest/v1/colaboradores"
        if request.method != "POST":
            assert request.url.params["empresa_id"] == f"eq.{COMPANY}"
            target = request.url.params.get("id")
            if target and target != f"eq.{EMPLOYEE}":
                return httpx.Response(200, json=[])
        if request.method == "GET":
            if "id" not in request.url.params:
                assert request.url.params["active"] == "eq.True"
            return httpx.Response(200, json=[state["row"]])
        assert request.method in ("POST", "PATCH")
        payload = json.loads(request.content)
        state["writes"].append(payload)
        if state["duplicate"]:
            return httpx.Response(409, json={"code": "23505", "message": "private database details", "details": None, "hint": None})
        if request.method == "POST":
            assert payload["empresa_id"] == COMPANY
            assert payload["active"] is True
        state["row"].update(payload)
        return httpx.Response(201 if request.method == "POST" else 200, json=[state["row"]])

    override_supabase(app, handler)
    return state


@pytest.mark.parametrize("role", ["empresa", "gestor", "operacional"])
def test_list_and_detail_scoped_to_authenticated_company(client, upstream, role):
    upstream["role"] = role
    result = client.get(BASE, headers=HEADERS)
    assert result.status_code == 200, result.text
    assert [r["empresa_id"] for r in result.json()] == [COMPANY]
    assert result.headers["cache-control"] == "no-store"
    assert client.get(f"{BASE}/{EMPLOYEE}", headers=HEADERS).status_code == 200


@pytest.mark.parametrize("method,path,payload", [
    ("GET", BASE, None), ("GET", f"{BASE}/{EMPLOYEE}", None),
    ("POST", BASE, PAYLOAD), ("PATCH", f"{BASE}/{EMPLOYEE}", {"nome": "Outro"}),
    ("PATCH", f"{BASE}/{EMPLOYEE}", {"active": False, "data_demissao": "2026-01-01"}),
])
def test_admin_denied_all_operations(client, upstream, method, path, payload):
    upstream["role"] = "admin"
    assert client.request(method, path, headers=HEADERS, json=payload).status_code == 403
    assert not upstream["writes"]


@pytest.mark.parametrize("method,payload", [("POST", PAYLOAD), ("PATCH", {"nome": "Outro"}),
    ("PATCH", {"active": False, "data_demissao": "2026-01-01"})])
def test_operational_cannot_write(client, upstream, method, payload):
    upstream["role"] = "operacional"
    assert client.request(method, BASE if method == "POST" else f"{BASE}/{EMPLOYEE}",
                          headers=HEADERS, json=payload).status_code == 403
    assert not upstream["writes"]


@pytest.mark.parametrize("headers,invalid", [({}, False), (HEADERS, True)])
def test_missing_or_invalid_jwt(client, upstream, headers, invalid):
    if invalid:
        upstream["auth_status"] = 401
    assert client.get(BASE, headers=headers).status_code == 401


@pytest.mark.parametrize("change", [{"active": False}, {"company_status": "suspensa"}])
def test_inactive_profile_or_company(client, upstream, change):
    upstream.update(change)
    assert client.get(BASE, headers=HEADERS).status_code == 403


@pytest.mark.parametrize("method", ["GET", "PATCH"])
def test_cross_tenant_target_not_found(client, upstream, method):
    result = client.request(method, f"{BASE}/{FOREIGN}", headers=HEADERS,
                            json={"nome": "Outro"} if method == "PATCH" else None)
    assert result.status_code == 404
    assert not upstream["writes"]


@pytest.mark.parametrize("method", ["POST", "PATCH"])
@pytest.mark.parametrize("extra", [{"empresa_id": OTHER}, {"id": FOREIGN}, {"unexpected": True}])
def test_client_tenant_and_extra_fields_rejected(client, upstream, method, extra):
    payload = (PAYLOAD if method == "POST" else {"nome": "Outro"}) | extra
    assert client.request(method, BASE if method == "POST" else f"{BASE}/{EMPLOYEE}",
                          headers=HEADERS, json=payload).status_code == 422
    assert not upstream["writes"]


@pytest.mark.parametrize("method", ["POST", "PATCH"])
@pytest.mark.parametrize("field", ["funcao_id", "setor_id", "ambiente_id"])
@pytest.mark.parametrize("catalog", [FOREIGN, MISSING])
def test_foreign_or_missing_catalog_rejected(client, upstream, method, field, catalog):
    payload = (PAYLOAD if method == "POST" else {}) | {field: catalog}
    result = client.request(method, BASE if method == "POST" else f"{BASE}/{EMPLOYEE}", headers=HEADERS, json=payload)
    assert result.status_code == 422
    assert result.json()["error"]["code"] == "invalid_catalog"
    assert not upstream["writes"]


@pytest.mark.parametrize("role", ["empresa", "gestor"])
def test_create_edit_deactivate_using_only_caller_jwt(client, upstream, role):
    upstream["role"] = role
    created = client.post(BASE, headers=HEADERS, json=PAYLOAD)
    assert created.status_code == 201, created.text
    assert created.json()["empresa_id"] == COMPANY
    edited = client.patch(f"{BASE}/{EMPLOYEE}", headers=HEADERS, json={"nome": "Editado", "ambiente_id": None})
    assert edited.status_code == 200
    assert edited.json()["nome"] == "Editado"
    assert edited.json()["ambiente_id"] is None
    deactivated = client.patch(f"{BASE}/{EMPLOYEE}", headers=HEADERS, json={"active": False, "data_demissao": "2026-01-01"})
    assert deactivated.status_code == 200
    assert deactivated.json()["active"] is False
    assert deactivated.json()["data_demissao"] == "2026-01-01"
    assert len(upstream["writes"]) == 3


@pytest.mark.parametrize("payload", [{}, {"active": False}, {"active": True, "data_demissao": "2026-01-01"},
    {"data_demissao": "2026-01-01"}, {"active": False, "data_demissao": None}, {"active": 0, "data_demissao": "2026-01-01"},
    {"cpf": "12345678901"}, {"data_admissao": "2025-02-01"}, {"nome": None}])
def test_patch_contract(client, upstream, payload):
    assert client.patch(f"{BASE}/{EMPLOYEE}", headers=HEADERS, json=payload).status_code == 422
    assert not upstream["writes"]


def test_duplicate_cpf_is_conflict_without_details(client, upstream):
    upstream["duplicate"] = True
    result = client.post(BASE, headers=HEADERS, json=PAYLOAD)
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "colaborador_conflict"
    assert "private database details" not in result.text


def test_query_tenant_selector_rejected(client, upstream):
    assert client.get(BASE, params={"empresa_id": OTHER}, headers=HEADERS).status_code == 422


def test_patch_revalidates_unchanged_catalogs(client, upstream):
    upstream["row"]["funcao_id"] = FOREIGN
    assert client.patch(f"{BASE}/{EMPLOYEE}", headers=HEADERS, json={"nome": "Outro"}).status_code == 422
    assert not upstream["writes"]
