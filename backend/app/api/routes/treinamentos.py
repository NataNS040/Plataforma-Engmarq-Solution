from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from supabase import Client

from app.core.dependencies import CurrentProfile, get_supabase_client
from app.core.errors import AppError
from app.repositories.treinamentos import TreinamentosRepository
from app.services.treinamentos import TreinamentosService
from app.schemas.treinamentos import (TreinamentoCreate, TreinamentoUpdate, TreinamentoResponse,
                                      MatrizCreate, MatrizUpdate, MatrizResponse, TipoResponse)

router = APIRouter(tags=["treinamentos"])


def get_service(actor: CurrentProfile, client: Annotated[Client, Depends(get_supabase_client)],
                request: Request, response: Response):
    if request.query_params:
        raise AppError(422, "invalid_query", "Esta operação não aceita parâmetros de consulta.")
    response.headers["Cache-Control"] = "no-store"
    return TreinamentosService(TreinamentosRepository(client), actor)


Service = Annotated[TreinamentosService, Depends(get_service)]


@router.get("/treinamento-tipos", response_model=list[TipoResponse])
def list_types(service: Service):
    return service.list("treinamento_tipos")


@router.get("/matriz-treinamentos", response_model=list[MatrizResponse])
def list_requirements(service: Service):
    return service.list("matriz_treinamentos")


@router.post("/matriz-treinamentos", response_model=MatrizResponse, status_code=201)
def create_requirement(data: MatrizCreate, service: Service):
    return service.create("matriz_treinamentos", data)


@router.patch("/matriz-treinamentos/{id}", response_model=MatrizResponse)
def update_requirement(id: UUID, data: MatrizUpdate, service: Service):
    return service.update("matriz_treinamentos", id, data)


@router.delete("/matriz-treinamentos/{id}", status_code=204)
def delete_requirement(id: UUID, service: Service):
    # Configuration only: no historical training record references this row.
    service.delete_requirement(id)


@router.get("/treinamentos", response_model=list[TreinamentoResponse])
def list_trainings(service: Service):
    return service.list("treinamentos")


@router.get("/colaboradores/{id}/treinamentos", response_model=list[TreinamentoResponse])
def list_employee_trainings(id: UUID, service: Service):
    return service.list("treinamentos", id)


@router.get("/treinamentos/{id}", response_model=TreinamentoResponse)
def get_training(id: UUID, service: Service):
    return service.get(id)


@router.post("/treinamentos", response_model=TreinamentoResponse, status_code=201)
def create_training(data: TreinamentoCreate, service: Service):
    return service.create("treinamentos", data)


@router.patch("/treinamentos/{id}", response_model=TreinamentoResponse)
def update_training(id: UUID, data: TreinamentoUpdate, service: Service):
    return service.update("treinamentos", id, data)
