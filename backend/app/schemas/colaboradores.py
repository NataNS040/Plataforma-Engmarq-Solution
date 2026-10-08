from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

Nome = Annotated[str, Field(min_length=2)]


class ColaboradorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    nome: Nome
    # Preserve formatted and unformatted legacy CPFs; no data normalization here.
    cpf: Annotated[str, Field(min_length=11, max_length=14)]
    matricula: str | None = None
    funcao_id: UUID
    setor_id: UUID
    ambiente_id: UUID | None = None
    data_admissao: date


class ColaboradorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    nome: Nome | None = None
    matricula: str | None = None
    funcao_id: UUID | None = None
    setor_id: UUID | None = None
    ambiente_id: UUID | None = None
    active: StrictBool | None = None
    data_demissao: date | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "ColaboradorUpdate":
        fields = self.model_fields_set
        if not fields:
            raise ValueError("Informe ao menos um campo.")
        for name in ("nome", "funcao_id", "setor_id"):
            if name in fields and getattr(self, name) is None:
                raise ValueError("Campo obrigatório não pode ser nulo.")
        if fields & {"active", "data_demissao"}:
            if not {"active", "data_demissao"} <= fields or self.active is None or (self.active and self.data_demissao is not None) or (not self.active and self.data_demissao is None):
                raise ValueError("Transição exige active e data_demissao juntos; reativação exige data nula.")
        return self


class CatalogoResumo(BaseModel):
    id: UUID
    nome: str


class ColaboradorResponse(BaseModel):
    id: UUID
    empresa_id: UUID
    nome: str
    cpf: str
    matricula: str | None
    funcao_id: UUID
    setor_id: UUID
    ambiente_id: UUID | None
    data_admissao: date
    data_demissao: date | None
    active: bool
    created_at: datetime | None
    funcao: CatalogoResumo | None
    setor: CatalogoResumo | None
    ambiente: CatalogoResumo | None
