from datetime import date, time
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

Tipo = Literal['tipico', 'doenca', 'trajeto']
Gravidade = Literal['sem_lesao', 'leve', 'moderada', 'grave', 'fatal']
PiramideBird = Literal['lesao_grave', 'lesao_leve', 'dano_material', 'quase_acidente']
Status = Literal['aberto', 'em_investigacao', 'concluido']
# eSocial S-1.3 codes; existence is enforced by the database FK to esocial_codigos.
Codigo = Annotated[str, Field(pattern=r'^[0-9]{9}$')]

REQUIRED = ('colaborador_id', 'tipo', 'data_acidente', 'gravidade', 'houve_afastamento', 'houve_obito',
            'comunicado_policia', 'emitir_cat', 'status')


class AcidenteCreate(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)
    colaborador_id: UUID
    tipo: Tipo
    data_acidente: date
    hora_acidente: time | None = None
    minutos_trabalhados_antes: int | None = Field(default=None, ge=0, le=5999)
    local_tipo: Literal[1, 2, 3, 4, 5, 6, 9] | None = None
    local_descricao: str | None = Field(default=None, min_length=1, max_length=255)
    codigo_parte_atingida: Codigo | None = None
    lateralidade: Literal[0, 1, 2, 3] | None = None
    agente_tabela: Literal[14, 15] | None = None
    codigo_agente_causador: Codigo | None = None
    codigo_situacao_geradora: Codigo | None = None
    codigo_natureza_lesao: Codigo | None = None
    descricao_lesao: str | None = Field(default=None, min_length=1, max_length=200)
    gravidade: Gravidade
    piramide_bird: PiramideBird | None = None
    houve_afastamento: bool = False
    ultimo_dia_trabalhado: date | None = None
    data_retorno: date | None = None
    dias_perdidos: int | None = Field(default=None, ge=0, le=36500)
    houve_obito: bool = False
    data_obito: date | None = None
    comunicado_policia: bool = False
    emitir_cat: bool = False
    numero_recibo_cat: str | None = Field(default=None, pattern=r'^[0-9.]{1,23}$')
    status: Status = 'aberto'
    detalhes: str | None = Field(default=None, min_length=1, max_length=4000)


class AcidenteUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)
    colaborador_id: UUID | None = None
    tipo: Tipo | None = None
    data_acidente: date | None = None
    hora_acidente: time | None = None
    minutos_trabalhados_antes: int | None = Field(default=None, ge=0, le=5999)
    local_tipo: Literal[1, 2, 3, 4, 5, 6, 9] | None = None
    local_descricao: str | None = Field(default=None, min_length=1, max_length=255)
    codigo_parte_atingida: Codigo | None = None
    lateralidade: Literal[0, 1, 2, 3] | None = None
    agente_tabela: Literal[14, 15] | None = None
    codigo_agente_causador: Codigo | None = None
    codigo_situacao_geradora: Codigo | None = None
    codigo_natureza_lesao: Codigo | None = None
    descricao_lesao: str | None = Field(default=None, min_length=1, max_length=200)
    gravidade: Gravidade | None = None
    piramide_bird: PiramideBird | None = None
    houve_afastamento: bool | None = None
    ultimo_dia_trabalhado: date | None = None
    data_retorno: date | None = None
    dias_perdidos: int | None = Field(default=None, ge=0, le=36500)
    houve_obito: bool | None = None
    data_obito: date | None = None
    comunicado_policia: bool | None = None
    emitir_cat: bool | None = None
    numero_recibo_cat: str | None = Field(default=None, pattern=r'^[0-9.]{1,23}$')
    status: Status | None = None
    detalhes: str | None = Field(default=None, min_length=1, max_length=4000)

    @model_validator(mode='after')
    def patch(self):
        if not self.model_fields_set:
            raise ValueError('Informe ao menos um campo.')
        for field in REQUIRED:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError('Campo obrigatório não pode ser nulo.')
        return self


class AnulacaoInput(BaseModel):
    model_config = ConfigDict(extra='forbid', hide_input_in_errors=True)
    motivo: str = Field(min_length=3, max_length=500)


class AcidenteListItem(BaseModel):
    """Compact row for the list: codes only (descriptions resolved client-side), no long text."""
    model_config = ConfigDict(extra='ignore')
    id: UUID
    colaborador_id: UUID
    tipo: Tipo
    data_acidente: date
    gravidade: Gravidade
    piramide_bird: PiramideBird | None
    status: Status
    houve_afastamento: bool
    dias_perdidos: int | None
    emitir_cat: bool
    codigo_parte_atingida: str | None
    codigo_natureza_lesao: str | None
    agente_tabela: int | None
    codigo_agente_causador: str | None
    anulado_em: str | None
    colaborador: dict | None


class AcidenteResponse(AcidenteListItem):
    empresa_id: UUID
    hora_acidente: time | None
    minutos_trabalhados_antes: int | None
    local_tipo: int | None
    local_descricao: str | None
    lateralidade: int | None
    codigo_situacao_geradora: str | None
    descricao_lesao: str | None
    ultimo_dia_trabalhado: date | None
    data_retorno: date | None
    houve_obito: bool
    data_obito: date | None
    comunicado_policia: bool
    numero_recibo_cat: str | None
    detalhes: str | None
    criado_por: UUID
    created_at: str
    atualizado_em: str | None
    anulado_por: UUID | None
    motivo_anulacao: str | None


class ResumoItem(BaseModel):
    model_config = ConfigDict(extra='ignore')
    mes: date
    tipo: Tipo
    gravidade: Gravidade
    piramide_bird: PiramideBird | None
    houve_afastamento: bool
    emitir_cat: bool
    total: int
    dias_perdidos: int
