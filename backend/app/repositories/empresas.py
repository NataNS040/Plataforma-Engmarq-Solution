from collections.abc import Callable
from typing import Any
from uuid import UUID

import httpx
from postgrest.exceptions import APIError
from supabase import Client

from app.core.errors import AppError

FIELDS = "id,razao_social,cnpj,setor,cidade,uf,responsavel,email,telefone,status,logo_url,created_at"


class EmpresasRepository:
    """Uses only the caller's JWT client; RLS applies to every query and join."""

    def __init__(self, client: Client):
        self.client = client

    def _execute(self, operation: Callable[[], Any]) -> list[dict]:
        try:
            return operation().data
        except APIError as exc:
            errors = {
                "23505": (409, "duplicate_empresa", "Já existe uma empresa com este CNPJ."),
                "42501": (403, "access_denied", "Você não tem permissão para esta operação."),
                "23503": (409, "related_records", "Não é possível concluir: há registros relacionados."),
                "PGRST301": (401, "unauthorized", "Sessão expirada. Faça login novamente."),
            }
            status, code, message = errors.get(
                exc.code, (503, "empresas_unavailable", "Não foi possível acessar as empresas.")
            )
            raise AppError(status, code, message) from None
        except httpx.HTTPError:
            raise AppError(503, "empresas_unavailable", "Não foi possível acessar as empresas.") from None

    def list(self, empresa_id: UUID | None) -> list[dict]:
        query = self.client.table("empresas").select(f"{FIELDS},colaboradores(count)")
        if empresa_id is not None:
            query = query.eq("id", str(empresa_id))
        # Same ordering and count relation as the previous frontend query.
        return self._execute(lambda: query.order("razao_social").execute())

    def get(self, empresa_id: UUID) -> dict | None:
        rows = self._execute(lambda: self.client.table("empresas").select(FIELDS)
                             .eq("id", str(empresa_id)).limit(1).execute())
        return rows[0] if rows else None

    def create(self, payload: dict) -> dict | None:
        rows = self._execute(lambda: self.client.table("empresas").insert(payload)
                             .select(FIELDS).execute())
        return rows[0] if rows else None

    def update(self, empresa_id: UUID, payload: dict) -> dict | None:
        rows = self._execute(lambda: self.client.table("empresas").update(payload)
                             .eq("id", str(empresa_id)).select(FIELDS).execute())
        return rows[0] if rows else None
