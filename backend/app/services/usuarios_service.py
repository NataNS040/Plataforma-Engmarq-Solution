import logging
from uuid import UUID

import httpx
from supabase_auth.errors import AuthApiError

from app.core.config import Settings
from app.core.errors import AppError
from app.integrations.supabase import create_admin_client
from app.repositories.usuarios import UsuariosRepository, UsuariosRlsRepository
from app.schemas.profile import MeResponse
from app.schemas.usuarios import UsuarioCreate, UsuarioResponse, UsuarioDetail, UsuarioUpdate

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


class UsuariosService:
    def __init__(self, repository: UsuariosRlsRepository, actor: MeResponse):
        self.repository = repository
        self.actor = actor

    def _authorize(self) -> None:
        if not self.actor.active or self.actor.role not in {"admin", "gestor", "empresa"}:
            raise AppError(403, "access_denied", "Sem permissão para administrar usuários.")

    def _scope(self, empresa_id: UUID | None = None) -> UUID | None:
        self._authorize()
        if self.actor.role == "admin":
            return empresa_id
        if empresa_id is not None and empresa_id != self.actor.empresa_id:
            raise AppError(403, "access_denied", "Só é possível administrar a própria empresa.")
        return self.actor.empresa_id

    def list(self, empresa_id: UUID | None) -> list[UsuarioDetail]:
        return [UsuarioDetail.model_validate(row) for row in self.repository.list(self._scope(empresa_id))]

    def get(self, user_id: UUID) -> UsuarioDetail:
        row = self.repository.get(user_id, self._scope())
        if row is None:
            # Do not reveal whether a user exists in another tenant.
            raise AppError(404, "user_not_found", "Usuário não encontrado.")
        return UsuarioDetail.model_validate(row)

    def update(self, user_id: UUID, data: UsuarioUpdate) -> UsuarioDetail:
        scope = self._scope()
        if user_id == self.actor.id:
            raise AppError(403, "self_update_denied", "Não é possível alterar o próprio papel ou acesso.")
        if self.actor.role != "admin" and data.role == "admin":
            raise AppError(403, "access_denied", "Sem permissão para atribuir o papel de administrador.")
        target = self.get(user_id)
        if self.actor.role != "admin" and target.role == "admin":
            raise AppError(403, "access_denied", "Somente administradores podem editar outro administrador.")
        row = self.repository.update(user_id, data.model_dump(exclude_unset=True), scope)
        if row is None:
            raise AppError(404, "user_not_found", "Usuário não encontrado ou sem permissão para alteração.")
        return UsuarioDetail.model_validate(row)
