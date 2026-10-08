import httpx
from postgrest.exceptions import APIError
from app.core.entitlements import database_error
from app.core.errors import AppError

FIELDS = '*,tipo:documento_tipos(*),colaborador:colaboradores(id,nome)'

class ExamesRepository:
    def __init__(self, client):
        self.client = client

    def execute(self, query):
        try:
            return query.execute().data
        except APIError as exc:
            database_error(exc)
            status = {'23503': 422, '23514': 422, '23505': 409, '42501': 403, 'PGRST301': 401}.get(exc.code, 503)
            raise AppError(status, 'exames_error', 'Não foi possível concluir a operação de ASO.') from None
        except httpx.HTTPError:
            raise AppError(503, 'exames_unavailable', 'Não foi possível acessar os ASOs.') from None

    def tipo(self):
        rows = self.execute(self.client.table('documento_tipos').select('id').ilike('nome', 'ASO').limit(2))
        if len(rows) != 1:
            raise AppError(503, 'aso_type_unavailable', 'Tipo documental ASO indisponível.')
        return rows[0]['id']

    def query(self, company):
        return self.client.table('documentos').select(FIELDS).eq('empresa_id', str(company)).eq('tipo_id', self.tipo())

    def list(self, company, employee=None):
        # Explicit pagination avoids silent PostgREST row limits in exports/KPIs.
        result, offset = [], 0
        while True:
            q = self.query(company)
            if employee is not None:
                q = q.eq('colaborador_id', str(employee))
            page = self.execute(q.order('id').range(offset, offset + 499))
            result.extend(page)
            if len(page) < 500:
                return result
            offset += 500

    def get(self, item, company):
        rows = self.execute(self.query(company).eq('id', str(item)).limit(1))
        return rows[0] if rows else None

    def employee_exists(self, item, company):
        return bool(self.execute(self.client.table('colaboradores').select('id')
            .eq('id', str(item)).eq('empresa_id', str(company)).limit(1)))

    def catalog(self):
        return self.execute(self.client.table('exames_catalogo').select('*').order('ordem').order('id'))

    def create(self, payload):
        rows = self.execute(self.client.table('documentos').insert(payload).select(FIELDS))
        return rows[0] if rows else None

    def update(self, item, company, payload):
        rows = self.execute(self.client.table('documentos').update(payload).eq('id', str(item))
            .eq('empresa_id', str(company)).eq('tipo_id', self.tipo()).select(FIELDS))
        return rows[0] if rows else None

    def delete(self, item, company):
        return self.execute(self.client.table('documentos').delete().eq('id', str(item))
            .eq('empresa_id', str(company)).eq('tipo_id', self.tipo()))

    def referenced(self, path, company):
        return bool(self.execute(self.client.table('documentos').select('id').eq('empresa_id', str(company))
            .eq('arquivo_path', path).limit(1)))

    def storage(self):
        return self.client.storage.from_('documentos')
