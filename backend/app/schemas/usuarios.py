from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, StrictBool, field_validator, model_validator

from app.schemas.profile import UserProfile, UserRole


class UsuarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    email: EmailStr
    password: SecretStr = Field(min_length=8)
    full_name: str = Field(min_length=1)
    role: UserRole
    empresa_id: UUID

    @field_validator("full_name", "email", mode="before")
    @classmethod
    def normalize_text(cls, value, info):
        if isinstance(value, str):
            value = value.strip()
            if info.field_name == "email":
                value = value.lower()
        return value


class UsuarioResponse(BaseModel):
    user_id: UUID


class UsuarioDetail(UserProfile):
    email: str
    created_at: datetime


class UsuarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: UserRole | None = None
    active: StrictBool | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "UsuarioUpdate":
        if not self.model_fields_set or any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("Informe papel ou situação, sem valores nulos.")
        return self
