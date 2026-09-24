from collections.abc import Iterator
from typing import Annotated

import httpx
from fastapi import Depends, Request
from supabase import Client
from supabase_auth.errors import AuthApiError, AuthRetryableError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import get_bearer_token
from app.integrations.supabase import create_user_client
from app.schemas.auth import AuthenticatedUser
from app.schemas.profile import MeResponse
from app.services.profiles import get_authorized_profile


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_supabase_client(
    settings: Annotated[Settings, Depends(get_settings)],
    token: Annotated[str, Depends(get_bearer_token)],
) -> Iterator[Client]:
    # Owned by this request and closed even when authentication or a query fails.
    with httpx.Client(timeout=settings.supabase_timeout_seconds) as http_client:
        yield create_user_client(settings, token, http_client)


def get_current_user(
    client: Annotated[Client, Depends(get_supabase_client)],
    token: Annotated[str, Depends(get_bearer_token)],
) -> AuthenticatedUser:
    try:
        response = client.auth.get_user(token)
    except AuthApiError as exc:
        if exc.status in {400, 401, 403, 422}:
            raise AppError(
                401, "unauthorized", "Token inválido ou expirado.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from None
        raise AppError(503, "auth_unavailable", "Serviço de autenticação indisponível.") from None
    except (httpx.HTTPError, AuthRetryableError):
        raise AppError(503, "auth_unavailable", "Serviço de autenticação indisponível.") from None

    if response is None or response.user is None:
        raise AppError(
            401, "unauthorized", "Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthenticatedUser(id=response.user.id, email=response.user.email)


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


def get_current_profile(
    user: CurrentUser,
    client: Annotated[Client, Depends(get_supabase_client)],
) -> MeResponse:
    return get_authorized_profile(client, user)


CurrentProfile = Annotated[MeResponse, Depends(get_current_profile)]
