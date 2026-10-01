from collections.abc import Callable
from typing import Any, Literal
from uuid import UUID

import httpx
from postgrest.exceptions import APIError
from supabase import Client

from app.core.errors import AppError

Catalogo = Literal["funcoes", "setores", "ambientes"]


class CatalogosRepository:
    """Closed catalog set; caller JWT only, with explicit tenant filters."""

    def __init__(self, client: Client, table: Catalogo):
        if table not in ("funcoes", "setores", "ambientes"):
            raise ValueError("Catálogo inválido")
        self.client = client
        self.table = table
        self.fields = "id,empresa_id,nome,descricao,active" + (",riscos" if table == "funcoes" else "")

    def _execute(self, operation: Callable[[], Any]) -> list[dict]:
        try:
            return operation().data
        except APIError as exc:
            errors = {
                "23505": (409, "catalogo_conflict", "Já existe um item com este nome na empresa, inclusive entre os inativos."),
                "23503": (409, "catalogo_referenced", "O catálogo possui referências que devem ser preservadas."),
                "23514": (422, "invalid_catalogo", "Dados do catálogo inválidos."),
                "42501": (403, "access_denied", "Sem permissão para esta operação."),
                "PGRST301": (401, "unauthorized", "Sessão inválida ou expirada."),
                "40001": (409, "catalogo_conflict", "Dados alterados simultaneamente. Atualize a consulta."),
                "40P01": (409, "catalogo_conflict", "Dados alterados simultaneamente. Atualize a consulta."),
            }
            status, code, message = errors.get(exc.code, (503, "catalogos_unavailable", "Não foi possível acessar os catálogos."))
            raise AppError(status, code, message) from None
        except httpx.HTTPError:
            raise AppError(503, "catalogos_unavailable", "Não foi possível acessar os catálogos.") from None

    def list(self, empresa_id: UUID) -> list[dict]:
        # Include inactive records: existing consumers retain historical references.
        return self._execute(lambda: self.client.table(self.table).select(self.fields)
                             .eq("empresa_id", str(empresa_id)).order("nome").order("id").execute())

    def create(self, payload: dict) -> dict | None:
        rows = self._execute(lambda: self.client.table(self.table).insert(payload).select(self.fields).execute())
        return rows[0] if rows else None

    def update(self, item_id: UUID, empresa_id: UUID, payload: dict) -> dict | None:
        rows = self._execute(lambda: self.client.table(self.table).update(payload)
                             .eq("id", str(item_id)).eq("empresa_id", str(empresa_id)).select(self.fields).execute())
        return rows[0] if rows else None
