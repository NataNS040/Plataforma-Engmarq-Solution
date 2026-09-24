from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

EmpresaStatus = Literal["ativa", "pendente", "suspensa"]
RazaoSocial = Annotated[str, Field(min_length=2)]
Cnpj = Annotated[str, Field(pattern=r"^[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}$")]


class EmpresaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    razao_social: RazaoSocial
    cnpj: Cnpj
    setor: str | None = None
    cidade: str | None = None
    uf: Annotated[str, Field(min_length=2, max_length=2)] | None = None
    responsavel: str | None = None
    email: str | None = None
    telefone: str | None = None
    status: EmpresaStatus = "ativa"
    logo_url: str | None = None


class EmpresaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    razao_social: RazaoSocial | None = None
    cnpj: Cnpj | None = None
    setor: str | None = None
    cidade: str | None = None
    uf: Annotated[str, Field(min_length=2, max_length=2)] | None = None
    responsavel: str | None = None
    email: str | None = None
    telefone: str | None = None
    status: EmpresaStatus | None = None
    logo_url: str | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "EmpresaUpdate":
        if not self.model_fields_set:
            raise ValueError("Informe ao menos um campo.")
        for name in ("razao_social", "cnpj", "status"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError("Campo obrigatório não pode ser nulo.")
        return self


class EmpresaResponse(BaseModel):
    # Existing records are returned without imposing new input formats on legacy data.
    id: UUID
    razao_social: str
    cnpj: str
    setor: str | None
    cidade: str | None
    uf: str | None
    responsavel: str | None
    email: str | None
    telefone: str | None
    status: EmpresaStatus
    logo_url: str | None
    created_at: datetime


class EmpresaWithCount(EmpresaResponse):
    colaboradores_count: int = Field(ge=0)
