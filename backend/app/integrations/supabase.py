import httpx
from supabase import Client, ClientOptions, create_client

from app.core.config import Settings
from app.core.errors import AppError


def create_user_client(settings: Settings, token: str, http_client: httpx.Client) -> Client:
    """One client per request, using the caller's JWT so data access respects RLS."""
    if settings.supabase_url is None or settings.supabase_anon_key is None:
        raise AppError(503, "supabase_not_configured", "Integração Supabase não configurada.")
    return create_client(
        str(settings.supabase_url).rstrip("/"),
        settings.supabase_anon_key.get_secret_value(),
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
            headers={"Authorization": f"Bearer {token}"},
            httpx_client=http_client,
        ),
    )


def create_admin_client(settings: Settings, http_client: httpx.Client) -> Client:
    """Explicit privileged access; never use as a default route dependency."""
    if settings.supabase_url is None or settings.supabase_service_role_key is None:
        raise AppError(503, "supabase_admin_not_configured", "Integração administrativa não configurada.")
    return create_client(
        str(settings.supabase_url).rstrip("/"),
        settings.supabase_service_role_key.get_secret_value(),
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
            httpx_client=http_client,
        ),
    )
