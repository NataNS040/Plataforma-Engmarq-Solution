from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from supabase import Client

from app.core.dependencies import CurrentProfile, get_supabase_client
from app.repositories.empresas import EmpresasRepository
from app.schemas.empresas import EmpresaCreate, EmpresaResponse, EmpresaUpdate, EmpresaWithCount
from app.schemas.errors import ErrorResponse
from app.services.empresas import EmpresasService

router = APIRouter(prefix="/empresas", tags=["empresas"], responses={
    404: {"model": ErrorResponse}, 409: {"model": ErrorResponse},
})


def get_service(
    actor: CurrentProfile,
    client: Annotated[Client, Depends(get_supabase_client)],
    response: Response,
) -> EmpresasService:
    response.headers["Cache-Control"] = "no-store"
    return EmpresasService(EmpresasRepository(client), actor)


Service = Annotated[EmpresasService, Depends(get_service)]


@router.get("", response_model=list[EmpresaWithCount])
def list_empresas(service: Service):
    return service.list()


@router.get("/{empresa_id}", response_model=EmpresaResponse)
def get_empresa(empresa_id: UUID, service: Service):
    return service.get(empresa_id)


@router.post("", response_model=EmpresaResponse, status_code=201)
def create_empresa(data: EmpresaCreate, service: Service):
    return service.create(data)


@router.patch("/{empresa_id}", response_model=EmpresaResponse)
def update_empresa(empresa_id: UUID, data: EmpresaUpdate, service: Service):
    return service.update(empresa_id, data)
