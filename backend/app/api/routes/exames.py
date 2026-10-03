from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Request, Response
from starlette.concurrency import run_in_threadpool
from supabase import Client
from app.core.dependencies import CurrentProfile, get_supabase_client, get_settings
from app.core.errors import AppError
from app.repositories.exames import ExamesRepository
from app.services.exames import ExamesService
from app.schemas.exames import AsoCreate, AsoUpdate, AsoResponse, CatalogoResponse, ArquivoResponse

router = APIRouter(tags=['exames'])

def get_service(actor: CurrentProfile, client: Annotated[Client, Depends(get_supabase_client)], request: Request, response: Response):
    if request.query_params:
        raise AppError(422, 'invalid_query', 'Esta operação não aceita parâmetros de consulta.')
    response.headers['Cache-Control'] = 'no-store'
    return ExamesService(ExamesRepository(client), actor, get_settings(request).supabase_url)

Service = Annotated[ExamesService, Depends(get_service)]

@router.get('/exames/catalogo', response_model=list[CatalogoResponse])
def catalog(service: Service): return service.catalog()

@router.get('/exames', response_model=list[AsoResponse])
def list_asos(service: Service): return service.list()

@router.get('/colaboradores/{id}/exames', response_model=list[AsoResponse])
def employee_asos(id: UUID, service: Service): return service.list(id)

@router.get('/exames/{id}', response_model=AsoResponse)
def get_aso(id: UUID, service: Service): return service.get(id)

@router.post('/exames', response_model=AsoResponse, status_code=201)
def create(data: AsoCreate, service: Service): return service.create(data)

@router.patch('/exames/{id}', response_model=AsoResponse)
def update(id: UUID, data: AsoUpdate, service: Service): return service.update(id, data)

@router.delete('/exames/{id}', status_code=204)
def delete(id: UUID, service: Service): service.delete(id)

@router.get('/exames/{id}/arquivo', response_model=ArquivoResponse)
def file(id: UUID, service: Service): return service.file_url(id)

@router.get('/exames/{id}/download', response_model=ArquivoResponse)
def download(id: UUID, service: Service): return service.file_url(id, True)

@router.post('/exames/{id}/arquivo', response_model=AsoResponse)
async def upload(id: UUID, service: Service, request: Request):
    service.authorize(True)
    if request.headers.get('content-type', '').split(';')[0] != 'application/pdf':
        raise AppError(422, 'invalid_file', 'Envie PDF válido de até 10 MB.')
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > 10485760:
            raise AppError(413, 'file_too_large', 'Arquivo acima de 10 MB.')
        content.extend(chunk)
    return await run_in_threadpool(service.upload, id, bytes(content), 'application/pdf')
