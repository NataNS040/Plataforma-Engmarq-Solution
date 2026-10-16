from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Response
from supabase import Client
from app.core.dependencies import CurrentProfile, get_supabase_client
from app.core.errors import AppError
from app.repositories.acidentes import AcidentesRepository
from app.services.acidentes import AcidentesService
from app.schemas.acidentes import (AcidenteCreate, AcidenteUpdate, AnulacaoInput, AcidenteListItem,
                                   AcidenteResponse, ResumoItem)

router = APIRouter(tags=['acidentes'])

def get_service(actor: CurrentProfile, client: Annotated[Client, Depends(get_supabase_client)], request: Request, response: Response):
    if request.query_params:
        raise AppError(422, 'invalid_query', 'Esta operação não aceita parâmetros de consulta.')
    response.headers['Cache-Control'] = 'no-store'
    return AcidentesService(AcidentesRepository(client), actor)

Service = Annotated[AcidentesService, Depends(get_service)]

@router.get('/acidentes', response_model=list[AcidenteListItem])
def list_acidentes(service: Service): return service.list()

# Declared before /acidentes/{id}: the UUID path parameter would otherwise answer 422.
@router.get('/acidentes/resumo', response_model=list[ResumoItem])
def resumo(service: Service): return service.resumo()

@router.get('/colaboradores/{id}/acidentes', response_model=list[AcidenteListItem])
def employee_acidentes(id: UUID, service: Service): return service.list(id)

@router.get('/acidentes/{id}', response_model=AcidenteResponse)
def get_acidente(id: UUID, service: Service): return service.get(id)

@router.post('/acidentes', response_model=AcidenteResponse, status_code=201)
def create(data: AcidenteCreate, service: Service): return service.create(data)

@router.patch('/acidentes/{id}', response_model=AcidenteResponse)
def update(id: UUID, data: AcidenteUpdate, service: Service): return service.update(id, data)

@router.post('/acidentes/{id}/anular', response_model=AcidenteResponse)
def anular(id: UUID, data: AnulacaoInput, service: Service): return service.anular(id, data)
