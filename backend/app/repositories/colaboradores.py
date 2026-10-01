from collections.abc import Callable
from typing import Any, Literal
from uuid import UUID

import httpx
from postgrest.exceptions import APIError
from supabase import Client

from app.core.errors import AppError

FIELDS = (
    "id,empresa_id,nome,cpf,matricula,funcao_id,setor_id,ambiente_id,"
    "data_admissao,data_demissao,active,created_at,"
    "funcao:funcoes(id,nome),setor:setores(id,nome),ambiente:ambientes(id,nome)"
)


class ColaboradoresRepository:
    """Only the caller's JWT; every employee and catalog lookup is tenant scoped."""

    def __init__(self, client: Client):
        self.client = client

    def _execute(self, operation: Callable[[], Any]) -> list[dict]:
        try:
            return operation().data
        except APIError as exc:
            errors = {
                "23505": (409, "colaborador_conflict", "Já existe um colaborador com este CPF na empresa."),
                "23503": (422, "invalid_catalog", "Função, setor ou ambiente inválido para esta empresa."),
                "23514": (422, "invalid_colaborador", "Os dados não atendem às regras do colaborador."),
                "42501": (403, "access_denied", "Sem permissão para esta operação."),
                "PGRST301": (401, "unauthorized", "Sessão inválida ou expirada."),
                "40P01": (409, "colaborador_conflict", "Dados alterados simultaneamente. Atualize a consulta."),
                "40001": (409, "colaborador_conflict", "Dados alterados simultaneamente. Atualize a consulta."),
            }
            status, code, message = errors.get(exc.code, (
                503, "colaboradores_unavailable", "Não foi possível acessar os colaboradores.",
            ))
            raise AppError(status, code, message) from None
        except httpx.HTTPError:
            raise AppError(503, "colaboradores_unavailable", "Não foi possível acessar os colaboradores.") from None

    def list(self, empresa_id: UUID) -> list[dict]:
        return self._execute(lambda: self.client.table("colaboradores").select(FIELDS)
                             .eq("empresa_id", str(empresa_id)).eq("active", True)
                             .order("nome").order("id").execute())

    def get(self, colaborador_id: UUID, empresa_id: UUID) -> dict | None:
        rows = self._execute(lambda: self.client.table("colaboradores").select(FIELDS)
                             .eq("id", str(colaborador_id)).eq("empresa_id", str(empresa_id))
                             .limit(1).execute())
        return rows[0] if rows else None

    def catalog_exists(self, table: Literal["funcoes", "setores", "ambientes"],
                       catalog_id: UUID, empresa_id: UUID) -> bool:
        return bool(self._execute(lambda: self.client.table(table).select("id")
                                 .eq("id", str(catalog_id)).eq("empresa_id", str(empresa_id))
                                 .limit(1).execute()))

    def create(self, payload: dict) -> dict | None:
        rows = self._execute(lambda: self.client.table("colaboradores").insert(payload)
                             .select(FIELDS).execute())
        return rows[0] if rows else None

    def update(self, colaborador_id: UUID, empresa_id: UUID, payload: dict) -> dict | None:
        rows = self._execute(lambda: self.client.table("colaboradores").update(payload)
                             .eq("id", str(colaborador_id)).eq("empresa_id", str(empresa_id))
                             .select(FIELDS).execute())
        return rows[0] if rows else None
