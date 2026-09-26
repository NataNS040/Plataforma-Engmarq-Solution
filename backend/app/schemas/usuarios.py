from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

from app.schemas.profile import UserRole


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
