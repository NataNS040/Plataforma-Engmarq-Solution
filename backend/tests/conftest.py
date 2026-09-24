import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    for name in (
        "CORS_ORIGINS", "SUPABASE_URL", "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def app():
    return create_app(Settings(_env_file=None, cors_origins=["http://localhost:5173"]))


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
