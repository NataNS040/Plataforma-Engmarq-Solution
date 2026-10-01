from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class TreinamentoCreate(Input):
    colaborador_id: UUID
    treinamento_tipo_id: UUID
    data_realizacao: date
    data_vencimento: date | None = None
    carga_horaria: float | None = Field(default=None, ge=0, le=9999.9, allow_inf_nan=False)
    instrutor: str | None = None
    modalidade: Literal["presencial", "online", "semipresencial"] | None = None
    certificado_url: str | None = None


class TreinamentoUpdate(Input):
    colaborador_id: UUID | None = None
    treinamento_tipo_id: UUID | None = None
    data_realizacao: date | None = None
    data_vencimento: date | None = None
    carga_horaria: float | None = Field(default=None, ge=0, le=9999.9, allow_inf_nan=False)
    instrutor: str | None = None
    modalidade: Literal["presencial", "online", "semipresencial"] | None = None
    certificado_url: str | None = None

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Informe ao menos um campo.")
        for field in ("colaborador_id", "treinamento_tipo_id", "data_realizacao"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("Campo obrigatório não pode ser nulo.")
        return self


class MatrizCreate(Input):
    funcao_id: UUID
    treinamento_tipo_id: UUID
    obrigatorio: StrictBool = True


class MatrizUpdate(Input):
    obrigatorio: StrictBool


class TipoResponse(BaseModel):
    id: UUID
    nome: str
    descricao: str | None
    nr_referencia: str | None
    validade_meses: int | None


class Reference(BaseModel):
    id: UUID
    nome: str


class TreinamentoResponse(TreinamentoCreate):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    empresa_id: UUID
    status: Literal["em_dia", "vencendo", "vencido", "pendente"]
    created_at: str | None
    colaborador: Reference | None
    treinamento_tipo: TipoResponse | None


class MatrizResponse(MatrizCreate):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    empresa_id: UUID
    funcao: Reference | None
    treinamento_tipo: TipoResponse | None
