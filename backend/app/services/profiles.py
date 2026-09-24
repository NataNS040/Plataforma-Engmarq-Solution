from supabase import Client

from app.core.errors import AppError
from app.repositories.profiles import company_is_active, get_profile
from app.schemas.auth import AuthenticatedUser
from app.schemas.profile import MeResponse


def get_authorized_profile(client: Client, user: AuthenticatedUser) -> MeResponse:
    # The ID comes exclusively from Supabase Auth, never from a request parameter.
    profile = get_profile(client, user.id)
    if profile is None or profile.id != user.id or not profile.active:
        raise AppError(403, "access_denied", "Perfil indisponível ou sem acesso à plataforma.")
    if not company_is_active(client, profile.empresa_id):
        raise AppError(403, "access_denied", "Empresa indisponível ou sem acesso à plataforma.")
    # Email comes from the verified identity; role/company come from the existing profile.
    return MeResponse(**profile.model_dump(), email=user.email)
