import json

import httpx
import pytest

from app.services import usuarios_service
from test_security import USER_ID, override_supabase
from test_usuarios import COMPANY, OTHER, CREATED, HEADERS

BASE = "/api/v1/usuarios"
TARGET = f"{BASE}/{CREATED}"


@pytest.fixture
def upstream(app, monkeypatch):
    state = {"role": "gestor", "active": True, "status": "ativa", "auth_status": 200,
             "requests": [], "patches": [], "target_role": "operacional",
             "target_company": COMPANY, "target_active": True, "error": None}

    def forbidden(*args, **kwargs):
        pytest.fail("List/get/patch must never open a privileged client")

    monkeypatch.setattr(usuarios_service, "create_admin_client", forbidden)

    def handler(request):
        assert request.headers["apikey"] == "test-anon-key"
        assert request.headers["authorization"] == "Bearer caller-jwt"
        assert "test-service-secret" not in str(request.headers)
        if request.url.path == "/auth/v1/user":
            if state["auth_status"] != 200:
                return httpx.Response(401, json={"msg": "private-secret"})
            return httpx.Response(200, json={"id": USER_ID, "email": "actor@example.com",
                "aud": "authenticated", "app_metadata": {}, "user_metadata": {},
                "created_at": "2026-01-01T00:00:00Z"})
        if request.url.path == "/rest/v1/empresas":
            return httpx.Response(200, json=[{"id": COMPANY, "status": state["status"]}])
        assert request.url.path == "/rest/v1/user_profiles"
        params = request.url.params
        if params.get("select") == "id,full_name,role,empresa_id,active":
            assert params["id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=[{"id": USER_ID, "full_name": "Actor",
                "role": state["role"], "empresa_id": COMPANY, "active": state["active"]}])
        state["requests"].append(request)
        if state["error"]:
            return httpx.Response(403, json={"code": state["error"], "message": "private-secret", "hint": None, "details": None})
        assert params["select"] == "id,email,full_name,role,empresa_id,active,created_at"
        row = {"id": CREATED, "email": "target@example.com", "full_name": "Target",
               "role": state["target_role"], "empresa_id": state["target_company"],
               "active": state["target_active"], "created_at": "2026-01-01T00:00:00Z"}
        if params.get("empresa_id") not in {None, f"eq.{row['empresa_id']}"}:
            return httpx.Response(200, json=[])
        if request.method == "PATCH":
            state["patches"].append(request)
            if state.get("write_denied"):
                return httpx.Response(200, json=[])
            payload = json.loads(request.content)
            assert set(payload) <= {"role", "active"}
            row.update(payload)
        return httpx.Response(200, json=[row])

    override_supabase(app, handler)
    return state


@pytest.mark.parametrize("method,path,payload", [
    ("GET", BASE, None), ("GET", TARGET, None), ("PATCH", TARGET, {"active": False}),
])
def test_missing_jwt(client, upstream, method, path, payload):
    assert client.request(method, path, json=payload).status_code == 401
    assert upstream["requests"] == []


@pytest.mark.parametrize("changes", [
    {"role": "operacional"}, {"active": False}, {"status": "suspensa"},
])
@pytest.mark.parametrize("method,path,payload", [
    ("GET", BASE, None), ("GET", TARGET, None), ("PATCH", TARGET, {"active": False}),
])
def test_ineligible_actor_cannot_administer(client, upstream, changes, method, path, payload):
    upstream.update(changes)
    assert client.request(method, path, headers=HEADERS, json=payload).status_code == 403
    assert upstream["requests"] == []


def test_invalid_jwt(client, upstream):
    upstream["auth_status"] = 401
    assert client.get(BASE, headers=HEADERS).status_code == 401
    assert upstream["requests"] == []


@pytest.mark.parametrize("role", ["gestor", "empresa"])
def test_manager_list_is_scoped_without_filter(client, upstream, role):
    upstream["role"] = role
    response = client.get(BASE, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()[0]["empresa_id"] == COMPANY
    params = upstream["requests"][0].url.params
    assert params["empresa_id"] == f"eq.{COMPANY}"
    assert params["order"] == "full_name.asc,id.asc"
    assert response.headers["cache-control"] == "no-store"


def test_manager_cannot_request_other_company_list(client, upstream):
    assert client.get(BASE, params={"empresa_id": OTHER}, headers=HEADERS).status_code == 403
    assert upstream["requests"] == []


@pytest.mark.parametrize("method,payload", [("GET", None), ("PATCH", {"active": False})])
def test_cross_tenant_id_is_hidden(client, upstream, method, payload):
    upstream["target_company"] = OTHER
    response = client.request(method, TARGET, headers=HEADERS, json=payload)
    assert response.status_code == 404
    assert upstream["requests"][0].url.params["empresa_id"] == f"eq.{COMPANY}"
    assert upstream["patches"] == []


@pytest.mark.parametrize("role", ["gestor", "empresa"])
def test_privilege_escalation_is_denied_before_target_lookup(client, upstream, role):
    upstream["role"] = role
    assert client.patch(TARGET, headers=HEADERS, json={"role": "admin"}).status_code == 403
    assert upstream["requests"] == []


@pytest.mark.parametrize("payload", [{"role": "gestor"}, {"active": False}, {"active": True}])
def test_managers_cannot_edit_existing_admin(client, upstream, payload):
    upstream["target_role"] = "admin"
    assert client.patch(TARGET, headers=HEADERS, json=payload).status_code == 403
    assert upstream["patches"] == []


@pytest.mark.parametrize("role", ["admin", "gestor", "empresa"])
@pytest.mark.parametrize("payload", [{"role": "operacional"}, {"active": False}])
def test_cannot_change_own_role_or_status(client, upstream, role, payload):
    upstream["role"] = role
    assert client.patch(f"{BASE}/{USER_ID}", headers=HEADERS, json=payload).status_code == 403
    assert upstream["requests"] == []


@pytest.mark.parametrize("payload", [
    {"empresa_id": OTHER}, {"email": "changed@example.com"}, {"full_name": "Name"},
    {"password": "private-secret"}, {"id": USER_ID}, {"active": True, "extra": 1},
    {}, {"role": None}, {"active": None}, {"active": "false"}, {"role": "owner"},
])
def test_patch_contract_rejects_movement_and_extra_fields(client, upstream, payload):
    response = client.patch(TARGET, headers=HEADERS, json=payload)
    assert response.status_code == 422
    assert "private-secret" not in response.text
    assert upstream["patches"] == []


@pytest.mark.parametrize("role", ["admin", "gestor", "empresa"])
@pytest.mark.parametrize("payload", [{"role": "empresa"}, {"active": False}, {"active": True}])
def test_valid_edit_uses_only_jwt(client, upstream, role, payload):
    upstream["role"] = role
    response = client.patch(TARGET, headers=HEADERS, json=payload)
    assert response.status_code == 200, response.text
    assert all(response.json()[key] == value for key, value in payload.items())
    request = upstream["patches"][0]
    assert json.loads(request.content) == payload
    if role != "admin":
        assert request.url.params["empresa_id"] == f"eq.{COMPANY}"
        assert request.url.params["role"] == "neq.admin"
    assert set(response.json()) == {"id", "email", "full_name", "role", "empresa_id", "active", "created_at"}


def test_admin_can_list_filter_get_and_promote_other_company(client, upstream):
    upstream.update(role="admin", target_company=OTHER)
    assert client.get(BASE, headers=HEADERS).status_code == 200
    assert "empresa_id" not in upstream["requests"][-1].url.params
    assert client.get(BASE, headers=HEADERS, params={"empresa_id": OTHER}).status_code == 200
    assert upstream["requests"][-1].url.params["empresa_id"] == f"eq.{OTHER}"
    assert client.get(TARGET, headers=HEADERS).status_code == 200
    response = client.patch(TARGET, headers=HEADERS, json={"role": "admin"})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_rls_rechecks_when_target_changes_after_lookup(client, upstream):
    upstream["write_denied"] = True
    assert client.patch(TARGET, headers=HEADERS, json={"active": False}).status_code == 404


@pytest.mark.parametrize("code,status", [("42501", 403), ("40P01", 409), ("40001", 409), ("XX000", 503)])
def test_database_errors_are_sanitized(client, upstream, code, status):
    upstream["error"] = code
    response = client.get(BASE, headers=HEADERS)
    assert response.status_code == status
    assert "private-secret" not in response.text
