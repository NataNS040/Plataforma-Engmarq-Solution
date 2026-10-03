from datetime import date
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

Subtipo = Literal['admissional', 'periodico', 'retorno_trabalho', 'mudanca_risco', 'demissional']
Resultado = Literal['apto', 'apto_com_restricao', 'inapto']

class AsoCreate(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)
    colaborador_id: UUID
    titulo: str = Field(min_length=2, max_length=300)
    subtipo_exame: Subtipo
    emissao: date | None = None
    vencimento: date | None = None
    numero: str | None = Field(default=None, max_length=100)
    observacoes: str | None = Field(default=None, max_length=5000)
    resultado_aso: Resultado | None = None
    exames_realizados: list[str] = Field(default_factory=list, max_length=200)

class AsoUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)
    colaborador_id: UUID | None = None
    titulo: str | None = Field(default=None, min_length=2, max_length=300)
    subtipo_exame: Subtipo | None = None
    emissao: date | None = None
    vencimento: date | None = None
    numero: str | None = Field(default=None, max_length=100)
    observacoes: str | None = Field(default=None, max_length=5000)
    resultado_aso: Resultado | None = None
    exames_realizados: list[str] | None = Field(default=None, max_length=200)

    @model_validator(mode='after')
    def patch(self):
        if not self.model_fields_set:
            raise ValueError('Informe ao menos um campo.')
        for f in ('colaborador_id', 'titulo', 'subtipo_exame', 'exames_realizados'):
            if f in self.model_fields_set and getattr(self, f) is None:
                raise ValueError('Campo obrigatório não pode ser nulo.')
        return self

class AsoResponse(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: UUID
    empresa_id: UUID
    tipo_id: UUID
    colaborador_id: UUID | None
    titulo: str
    subtipo_exame: Subtipo | None
    emissao: date | None
    vencimento: date | None
    numero: str | None
    observacoes: str | None
    resultado_aso: Resultado | None
    exames_realizados: list[str] | None
    arquivo_path: str | None
    arquivo_url: str | None
    created_at: str | None
    status: Literal['vigente', 'vencendo', 'vencido']
    tipo: dict | None
    colaborador: dict | None

class CatalogoResponse(BaseModel):
    id: int
    nome: str
    ordem: int

class ArquivoResponse(BaseModel):
    url: str
    expires_in: int = 60
