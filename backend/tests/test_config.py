import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_environment_settings_and_secrets_are_masked(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", '["https://frontend.example"]')
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-secret")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test-only")
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["https://frontend.example"]
    assert settings.supabase_service_role_key.get_secret_value() == "test-service-secret"
    assert "test-service-secret" not in repr(settings)
    assert "test-service-secret" not in settings.model_dump_json()
    assert settings.supabase_secret_key.get_secret_value() == "sb_secret_test-only"
    assert "sb_secret_test-only" not in repr(settings)
    assert "sb_secret_test-only" not in settings.model_dump_json()


@pytest.mark.parametrize("origin", ["*", "https://example.com/path", "https://user:password@example.com"])
def test_invalid_cors_configuration_is_rejected(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_origins=[origin])


def test_incomplete_supabase_configuration_is_rejected_without_echoing_secrets():
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, supabase_anon_key="private-test-value")
    assert "private-test-value" not in str(error.value)


def test_remote_supabase_requires_https():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, supabase_url="http://project.example", supabase_anon_key="test")


def test_local_supabase_can_use_http():
    settings = Settings(_env_file=None, supabase_url="http://127.0.0.1:54321", supabase_anon_key="test")
    assert settings.supabase_url.host == "127.0.0.1"
