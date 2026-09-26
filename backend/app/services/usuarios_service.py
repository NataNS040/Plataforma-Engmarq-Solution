import logging

import httpx
from supabase_auth.errors import AuthApiError

from app.core.config import Settings
from app.core.errors import AppError
from app.integrations.supabase import create_admin_client
from app.repositories.usuarios import UsuariosRepository
from app.schemas.profile import MeResponse
from app.schemas.usuarios import UsuarioCreate, UsuarioResponse

logger = logging.getLogger(__name__)


def create_usuario(data: UsuarioCreate, actor: MeResponse, settings: Settings) -> UsuarioResponse:
    if actor.role not in {"admin", "gestor", "empresa"}:
        raise AppError(403, "access_denied", "Sem permissão para criar usuários.")
    if actor.role != "admin" and (data.role == "admin" or data.empresa_id != actor.empresa_id):
        raise AppError(403, "access_denied", "Só é possível criar usuários não administradores na própria empresa.")

    with httpx.Client(timeout=settings.supabase_timeout_seconds) as http_client:
        repository = UsuariosRepository(create_admin_client(settings, http_client))
        try:
            user_id = repository.create_auth(data)
        except AuthApiError as exc:
            if exc.code in {"email_exists", "user_already_exists"}:
                raise AppError(409, "user_exists", "Já existe um usuário com este e-mail.") from None
            if exc.status in {400, 422}:
                raise AppError(400, "user_rejected", "O serviço de autenticação recusou os dados do usuário.") from None
            raise AppError(503, "user_creation_unavailable", "Não foi possível criar o usuário.") from None
        except Exception:
            # Transport errors can have an ambiguous outcome; never retry a write.
            raise AppError(503, "user_creation_unavailable", "Não foi possível confirmar a criação. Verifique o Auth antes de tentar novamente.") from None

        try:
            repository.create_profile(user_id, data)
        except Exception:
            try:
                repository.delete_auth(user_id)
            except Exception:
                # Only the ID is logged: no password, token or upstream error body.
                logger.error("User provisioning rollback failed; reconcile Auth user_id=%s", user_id)
                raise AppError(500, "user_rollback_failed", "Falha ao criar perfil e desfazer o acesso. É necessária reconciliação administrativa.") from None
            raise AppError(503, "profile_creation_failed", "Não foi possível criar o perfil. O acesso criado foi removido.") from None
    return UsuarioResponse(user_id=user_id)
