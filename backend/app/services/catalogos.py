from uuid import UUID

from app.core.errors import AppError
from app.repositories.catalogos import CatalogosRepository
from app.schemas.catalogos import CatalogoCreate, CatalogoUpdate
from app.schemas.profile import MeResponse


class CatalogosService:
    def __init__(self, repository: CatalogosRepository, actor: MeResponse):
        self.repository = repository
        self.actor = actor

    def _authorize(self, write=False) -> UUID:
        roles = {"empresa", "gestor"} if write else {"empresa", "gestor", "operacional"}
        if not self.actor.active or self.actor.role not in roles:
            raise AppError(403, "access_denied", "Sem permissão para acessar catálogos.")
        return self.actor.empresa_id

    def list(self):
        return self.repository.list(self._authorize())

    def create(self, data: CatalogoCreate):
        company = self._authorize(write=True)
        row = self.repository.create(data.model_dump(mode="json") | {"empresa_id": str(company), "active": True})
        if row is None:
            raise AppError(503, "catalogos_unavailable", "Não foi possível confirmar o cadastro.")
        return row

    def update(self, item_id: UUID, data: CatalogoUpdate):
        row = self.repository.update(item_id, self._authorize(write=True), data.model_dump(mode="json", exclude_unset=True))
        if row is None:
            raise AppError(404, "catalogo_not_found", "Catálogo não encontrado ou sem acesso.")
        return row
