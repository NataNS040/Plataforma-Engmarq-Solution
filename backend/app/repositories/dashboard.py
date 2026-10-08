import httpx
from postgrest.exceptions import APIError
from app.core.entitlements import database_error
from app.core.errors import AppError


class DashboardRepository:
    """Caller JWT only. Exact counts avoid the PostgREST row-return limit."""

    def __init__(self, client):
        self.client = client

    def execute(self, query):
        try:
            return query.execute()
        except APIError as exc:
            database_error(exc)
            status = {'42501': 403, 'PGRST301': 401}.get(exc.code, 503)
            raise AppError(status, 'dashboard_unavailable', 'Não foi possível carregar o dashboard.') from None
        except httpx.HTTPError:
            raise AppError(503, 'dashboard_unavailable', 'Não foi possível carregar o dashboard.') from None

    def count(self, table, company=None, status=None, active=False):
        live_docs = table == 'documentos' and status is not None
        query = self.client.table('vw_dashboard_documentos' if live_docs else table).select(
            'empresa_id' if live_docs else 'id', count='exact', head=True)
        if company is not None:
            query = query.eq('empresa_id', str(company))
        if status is not None:
            query = query.eq('status_calculado' if live_docs else 'status', status)
        if active:
            query = query.eq('active', True)
        count = self.execute(query).count
        if count is None:
            raise AppError(503, 'dashboard_unavailable', 'Contagem indisponível.')
        return count

    def alerts(self, table, fields, company, limit):
        return self.execute(self.client.table(table).select(fields).eq('empresa_id', str(company))
                            .in_('status_calculado', ['vencido', 'vencendo'])
                            .order('dias_restantes', nullsfirst=False)
                            .order('titulo' if table == 'vw_dashboard_documentos' else 'treinamento_nome')
                            .limit(limit)).data
