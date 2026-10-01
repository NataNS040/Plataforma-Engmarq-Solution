from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

Nome = Annotated[str, Field(min_length=2)]


class CatalogoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    nome: Nome
    descricao: str | None = None


class FuncaoCreate(CatalogoCreate):
    riscos: str | None = None


class CatalogoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    nome: Nome | None = None
    descricao: str | None = None
    active: StrictBool | None = None

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Informe ao menos um campo.")
        for field in ("nome", "active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("Campo obrigatório não pode ser nulo.")
        return self


class FuncaoUpdate(CatalogoUpdate):
    riscos: str | None = None


class CatalogoResponse(BaseModel):
    id: UUID
    empresa_id: UUID
    nome: str
    descricao: str | None
    active: bool


class FuncaoResponse(CatalogoResponse):
    riscos: str | None
