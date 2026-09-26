import json
from contextlib import contextmanager

import httpx
import pytest

from app.core.config import Settings
from app.integrations.supabase import create_admin_client
from app.services import usuarios_service
from test_security import USER_ID, override_supabase

COMPANY = "74455974-ed31-40ba-b8af-dc335bf59801"
OTHER = "84455974-ed31-40ba-b8af-dc335bf59801"
CREATED = "94455974-ed31-40ba-b8af-dc335bf59801"
PAYLOAD = {"email": "new@example.com", "password": "test-password", "full_name": "Nome",
           "role": "gestor", "empresa_id": COMPANY}
HEADERS = {"Authorization": "Bearer caller-jwt"}


@pytest.fixture
def upstream(app, monkeypatch):
    state = {"role": "admin", "active": True, "company_status": "ativa",
             "auth_status": 200, "create_status": 200, "profile_status": 201,
             "delete_status": 200, "admin_requests": [], "admin_opened": False}

    def user_handler(request):
        assert request.headers["apikey"] == "test-anon-key"
        assert request.headers["authorization"] == "Bearer caller-jwt"
        if request.url.path == "/auth/v1/user":
            if state["auth_status"] != 200:
                return httpx.Response(state["auth_status"], json={"msg": "private-secret"})
            return httpx.Response(200, json={"id": USER_ID, "email": "actor@example.com",
                "aud": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"})
        if request.url.path == "/rest/v1/user_profiles":
            assert str(USER_ID) in str(request.url)
            return httpx.Response(200, json=[{"id": USER_ID, "full_name": "Actor",
                "role": state["role"], "empresa_id": COMPANY, "active": state["active"]}])
        assert request.url.path == "/rest/v1/empresas"
        return httpx.Response(200, json=[{"id": COMPANY, "status": state["company_status"]}])

    def admin_handler(request):
        assert request.headers["apikey"] == "sb_secret_test-only"
        assert "caller-jwt" not in str(request.headers)
        state["admin_requests"].append(request)
        if state.get("timeout_path") == request.url.path:
            raise httpx.ReadTimeout("private-secret", request=request)
        if request.method == "DELETE":
            assert request.url.path == f"/auth/v1/admin/users/{CREATED}"
            return httpx.Response(state["delete_status"], json={"msg": "private-secret"})
        if request.url.path == "/auth/v1/admin/users":
            if state["create_status"] != 200:
                return httpx.Response(state["create_status"], headers={"X-Supabase-Api-Version": "2024-01-01"}, json={"msg": "private-secret",
                    "code": "email_exists" if state["create_status"] == 422 else "unexpected_failure"})
            return httpx.Response(200, json={"id": CREATED, "email": PAYLOAD["email"],
                "aud": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"})
        assert request.url.path == "/rest/v1/user_profiles"
        if state["profile_status"] != 201:
            return httpx.Response(state["profile_status"], json={"message": "private-secret", "code": "23503"})
        return httpx.Response(201, json=[json.loads(request.content)])

    override_supabase(app, user_handler)
    settings = Settings(_env_file=None, supabase_url="https://project.supabase.co",
        supabase_anon_key="test-anon-key", supabase_secret_key="sb_secret_test-only",
        supabase_service_role_key="unused-legacy-secret")

    def admin_factory(_settings, _http_client):
        state["admin_opened"] = True
        # The HTTP client is closed by the service's context manager.
        return create_admin_client(settings, _http_client)

    real_http_client = httpx.Client

    @contextmanager
    def mock_http_client(**kwargs):
        with real_http_client(transport=httpx.MockTransport(admin_handler), **kwargs) as client:
            yield client

    # Replace only the service module's httpx reference, not the user dependency.
    from types import SimpleNamespace
    monkeypatch.setattr(usuarios_service, "httpx", SimpleNamespace(Client=mock_http_client))
    monkeypatch.setattr(usuarios_service, "create_admin_client", admin_factory)
    return state


def test_missing_jwt(client, upstream):
    assert client.post("/api/v1/usuarios", json=PAYLOAD).status_code == 401
    assert not upstream["admin_opened"]


def test_invalid_jwt(client, upstream):
    upstream["auth_status"] = 401
    assert client.post("/api/v1/usuarios", headers=HEADERS, json=PAYLOAD).status_code == 401
    assert not upstream["admin_opened"]


@pytest.mark.parametrize("changes,payload", [
    ({"role": "operacional"}, {}), ({"active": False}, {}),
    ({"company_status": "suspensa"}, {}),
    ({"role": "gestor"}, {"role": "admin"}),
    ({"role": "empresa"}, {"role": "admin"}),
    ({"role": "gestor"}, {"empresa_id": OTHER}),
    ({"role": "empresa"}, {"empresa_id": OTHER}),
])
def test_denied_before_admin_client(client, upstream, changes, payload):
    upstream.update(changes)
    response = client.post("/api/v1/usuarios", headers=HEADERS, json=PAYLOAD | payload)
    assert response.status_code == 403
    assert not upstream["admin_opened"]


@pytest.mark.parametrize("changes", [
    {"email": "bad-email"}, {"role": "superadmin"}, {"password": "short"},
    {"full_name": "  "}, {"empresa_id": "invalid"}, {"active": True}, {"email": None},
])
def test_validation(client, upstream, changes):
    response = client.post("/api/v1/usuarios", headers=HEADERS, json=PAYLOAD | changes)
    assert response.status_code == 422
    assert "test-password" not in response.text
    assert not upstream["admin_opened"]


def test_required_fields(client, upstream):
    assert client.post("/api/v1/usuarios", headers=HEADERS, json={}).status_code == 422
    assert not upstream["admin_opened"]


@pytest.mark.parametrize("role,target_role,target_company", [
    ("admin", "admin", OTHER), ("admin", "empresa", OTHER),
    ("gestor", "operacional", COMPANY), ("empresa", "gestor", COMPANY),
])
def test_creation_preserves_contract(client, upstream, role, target_role, target_company):
    upstream["role"] = role
    payload = PAYLOAD | {"role": target_role, "empresa_id": target_company,
                         "email": " NEW@Example.com ", "full_name": " Nome "}
    response = client.post("/api/v1/usuarios", headers=HEADERS, json=payload)
    assert response.status_code == 201, response.text
    assert response.json() == {"user_id": CREATED}
    assert response.headers["cache-control"] == "no-store"
    auth, profile = upstream["admin_requests"]
    assert json.loads(auth.content) == {"email": "new@example.com", "password": PAYLOAD["password"], "email_confirm": True}
    assert json.loads(profile.content) == {"id": CREATED, "email": "new@example.com",
        "full_name": "Nome", "role": target_role, "empresa_id": target_company, "active": True}
    for secret in [PAYLOAD["password"], "sb_secret_test-only", "unused-legacy-secret", "caller-jwt"]:
        assert secret not in response.text


@pytest.mark.parametrize("status,expected", [(422, 409), (500, 503), (400, 400)])
def test_auth_failure_is_controlled(client, upstream, status, expected):
    upstream["create_status"] = status
    response = client.post("/api/v1/usuarios", headers=HEADERS, json=PAYLOAD)
    assert response.status_code == expected
    assert "private-secret" not in response.text
    assert len(upstream["admin_requests"]) == 1


@pytest.mark.parametrize("delete_status,expected,code", [
    (200, 503, "profile_creation_failed"), (500, 500, "user_rollback_failed"),
])
def test_profile_failure_compensates(client, upstream, delete_status, expected, code, caplog):
    upstream.update(profile_status=400, delete_status=delete_status)
    response = client.post("/api/v1/usuarios", headers=HEADERS, json=PAYLOAD)
    assert response.status_code == expected
    assert response.json()["error"]["code"] == code
    assert upstream["admin_requests"][-1].method == "DELETE"
    assert "private-secret" not in response.text + caplog.text
    if delete_status == 500:
        assert CREATED in caplog.text


@pytest.mark.parametrize("path,code,count", [
    ("/auth/v1/admin/users", "user_creation_unavailable", 1),
    ("/rest/v1/user_profiles", "profile_creation_failed", 3),
])
def test_transport_timeout_never_retries_creation(client, upstream, path, code, count):
    upstream["timeout_path"] = path
    response = client.post("/api/v1/usuarios", headers=HEADERS, json=PAYLOAD)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == code
    assert len(upstream["admin_requests"]) == count
    assert "private-secret" not in response.text
