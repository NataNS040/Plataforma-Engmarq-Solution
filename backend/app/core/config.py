from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, HttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        hide_input_in_errors=True,
    )

    cors_origins: list[str] = Field(default_factory=list)
    supabase_url: HttpUrl | None = None
    supabase_anon_key: SecretStr | None = None
    supabase_secret_key: SecretStr | None = None
    supabase_service_role_key: SecretStr | None = None
    supabase_timeout_seconds: float = Field(default=10, gt=0, le=60)

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, origins: list[str]) -> list[str]:
        normalized = []
        for origin in origins:
            url = urlsplit(origin)
            if (
                url.scheme not in {"http", "https"}
                or not url.hostname
                or "*" in origin
                or url.username is not None
                or url.password is not None
                or url.path not in {"", "/"}
                or url.query
                or url.fragment
            ):
                raise ValueError("CORS_ORIGINS must contain explicit HTTP(S) origins")
            normalized.append(origin.rstrip("/"))
        return list(dict.fromkeys(normalized))

    @field_validator("supabase_url")
    @classmethod
    def validate_supabase_url(cls, url: HttpUrl | None) -> HttpUrl | None:
        if url is None:
            return None
        if url.username or url.password or url.query or url.fragment or url.path not in {None, "/"}:
            raise ValueError("SUPABASE_URL must be a project URL without credentials or path")
        if url.scheme != "https" and url.host not in {"localhost", "127.0.0.1", "[::1]"}:
            raise ValueError("SUPABASE_URL requires HTTPS except for local development")
        return url

    @field_validator("supabase_anon_key", "supabase_secret_key", "supabase_service_role_key")
    @classmethod
    def validate_key(cls, key: SecretStr | None) -> SecretStr | None:
        if key is not None and not key.get_secret_value().strip():
            raise ValueError("Supabase keys must not be blank")
        return key

    @model_validator(mode="after")
    def validate_supabase_configuration(self) -> "Settings":
        if bool(self.supabase_url) != bool(self.supabase_anon_key):
            raise ValueError("Set SUPABASE_URL and SUPABASE_ANON_KEY together")
        if (self.supabase_secret_key or self.supabase_service_role_key) and not self.supabase_url:
            raise ValueError("Configure Supabase before setting its service role key")
        return self
