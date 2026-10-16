import httpx
from postgrest.exceptions import APIError
from app.core.entitlements import database_error
from app.core.errors import AppError

COLABORADOR = 'colaborador:colaboradores(id,nome,setor:setores(nome))'
# The list carries codes only: descriptions come from the static eSocial JSON in the frontend.
LIST_FIELDS = ('id,colaborador_id,tipo,data_acidente,gravidade,piramide_bird,status,houve_afastamento,'
               'dias_perdidos,emitir_cat,codigo_parte_atingida,codigo_natureza_lesao,agente_tabela,'
               'codigo_agente_causador,anulado_em,' + COLABORADOR)
FIELDS = '*,' + COLABORADOR


class AcidentesRepository:
    def __init__(self, client):
        self.client = client

    def execute(self, query):
        try:
            return query.execute().data
        except APIError as exc:
            database_error(exc)
            status = {'23503': 422, '23514': 422, '23505': 409, '42501': 403, 'PGRST301': 401,
                      '40001': 409, '40P01': 409}.get(exc.code, 503)
            raise AppError(status, 'acidentes_error', {
                422: 'Código eSocial, colaborador ou datas inválidos para esta empresa.',
                409: 'Registro alterado simultaneamente. Atualize e tente novamente.',
                403: 'Sem permissão para esta operação.', 401: 'Sessão inválida.',
                503: 'Não foi possível acessar os acidentes.',
            }[status]) from None
        except httpx.HTTPError:
            raise AppError(503, 'acidentes_unavailable', 'Não foi possível acessar os acidentes.') from None

    def list(self, company, employee=None):
        # Explicit pagination avoids silent PostgREST row limits.
        result, offset = [], 0
        while True:
            q = self.client.table('acidentes').select(LIST_FIELDS).eq('empresa_id', str(company))
            if employee is not None:
                q = q.eq('colaborador_id', str(employee))
            page = self.execute(q.order('data_acidente', desc=True).order('id').range(offset, offset + 499))
            result.extend(page)
            if len(page) < 500:
                return result
            offset += 500

    def get(self, item, company):
        rows = self.execute(self.client.table('acidentes').select(FIELDS)
            .eq('id', str(item)).eq('empresa_id', str(company)).limit(1))
        return rows[0] if rows else None

    def resumo(self, company):
        return self.execute(self.client.table('vw_acidentes_resumo')
            .select('mes,tipo,gravidade,piramide_bird,houve_afastamento,emitir_cat,total,dias_perdidos')
            .eq('empresa_id', str(company)).order('mes', desc=True).limit(5000))

    def employee_exists(self, item, company):
        return bool(self.execute(self.client.table('colaboradores').select('id')
            .eq('id', str(item)).eq('empresa_id', str(company)).limit(1)))

    def create(self, payload):
        rows = self.execute(self.client.table('acidentes').insert(payload).select(FIELDS))
        return rows[0] if rows else None

    def update(self, item, company, payload):
        rows = self.execute(self.client.table('acidentes').update(payload)
            .eq('id', str(item)).eq('empresa_id', str(company)).is_('anulado_em', 'null').select(FIELDS))
        return rows[0] if rows else None
