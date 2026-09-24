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

USER_ID = "cde82aba-f063-40f2-81b6-ceab59e543ed"
COMPANY_ID = "74455974-ed31-40ba-b8af-dc335bf59801"
OTHER_USER_ID = "cd60a82f-8ca9-4024-95a6-a136a28208ea"
HEADERS = {"Authorization": "Bearer test-token", "Origin": "http://localhost:5173"}


@pytest.fixture
def upstream(app):
    state = {
        "auth_status": 200,
        "profile": {"id": USER_ID, "full_name": "Test User", "role": "empresa", "empresa_id": COMPANY_ID, "active": True},
        "company": {"id": COMPANY_ID, "status": "ativa"},
        "db_failure": False,
        "requests": [],
    }

    def handler(request):
        state["requests"].append(request)
        assert request.headers["Authorization"] == "Bearer test-token"
        assert request.headers["apikey"] == "test-anon-key"
        if request.url.path == "/auth/v1/user":
            if state["auth_status"] != 200:
                return httpx.Response(state["auth_status"], json={"msg": "private upstream error"})
            return httpx.Response(200, json={
                "id": USER_ID, "email": "verified@example.com", "aud": "authenticated",
                "app_metadata": {}, "user_metadata": {"role": "admin", "empresa_id": "untrusted"},
                "created_at": "2026-01-01T00:00:00Z",
            })
        if state["db_failure"]:
            return httpx.Response(500, json={"message": "private database error", "code": "XX000"})
        if request.url.path == "/rest/v1/user_profiles":
            assert request.url.params["id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=[state["profile"]] if state["profile"] else [])
        if request.url.path == "/rest/v1/empresas":
            assert request.url.params["id"] == f"eq.{COMPANY_ID}"
            return httpx.Response(200, json=[state["company"]] if state["company"] else [])
        raise AssertionError(f"Unexpected Supabase path: {request.url.path}")

    settings = Settings(_env_file=None, supabase_url="https://project.supabase.co", supabase_anon_key="test-anon-key")

    def dependency(token: Annotated[str, Depends(get_bearer_token)]) -> Iterator[Client]:
        with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
            yield create_user_client(settings, token, http_client)

    app.dependency_overrides[get_supabase_client] = dependency
    return state


def test_me_requires_a_bearer_token(client):
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("role", ["admin", "gestor", "operacional", "empresa"])
def test_me_returns_only_verified_identity_and_existing_profile(client, upstream, role):
    upstream["profile"]["role"] = role
    response = client.get("/api/v1/me", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {**upstream["profile"], "email": "verified@example.com"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "test-token" not in response.text
    assert [request.url.path for request in upstream["requests"]] == [
        "/auth/v1/user", "/rest/v1/user_profiles", "/rest/v1/empresas",
    ]


def test_me_ignores_requested_identity_and_metadata_role(client, upstream):
    response = client.get(f"/api/v1/me?user_id={OTHER_USER_ID}&empresa_id=other", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["id"] == USER_ID
    assert response.json()["role"] == "empresa"
    assert response.json()["empresa_id"] == COMPANY_ID


def test_invalid_token_never_reaches_database(client, upstream):
    upstream["auth_status"] = 401
    response = client.get("/api/v1/me", headers=HEADERS)
    assert response.status_code == 401
    assert len(upstream["requests"]) == 1
    assert "private upstream error" not in response.text


@pytest.mark.parametrize("condition", ["missing", "inactive", "wrong_user"])
def test_me_denies_unavailable_profile(client, upstream, condition):
    if condition == "missing":
        upstream["profile"] = None
    elif condition == "inactive":
        upstream["profile"]["active"] = False
    else:
        upstream["profile"]["id"] = OTHER_USER_ID
    response = client.get("/api/v1/me", headers=HEADERS)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "access_denied"
    assert len(upstream["requests"]) == 2


@pytest.mark.parametrize("status", ["suspensa", "pendente", None])
def test_me_denies_inactive_or_missing_company(client, upstream, status):
    upstream["company"] = {"id": COMPANY_ID, "status": status} if status else None
    response = client.get("/api/v1/me", headers=HEADERS)
    assert response.status_code == 403


def test_profile_failure_is_not_misreported_as_invalid_token(client, upstream):
    upstream["db_failure"] = True
    response = client.get("/api/v1/me", headers=HEADERS)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "profile_unavailable"
    assert "private database error" not in response.text


def test_me_documents_bearer_authentication(client):
    schema = client.get("/openapi.json").json()
    assert schema["paths"]["/api/v1/me"]["get"]["security"] == [{"SupabaseBearer": []}]
