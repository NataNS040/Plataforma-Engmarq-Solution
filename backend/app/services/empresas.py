import re
from uuid import UUID

from app.core.entitlements import require_feature
from app.core.errors import AppError
from app.repositories.empresas import EmpresasRepository
from app.schemas.empresas import EmpresaCreate, EmpresaResponse, EmpresaUpdate, EmpresaWithCount
from app.schemas.profile import MeResponse


class EmpresasService:
    def __init__(self, repository: EmpresasRepository, actor: MeResponse):
        self.repository = repository
        self.actor = actor

    def _require_admin(self) -> None:
        if self.actor.role != "admin":
            raise AppError(403, "access_denied", "Esta operação exige um administrador.")

    def _require_scope(self, empresa_id: UUID) -> None:
        if self.actor.role != "admin" and empresa_id != self.actor.empresa_id:
            raise AppError(403, "access_denied", "Você não tem acesso a esta empresa.")

    def _response(self, row: dict | None) -> EmpresaResponse:
        if row is None:
            raise AppError(404, "empresa_not_found", "Empresa não encontrada ou sem acesso.")
        return EmpresaResponse.model_validate(row)

    def list(self) -> list[EmpresaWithCount]:
        scope = None if self.actor.role == "admin" else self.actor.empresa_id
        rows = self.repository.list(scope)
        return [EmpresaWithCount.model_validate({
            **row,
            "colaboradores_count": (row.get("colaboradores") or [{"count": 0}])[0]["count"],
        }) for row in rows]

    def get(self, empresa_id: UUID) -> EmpresaResponse:
        self._require_scope(empresa_id)
        return self._response(self.repository.get(empresa_id))

    def create(self, data: EmpresaCreate) -> EmpresaResponse:
        self._require_admin()
        if data.logo_url is not None:
            raise AppError(403, "access_denied", "Logos são gerenciados pela própria empresa.")
        return self._response(self.repository.create(data.model_dump(mode="json")))

    def update(self, empresa_id: UUID, data: EmpresaUpdate) -> EmpresaResponse:
        self._require_scope(empresa_id)
        if self.actor.role not in {"admin", "gestor", "empresa"}:
            raise AppError(403, "access_denied", "Você não tem permissão para editar empresas.")
        if self.actor.role != 'admin':
            require_feature(self.repository.client, self.actor, 'empresa.cadastro')
        if "status" in data.model_fields_set:
            self._require_admin()
        if "logo_url" in data.model_fields_set:
            if self.actor.role not in {"gestor", "empresa"} or empresa_id != self.actor.empresa_id:
                raise AppError(403, "access_denied", "Logos são gerenciados pela própria empresa.")
            if data.logo_url is not None and not re.fullmatch(
                rf"logos/{empresa_id}/logo\.(png|jpg|webp)", data.logo_url,
            ):
                raise AppError(422, "invalid_logo_reference", "Referência de logo inválida para esta empresa.")
        # Suspension is an update, never a DELETE: preserve related records.
        return self._response(self.repository.update(
            empresa_id, data.model_dump(mode="json", exclude_unset=True),
        ))
