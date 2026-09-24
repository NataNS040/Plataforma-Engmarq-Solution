import json
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

USER = "cde82aba-f063-40f2-81b6-ceab59e543ed"
OWN = "74455974-ed31-40ba-b8af-dc335bf59801"
OTHER = "cd60a82f-8ca9-4024-95a6-a136a28208ea"
HEADERS = {"Authorization": "Bearer user-jwt"}
INPUT = {"razao_social": "Empresa teste", "cnpj": "12.345.678/0001-90"}
ROW = {
    "id": OWN, **INPUT, "setor": None, "cidade": None, "uf": None,
    "responsavel": None, "email": None, "telefone": None, "logo_url": None,
    "status": "ativa", "created_at": "2026-01-01T00:00:00Z",
}


@pytest.fixture
def upstream(app):
    state = {"role": "admin", "active": True, "company_status": "ativa",
             "auth_status": 200, "error": None, "empty": False, "requests": [], "operations": []}

    def handler(request):
        state["requests"].append(request)
        # Includes both reads and writes: never service_role, even for admins.
        assert request.headers["authorization"] == "Bearer user-jwt"
        assert request.headers["apikey"] == "public-anon-key"
        if request.url.path == "/auth/v1/user":
            if state["auth_status"] != 200:
                return httpx.Response(state["auth_status"], json={"msg": "invalid token"})
            return httpx.Response(200, json={
                "id": USER, "email": "admin@example.com", "aud": "authenticated",
                "app_metadata": {}, "user_metadata": {"role": "admin"},
                "created_at": "2026-01-01T00:00:00Z",
            })
        if request.url.path == "/rest/v1/user_profiles":
            return httpx.Response(200, json=[{
                "id": USER, "full_name": "Test", "role": state["role"],
                "empresa_id": OWN, "active": state["active"],
            }])
        assert request.url.path == "/rest/v1/empresas"
        if request.method == "GET" and request.url.params.get("select") == "id,status":
            return httpx.Response(200, json=[{"id": OWN, "status": state["company_status"]}])
        state["operations"].append(request)
        if state["error"]:
            return httpx.Response(400, json={
                "code": state["error"], "message": "private SQL detail", "hint": None, "details": None,
            })
        if state["empty"]:
            return httpx.Response(200, json=[])
        row = {**ROW}
        if request.method in {"POST", "PATCH"}:
            row.update(json.loads(request.content))
        elif "colaboradores(count)" in request.url.params.get("select", ""):
            row["colaboradores"] = [{"count": 7}]
        return httpx.Response(201 if request.method == "POST" else 200, json=[row])

    settings = Settings(_env_file=None, supabase_url="https://project.supabase.co",
                        supabase_anon_key="public-anon-key")

    def dependency(token: Annotated[str, Depends(get_bearer_token)]) -> Iterator[Client]:
        with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
            yield create_user_client(settings, token, http_client)

    app.dependency_overrides[get_supabase_client] = dependency
    return state


@pytest.mark.parametrize("role", ["admin", "gestor", "empresa", "operacional"])
def test_list_scope_count_and_order(client, upstream, role):
    upstream["role"] = role
    response = client.get("/api/v1/empresas", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == [{**ROW, "colaboradores_count": 7}]
    assert response.headers["cache-control"] == "no-store"
    params = upstream["operations"][0].url.params
    assert params["order"] == "razao_social.asc"
    assert params.get("id") == (None if role == "admin" else f"eq.{OWN}")


def test_admin_creates_with_defaults_and_no_privileged_key(client, upstream):
    response = client.post("/api/v1/empresas", json=INPUT, headers=HEADERS)
    assert response.status_code == 201
    assert response.json() == ROW
    request = upstream["operations"][0]
    payload = json.loads(request.content)
    assert payload["status"] == "ativa"
    assert payload["setor"] is None
    assert "id" not in payload and "created_at" not in payload


@pytest.mark.parametrize("role", ["gestor", "empresa", "operacional"])
def test_only_admin_creates(client, upstream, role):
    upstream["role"] = role
    assert client.post("/api/v1/empresas", json=INPUT, headers=HEADERS).status_code == 403
    assert upstream["operations"] == []


@pytest.mark.parametrize("role", ["admin", "gestor", "empresa"])
def test_edit_own_company_preserves_omitted_fields_and_explicit_null(client, upstream, role):
    upstream["role"] = role
    response = client.patch(f"/api/v1/empresas/{OWN}", json={"cidade": None}, headers=HEADERS)
    assert response.status_code == 200
    request = upstream["operations"][0]
    assert request.method == "PATCH"
    assert request.url.params["id"] == f"eq.{OWN}"
    assert json.loads(request.content) == {"cidade": None}


def test_operacional_cannot_edit(client, upstream):
    upstream["role"] = "operacional"
    assert client.patch(f"/api/v1/empresas/{OWN}", json={"cidade": "Teste"}, headers=HEADERS).status_code == 403
    assert upstream["operations"] == []


@pytest.mark.parametrize("role", ["gestor", "empresa", "operacional"])
@pytest.mark.parametrize("method", ["GET", "PATCH"])
def test_cross_company_access_is_denied_before_persistence(client, upstream, role, method):
    upstream["role"] = role
    args = {"json": {"cidade": "Teste"}} if method == "PATCH" else {}
    response = client.request(method, f"/api/v1/empresas/{OTHER}", headers=HEADERS, **args)
    assert response.status_code == 403
    assert upstream["operations"] == []


def test_admin_can_edit_other_company(client, upstream):
    response = client.patch(f"/api/v1/empresas/{OTHER}", json={"cidade": "Teste"}, headers=HEADERS)
    assert response.status_code == 200
    assert upstream["operations"][0].url.params["id"] == f"eq.{OTHER}"


@pytest.mark.parametrize("status", ["suspensa", "ativa", "pendente"])
def test_admin_status_changes_are_updates_never_deletes(client, upstream, status):
    response = client.patch(f"/api/v1/empresas/{OTHER}", json={"status": status}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["status"] == status
    assert [r.method for r in upstream["operations"]] == ["PATCH"]
    assert json.loads(upstream["operations"][0].content) == {"status": status}


@pytest.mark.parametrize("role", ["gestor", "empresa", "operacional"])
def test_non_admin_cannot_change_status(client, upstream, role):
    upstream["role"] = role
    response = client.patch(f"/api/v1/empresas/{OWN}", json={"status": "suspensa"}, headers=HEADERS)
    assert response.status_code == 403
    assert upstream["operations"] == []


@pytest.mark.parametrize("payload", [{}, {"status": None}, {"status": "invalid"},
    {"razao_social": None}, {"cnpj": None}, {"cnpj": "invalid"}, {"uf": "ABC"},
    {"id": OTHER}, {"created_at": "2026-01-01"}, {"role": "admin"}])
def test_patch_rejects_invalid_or_server_owned_fields(client, upstream, payload):
    response = client.patch(f"/api/v1/empresas/{OWN}", json=payload, headers=HEADERS)
    assert response.status_code == 422
    assert upstream["operations"] == []


@pytest.mark.parametrize("payload", [{}, {**INPUT, "cnpj": "invalid"}, {**INPUT, "id": OTHER}])
def test_create_validates_input(client, upstream, payload):
    assert client.post("/api/v1/empresas", json=payload, headers=HEADERS).status_code == 422
    assert upstream["operations"] == []


@pytest.mark.parametrize("condition", ["invalid_token", "inactive_profile", "suspended_company"])
def test_identity_and_active_access_are_checked_before_writes(client, upstream, condition):
    if condition == "invalid_token":
        upstream["auth_status"] = 401
    elif condition == "inactive_profile":
        upstream["active"] = False
    else:
        upstream["company_status"] = "suspensa"
    response = client.post("/api/v1/empresas", json=INPUT, headers=HEADERS)
    assert response.status_code == (401 if condition == "invalid_token" else 403)
    assert upstream["operations"] == []


@pytest.mark.parametrize("code,status", [("23505", 409), ("42501", 403), ("XX000", 503)])
def test_database_errors_are_standardized_and_private(client, upstream, code, status):
    upstream["error"] = code
    response = client.post("/api/v1/empresas", json=INPUT, headers=HEADERS)
    assert response.status_code == status
    assert "error" in response.json()
    assert "private SQL detail" not in response.text


@pytest.mark.parametrize("method", ["GET", "PATCH"])
def test_missing_or_rls_hidden_record_returns_404(client, upstream, method):
    upstream["empty"] = True
    args = {"json": {"cidade": "Teste"}} if method == "PATCH" else {}
    assert client.request(method, f"/api/v1/empresas/{OWN}", headers=HEADERS, **args).status_code == 404


def test_missing_authentication_and_invalid_uuid_never_query_companies(client, upstream):
    assert client.get("/api/v1/empresas").status_code == 401
    assert client.get("/api/v1/empresas/not-a-uuid", headers=HEADERS).status_code == 422
    assert upstream["operations"] == []
