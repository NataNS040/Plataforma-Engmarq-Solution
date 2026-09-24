import pytest


@pytest.mark.parametrize("path", ["/health", "/api/v1/health"])
def test_health_without_supabase_or_authentication(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["content-type"] == "application/json"


def test_only_implemented_routes_are_exposed(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert set(response.json()["paths"]) == {
        "/health", "/api/v1/health", "/api/v1/me",
        "/api/v1/empresas", "/api/v1/empresas/{empresa_id}",
    }


def test_cors_allows_configured_origin_and_bearer_header(client):
    response = client.options("/api/v1/health", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejects_unconfigured_origin(client):
    response = client.options("/health", headers={
        "Origin": "https://untrusted.example",
        "Access-Control-Request-Method": "GET",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
