from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ConviteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    role: Literal["gestor", "operacional"] = "operacional"
    empresa_id: UUID | None = None

    @field_validator("email", "full_name", mode="before")
    @classmethod
    def normalize(cls, value, info):
        if isinstance(value, str):
            value = value.strip()
            return value.lower() if info.field_name == "email" else value
        return value


class ConviteResponse(BaseModel):
    invitation_id: UUID


class ConviteDetail(BaseModel):
    id: UUID
    email: str
    full_name: str
    invited_role: Literal["gestor", "operacional"]
    state: Literal["pending", "expired", "accepted", "cancelled", "failed"]
    expires_at: datetime
    user_id: UUID | None = None


class ConviteAccepted(BaseModel):
    empresa_id: UUID
