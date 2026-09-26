from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from supabase import Client

from app.core.config import Settings
from app.core.dependencies import CurrentProfile, get_settings, get_supabase_client
from app.repositories.usuarios import UsuariosRlsRepository
from app.schemas.usuarios import UsuarioCreate, UsuarioResponse, UsuarioDetail, UsuarioUpdate
from app.services.usuarios_service import create_usuario, UsuariosService

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.post("", response_model=UsuarioResponse, status_code=201)
def create(
    data: UsuarioCreate,
    actor: CurrentProfile,
    settings: Annotated[Settings, Depends(get_settings)],
    response: Response,
) -> UsuarioResponse:
    response.headers["Cache-Control"] = "no-store"
    return create_usuario(data, actor, settings)


def get_service(
    actor: CurrentProfile,
    client: Annotated[Client, Depends(get_supabase_client)],
    response: Response,
) -> UsuariosService:
    response.headers["Cache-Control"] = "no-store"
    return UsuariosService(UsuariosRlsRepository(client), actor)


Service = Annotated[UsuariosService, Depends(get_service)]


@router.get("", response_model=list[UsuarioDetail])
def list_usuarios(service: Service, empresa_id: UUID | None = None):
    return service.list(empresa_id)


@router.get("/{user_id}", response_model=UsuarioDetail)
def get_usuario(user_id: UUID, service: Service):
    return service.get(user_id)


@router.patch("/{user_id}", response_model=UsuarioDetail)
def update_usuario(user_id: UUID, data: UsuarioUpdate, service: Service):
    return service.update(user_id, data)
