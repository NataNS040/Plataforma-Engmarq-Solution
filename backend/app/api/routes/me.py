from fastapi import APIRouter, Response

from app.core.dependencies import CurrentProfile
from app.schemas.profile import MeResponse

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=MeResponse)
def me(profile: CurrentProfile, response: Response) -> MeResponse:
    """Return only the verified caller's active platform profile."""
    response.headers["Cache-Control"] = "no-store"
    return profile
