from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.core.config import Settings
from app.core.dependencies import CurrentProfile, get_settings
from app.schemas.usuarios import UsuarioCreate, UsuarioResponse
from app.services.usuarios_service import create_usuario

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
