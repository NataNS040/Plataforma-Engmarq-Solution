from uuid import UUID

from app.core.errors import AppError
from app.repositories.colaboradores import ColaboradoresRepository
from app.schemas.colaboradores import ColaboradorCreate, ColaboradorResponse, ColaboradorUpdate
from app.schemas.profile import MeResponse


class ColaboradoresService:
    def __init__(self, repository: ColaboradoresRepository, actor: MeResponse):
        self.repository = repository
        self.actor = actor

    def _authorize(self, *, write: bool = False) -> UUID:
        roles = {"empresa", "gestor"} if write else {"empresa", "gestor", "operacional"}
        if not self.actor.active or self.actor.role not in roles:
            raise AppError(403, "access_denied", "Sem permissão para acessar colaboradores.")
        return self.actor.empresa_id

    def _response(self, row: dict | None) -> ColaboradorResponse:
        if row is None:
            raise AppError(404, "colaborador_not_found", "Colaborador não encontrado ou sem acesso.")
        return ColaboradorResponse.model_validate(row)

    def _validate_catalogs(self, values: dict, empresa_id: UUID) -> None:
        for field, table in (("funcao_id", "funcoes"), ("setor_id", "setores"), ("ambiente_id", "ambientes")):
            catalog_id = values.get(field)
            if catalog_id is not None and not self.repository.catalog_exists(table, UUID(str(catalog_id)), empresa_id):
                raise AppError(422, "invalid_catalog", "Função, setor ou ambiente inválido para esta empresa.")

    def list(self) -> list[ColaboradorResponse]:
        return [self._response(row) for row in self.repository.list(self._authorize())]

    def get(self, colaborador_id: UUID) -> ColaboradorResponse:
        return self._response(self.repository.get(colaborador_id, self._authorize()))

    def create(self, data: ColaboradorCreate) -> ColaboradorResponse:
        empresa_id = self._authorize(write=True)
        payload = data.model_dump(mode="json")
        self._validate_catalogs(payload, empresa_id)
        return self._response(self.repository.create({**payload, "empresa_id": str(empresa_id), "active": True}))

    def update(self, colaborador_id: UUID, data: ColaboradorUpdate) -> ColaboradorResponse:
        empresa_id = self._authorize(write=True)
        current = self._response(self.repository.get(colaborador_id, empresa_id))
        payload = data.model_dump(mode="json", exclude_unset=True)
        # Revalidate all resulting references, not just the changed select box.
        self._validate_catalogs(current.model_dump(mode="json") | payload, empresa_id)
        return self._response(self.repository.update(colaborador_id, empresa_id, payload))
