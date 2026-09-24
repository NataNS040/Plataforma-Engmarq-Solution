from uuid import UUID

import httpx
from postgrest.exceptions import APIError
from pydantic import ValidationError
from supabase import Client

from app.core.errors import AppError
from app.schemas.profile import UserProfile


def get_profile(client: Client, user_id: UUID) -> UserProfile | None:
    try:
        result = (
            client.table("user_profiles")
            .select("id,full_name,role,empresa_id,active")
            .eq("id", str(user_id))
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return UserProfile.model_validate(result.data[0])
    except (APIError, httpx.HTTPError, ValidationError):
        raise AppError(503, "profile_unavailable", "Não foi possível verificar o perfil.") from None


def company_is_active(client: Client, company_id: UUID) -> bool:
    try:
        result = (
            client.table("empresas")
            .select("id,status")
            .eq("id", str(company_id))
            .limit(1)
            .execute()
        )
    except (APIError, httpx.HTTPError):
        raise AppError(503, "profile_unavailable", "Não foi possível verificar a empresa.") from None
    return bool(
        result.data
        and result.data[0].get("id") == str(company_id)
        and result.data[0].get("status") == "ativa"
    )
