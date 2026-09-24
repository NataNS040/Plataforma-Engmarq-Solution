from typing import Literal
from uuid import UUID

from pydantic import BaseModel, StrictBool

UserRole = Literal["admin", "gestor", "operacional", "empresa"]


class UserProfile(BaseModel):
    id: UUID
    full_name: str
    role: UserRole
    empresa_id: UUID
    active: StrictBool


class MeResponse(UserProfile):
    email: str | None = None
