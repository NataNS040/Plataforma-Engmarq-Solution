from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field


class DashboardKpis(BaseModel):
    totalColaboradores: int | None
    totalEmpresas: int
    totalDocumentos: int
    totalTreinamentos: int | None
    docsVencidos: int
    docsVencendo: int
    treinamentosVencidos: int | None
    treinamentosVencendo: int | None
    compliancePct: int = Field(ge=0, le=100)
    operacionalDisponivel: bool


class DashboardAlerta(BaseModel):
    tipo: Literal['documento', 'treinamento']
    empresa_id: UUID
    titulo: str
    nome_envolvido: str | None
    status: Literal['vencido', 'vencendo']
    dias_restantes: int | None
    vencimento: str | None
