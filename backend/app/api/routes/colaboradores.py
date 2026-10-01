from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from supabase import Client

from app.core.dependencies import CurrentProfile, get_supabase_client
from app.core.errors import AppError
from app.repositories.colaboradores import ColaboradoresRepository
from app.schemas.colaboradores import ColaboradorCreate, ColaboradorResponse, ColaboradorUpdate
from app.services.colaboradores import ColaboradoresService

router = APIRouter(prefix="/colaboradores", tags=["colaboradores"])


def get_service(actor: CurrentProfile, client: Annotated[Client, Depends(get_supabase_client)],
                request: Request, response: Response) -> ColaboradoresService:
    # No tenant selector (or hidden filter contract) on any of these endpoints.
    if request.query_params:
        raise AppError(422, "invalid_query", "Esta operação não aceita parâmetros de consulta.")
    response.headers["Cache-Control"] = "no-store"
    return ColaboradoresService(ColaboradoresRepository(client), actor)


Service = Annotated[ColaboradoresService, Depends(get_service)]


@router.get("", response_model=list[ColaboradorResponse])
def list_colaboradores(service: Service):
    return service.list()


@router.get("/{id}", response_model=ColaboradorResponse)
def get_colaborador(id: UUID, service: Service):
    return service.get(id)


@router.post("", response_model=ColaboradorResponse, status_code=201)
def create_colaborador(data: ColaboradorCreate, service: Service):
    return service.create(data)


@router.patch("/{id}", response_model=ColaboradorResponse)
def update_colaborador(id: UUID, data: ColaboradorUpdate, service: Service):
    return service.update(id, data)
