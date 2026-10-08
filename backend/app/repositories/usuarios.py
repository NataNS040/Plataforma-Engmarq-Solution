from collections.abc import Callable
from typing import Any
from uuid import UUID

import httpx
from postgrest.exceptions import APIError
from supabase import Client

from app.core.entitlements import database_error
from app.core.errors import AppError
from app.schemas.usuarios import UsuarioCreate


class UsuariosRepository:
    """Explicitly privileged repository, constructed only after authorization."""

    def __init__(self, client: Client):
        self.client = client

    def create_auth(self, data: UsuarioCreate) -> UUID:
        result = self.client.auth.admin.create_user({
            "email": str(data.email),
            "password": data.password.get_secret_value(),
            "email_confirm": True,
        })
        if result is None or result.user is None:
            raise RuntimeError("Auth returned no user")
        return UUID(str(result.user.id))

    def create_profile(self, user_id: UUID, data: UsuarioCreate, actor_id: UUID) -> None:
        self.client.rpc("provisionar_perfil_interno", {
            "actor_id": str(actor_id), "user_id": str(user_id),
            "full_name": data.full_name, "user_role": data.role,
        }).execute()

    def delete_auth(self, user_id: UUID) -> None:
        # FK user_profiles.id ON DELETE CASCADE also cleans up an insert whose
        # response was lost after the database committed it.
        self.client.auth.admin.delete_user(str(user_id))


FIELDS = "id,email,full_name,role,empresa_id,active,created_at"


class UsuariosRlsRepository:
    """Administrative data operations using the caller's JWT, never a secret key."""

    def __init__(self, client: Client):
        self.client = client

    def _execute(self, operation: Callable[[], Any]) -> list[dict]:
        try:
            return operation().data
        except APIError as exc:
            database_error(exc)
            if exc.code == "42501":
                raise AppError(403, "access_denied", "Sem permissão para alterar este usuário.") from None
            if exc.code in {"40P01", "40001"}:
                raise AppError(409, "user_conflict", "Os acessos foram alterados simultaneamente. Atualize a equipe.") from None
            if exc.code == "PGRST301":
                raise AppError(401, "unauthorized", "Sessão inválida ou expirada.") from None
            raise AppError(503, "usuarios_unavailable", "Não foi possível acessar os usuários.") from None
        except httpx.HTTPError:
            raise AppError(503, "usuarios_unavailable", "Não foi possível acessar os usuários.") from None

    def list(self, empresa_id: UUID) -> list[dict]:
        query = self.client.table("user_profiles").select(FIELDS)
        query = query.eq("empresa_id", str(empresa_id))
        return self._execute(lambda: query.order("full_name").order("id").execute())

    def get(self, user_id: UUID, empresa_id: UUID) -> dict | None:
        query = self.client.table("user_profiles").select(FIELDS).eq("id", str(user_id))
        query = query.eq("empresa_id", str(empresa_id))
        rows = self._execute(lambda: query.limit(1).execute())
        return rows[0] if rows else None

    def update(self, user_id: UUID, payload: dict, empresa_id: UUID) -> dict | None:
        query = self.client.table("user_profiles").update(payload).eq("id", str(user_id))
        # Recheck target scope and role at write time; RLS also checks both rows.
        query = query.eq("empresa_id", str(empresa_id)).neq("role", "admin")
        rows = self._execute(lambda: query.select(FIELDS).execute())
        return rows[0] if rows else None
