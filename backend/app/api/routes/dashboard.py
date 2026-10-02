from typing import Annotated, Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, Response
from supabase import Client
from app.core.dependencies import CurrentProfile, get_supabase_client
from app.core.errors import AppError
from app.repositories.dashboard import DashboardRepository
from app.schemas.dashboard import DashboardAlerta, DashboardKpis
from app.services.dashboard import DashboardService

router = APIRouter(prefix='/dashboard', tags=['dashboard'])
Scope = UUID | Literal['all'] | None


def get_service(actor: CurrentProfile, client: Annotated[Client, Depends(get_supabase_client)], response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return DashboardService(DashboardRepository(client), actor)


Service = Annotated[DashboardService, Depends(get_service)]


def validate_query(request, allowed):
    if any(key not in allowed or len(request.query_params.getlist(key)) != 1 for key in request.query_params):
        raise AppError(422, 'invalid_query', 'Parâmetros de consulta inválidos.')


@router.get('/kpis', response_model=DashboardKpis)
def kpis(request: Request, service: Service, scope: Scope = None):
    validate_query(request, {'scope'})
    return service.kpis(scope)


@router.get('/alertas', response_model=list[DashboardAlerta])
def alerts(request: Request, service: Service, scope: Scope = None, limit: Annotated[int, Query(ge=1, le=50)] = 5):
    validate_query(request, {'scope', 'limit'})
    return service.alerts(scope, limit)
