from collections.abc import Iterator
from typing import Annotated

import httpx
import pytest
from fastapi import Depends
from supabase import Client

from app.core.config import Settings
from app.core.dependencies import CurrentUser, get_supabase_client
from app.core.errors import AppError
from app.core.security import get_bearer_token
from app.integrations.supabase import create_admin_client, create_user_client

USER_ID = "cde82aba-f063-40f2-81b6-ceab59e543ed"


@pytest.fixture
def protected_app(app):
    @app.get("/_test/protected")
    def protected(user: CurrentUser):
        return user
    return app


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Basic invalid"}])
def test_missing_or_wrong_auth_scheme(protected_app, client, headers):
    response = client.get("/_test/protected", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "unauthorized"


def test_unconfigured_integration_fails_closed(protected_app, client):
    response = client.get("/_test/protected", headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "supabase_not_configured"


def override_supabase(app, handler):
    settings = Settings(
        _env_file=None,
        supabase_url="https://project.supabase.co",
        supabase_anon_key="test-anon-key",
        supabase_service_role_key="test-service-secret",
    )

    def dependency(token: Annotated[str, Depends(get_bearer_token)]) -> Iterator[Client]:
        with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
            yield create_user_client(settings, token, http_client)

    app.dependency_overrides[get_supabase_client] = dependency


def test_auth_is_verified_remotely_and_tokens_do_not_leak_between_requests(protected_app, client):
    seen_tokens = []

    def handler(request):
        assert request.url.path == "/auth/v1/user"
        assert request.headers["apikey"] == "test-anon-key"
        assert "test-service-secret" not in str(request.headers)
        seen_tokens.append(request.headers["authorization"])
        return httpx.Response(200, json={
            "id": USER_ID, "email": "user@example.com", "aud": "authenticated",
            "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z",
        })

    override_supabase(protected_app, handler)
    for token in ["first-test-token", "second-test-token"]:
        response = client.get("/_test/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json() == {"id": USER_ID, "email": "user@example.com"}
        assert token not in response.text
    assert seen_tokens == ["Bearer first-test-token", "Bearer second-test-token"]


@pytest.mark.parametrize("status, expected, code", [(401, 401, "unauthorized"), (500, 503, "auth_unavailable")])
def test_auth_errors_are_sanitized(protected_app, client, status, expected, code):
    override_supabase(protected_app, lambda request: httpx.Response(status, json={"msg": "private-test-value"}))
    response = client.get("/_test/protected", headers={"Authorization": "Bearer test-token"})
    assert response.status_code == expected
    assert response.json()["error"]["code"] == code
    assert "private-test-value" not in response.text


def test_auth_timeout_is_not_reported_as_invalid_credentials(protected_app, client):
    def handler(request):
        raise httpx.ReadTimeout("private-test-value", request=request)
    override_supabase(protected_app, handler)
    response = client.get("/_test/protected", headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "auth_unavailable"


def test_postgres_data_api_uses_user_token():
    def handler(request):
        assert request.url.path == "/rest/v1/user_profiles"
        assert request.headers["authorization"] == "Bearer test-user-token"
        assert request.headers["apikey"] == "test-anon-key"
        return httpx.Response(200, json=[])

    settings = Settings(_env_file=None, supabase_url="https://project.supabase.co", supabase_anon_key="test-anon-key")
    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        client = create_user_client(settings, "test-user-token", http_client)
        assert client.table("user_profiles").select("id").execute().data == []


def test_admin_client_requires_explicit_secret():
    with httpx.Client() as http_client:
        with pytest.raises(AppError) as error:
            create_admin_client(Settings(_env_file=None), http_client)
    assert error.value.code == "supabase_admin_not_configured"


def test_admin_client_legacy_fallback():
    settings = Settings(_env_file=None, supabase_url="https://project.supabase.co",
        supabase_anon_key="test-anon-key", supabase_service_role_key="legacy-test-only")

    def handler(request):
        assert request.headers["apikey"] == "legacy-test-only"
        return httpx.Response(200, json=[])

    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        admin = create_admin_client(settings, http_client)
        assert admin.table("user_profiles").select("id").execute().data == []
