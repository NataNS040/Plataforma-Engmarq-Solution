from postgrest.exceptions import APIError
import httpx

from app.core.errors import AppError

FIELDS = {
    "treinamentos": "*,colaborador:colaboradores(id,nome),treinamento_tipo:treinamento_tipos(*)",
    "matriz_treinamentos": "*,funcao:funcoes(id,nome),treinamento_tipo:treinamento_tipos(*)",
    "treinamento_tipos": "*",
}


class TreinamentosRepository:
    def __init__(self, client):
        self.client = client

    def execute(self, query):
        try:
            return query.execute().data
        except APIError as exc:
            status = {"23505": 409, "23503": 422, "23514": 422, "42501": 403,
                      "PGRST301": 401, "40001": 409, "40P01": 409}.get(exc.code, 503)
            raise AppError(status, "treinamento_error", {
                409: "Registro duplicado ou alterado simultaneamente.",
                422: "Referência ou dados inválidos para esta empresa.",
                403: "Sem permissão para esta operação.", 401: "Sessão inválida.",
                503: "Não foi possível acessar os treinamentos.",
            }[status]) from None
        except httpx.HTTPError:
            raise AppError(503, "treinamentos_unavailable", "Não foi possível acessar os treinamentos.") from None

    def list(self, table, company, employee=None):
        query = self.client.table(table).select(FIELDS[table])
        if table != "treinamento_tipos":
            query = query.eq("empresa_id", str(company))
        if employee:
            query = query.eq("colaborador_id", str(employee))
        if table == "treinamentos":
            query = query.order("data_vencimento", nullsfirst=False)
        elif table == "treinamento_tipos":
            query = query.order("nome")
        return self.execute(query.order("id"))

    def get(self, table, item, company):
        rows = self.execute(self.client.table(table).select(FIELDS[table]).eq("id", str(item))
                            .eq("empresa_id", str(company)).limit(1))
        return rows[0] if rows else None

    def exists(self, table, item, company=None):
        query = self.client.table(table).select("id").eq("id", str(item))
        if company:
            query = query.eq("empresa_id", str(company))
        return bool(self.execute(query.limit(1)))

    def create(self, table, payload):
        rows = self.execute(self.client.table(table).insert(payload).select(FIELDS[table]))
        return rows[0] if rows else None

    def update(self, table, item, company, payload):
        rows = self.execute(self.client.table(table).update(payload).eq("id", str(item))
                            .eq("empresa_id", str(company)).select(FIELDS[table]))
        return rows[0] if rows else None

    def delete_requirement(self, item, company):
        return self.execute(self.client.table("matriz_treinamentos").delete()
                            .eq("id", str(item)).eq("empresa_id", str(company)))
