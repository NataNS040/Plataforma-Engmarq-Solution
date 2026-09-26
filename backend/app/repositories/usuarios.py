from uuid import UUID

from supabase import Client

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

    def create_profile(self, user_id: UUID, data: UsuarioCreate) -> None:
        self.client.table("user_profiles").insert({
            "id": str(user_id), "email": str(data.email),
            "full_name": data.full_name, "role": data.role,
            "empresa_id": str(data.empresa_id), "active": True,
        }).execute()

    def delete_auth(self, user_id: UUID) -> None:
        # FK user_profiles.id ON DELETE CASCADE also cleans up an insert whose
        # response was lost after the database committed it.
        self.client.auth.admin.delete_user(str(user_id))
