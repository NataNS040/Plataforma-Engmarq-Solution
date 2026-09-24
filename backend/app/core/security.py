from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import AppError

bearer_scheme = HTTPBearer(auto_error=False, scheme_name="SupabaseBearer")


def get_bearer_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    if credentials is None:
        raise AppError(
            401,
            "unauthorized",
            "Token Bearer obrigatório.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials
