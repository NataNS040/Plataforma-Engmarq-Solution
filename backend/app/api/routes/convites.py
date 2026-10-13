from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.core.config import Settings
from app.core.dependencies import CurrentProfile, CurrentUser, get_settings
from app.schemas.convites import ConviteCreate, ConviteResponse, ConviteDetail, ConviteAccepted
from app.services.convites import create_invitation, invitation_operation

router = APIRouter(prefix="/convites", tags=["convites"])
Config = Annotated[Settings, Depends(get_settings)]


@router.post("", response_model=ConviteResponse, status_code=201)
def create(data: ConviteCreate, actor: CurrentProfile, settings: Config, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return create_invitation(data, actor, settings)


@router.get("", response_model=list[ConviteDetail])
def list_invites(actor: CurrentProfile, settings: Config, response: Response, empresa_id: UUID | None = None):
    response.headers["Cache-Control"] = "no-store"
    return invitation_operation("list", actor, settings, company=empresa_id)


@router.post("/{invitation_id}/cancelar", status_code=204)
def cancel(invitation_id: UUID, actor: CurrentProfile, settings: Config):
    invitation_operation("cancel", actor, settings, invitation=invitation_id)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.post("/{invitation_id}/aceitar", response_model=ConviteAccepted)
def accept(invitation_id: UUID, actor: CurrentUser, settings: Config, response: Response):
    response.headers["Cache-Control"] = "no-store"
    company = invitation_operation("accept", actor, settings, invitation=invitation_id)
    return ConviteAccepted(empresa_id=company)
