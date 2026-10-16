from datetime import date, datetime
from zoneinfo import ZoneInfo
from app.core.entitlements import require_feature
from app.core.errors import AppError


def today():
    return datetime.now(ZoneInfo('America/Sao_Paulo')).date()


def _date(value):
    return date.fromisoformat(str(value)) if value else None


def check_rules(row):
    """Mirror of the 026 CHECK constraints with readable messages (the database stays authoritative)."""
    def fail(message):
        raise AppError(422, 'invalid_accident', message)
    accident = _date(row.get('data_acidente'))
    if accident and accident > today():
        fail('A data do acidente não pode ser futura.')
    if row.get('tipo') == 'doenca' and (row.get('hora_acidente') or row.get('minutos_trabalhados_antes') is not None):
        fail('Doença ocupacional não tem hora do acidente nem horas trabalhadas antes.')
    if (row.get('agente_tabela') is None) != (row.get('codigo_agente_causador') is None):
        fail('Informe o agente causador junto com a tabela (14 ou 15).')
    if row.get('agente_tabela') == 15 and row.get('tipo') != 'doenca':
        fail('A Tabela 15 como agente causador só vale para doença ocupacional.')
    if row.get('lateralidade') is not None and not row.get('codigo_parte_atingida'):
        fail('Lateralidade exige a parte do corpo atingida.')
    if not row.get('houve_afastamento') and (row.get('data_retorno') or row.get('dias_perdidos') is not None):
        fail('Data de retorno e dias perdidos só se aplicam quando houve afastamento.')
    retorno = _date(row.get('data_retorno'))
    if retorno and accident and retorno < accident:
        fail('A data de retorno não pode ser anterior ao acidente.')
    obito = _date(row.get('data_obito'))
    if row.get('houve_obito'):
        if not obito or (accident and obito < accident) or row.get('gravidade') != 'fatal':
            fail('Óbito exige data (a partir do acidente) e gravidade fatal.')
    elif obito:
        fail('Data de óbito só se aplica quando houve óbito.')


class AcidentesService:
    def __init__(self, repository, actor):
        self.repository, self.actor = repository, actor

    def authorize(self, write=False):
        roles = {'empresa', 'gestor'} if write else {'empresa', 'gestor', 'operacional'}
        if not self.actor.active or self.actor.role not in roles:
            raise AppError(403, 'access_denied', 'Sem acesso aos acidentes.')
        require_feature(self.repository.client, self.actor, 'acidentes')
        return self.actor.empresa_id

    def get(self, item):
        row = self.repository.get(item, self.authorize())
        if row is None:
            raise AppError(404, 'not_found', 'Acidente não encontrado.')
        return row

    def list(self, employee=None):
        company = self.authorize()
        if employee is not None and not self.repository.employee_exists(employee, company):
            raise AppError(404, 'not_found', 'Colaborador não encontrado.')
        return self.repository.list(company, employee)

    def resumo(self):
        return self.repository.resumo(self.authorize())

    def check_employee(self, payload, company):
        if 'colaborador_id' in payload and not self.repository.employee_exists(payload['colaborador_id'], company):
            raise AppError(422, 'invalid_reference', 'Colaborador inválido para esta empresa.')

    def create(self, data):
        company = self.authorize(True)
        payload = data.model_dump(mode='json')
        self.check_employee(payload, company)
        check_rules(payload)
        return self.repository.create(payload | {'empresa_id': str(company)})

    def editable(self, item):
        old = self.get(item)
        if old.get('anulado_em'):
            raise AppError(409, 'accident_annulled', 'Acidente anulado não pode ser alterado.')
        return old

    def update(self, item, data):
        company = self.authorize(True)
        old = self.editable(item)
        payload = data.model_dump(mode='json', exclude_unset=True)
        self.check_employee(payload, company)
        check_rules({k: v for k, v in old.items() if k != 'colaborador'} | payload)
        row = self.repository.update(item, company, payload)
        if row is None:
            raise AppError(409, 'accident_changed', 'Acidente alterado ou anulado enquanto você editava.')
        return row

    def anular(self, item, data):
        company = self.authorize(True)
        self.editable(item)
        row = self.repository.update(item, company, {'motivo_anulacao': data.motivo})
        if row is None:
            raise AppError(409, 'accident_changed', 'Acidente alterado ou anulado enquanto você editava.')
        return row
