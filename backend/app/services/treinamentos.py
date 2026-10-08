import re

from app.core.entitlements import require_feature
from app.core.errors import AppError


class TreinamentosService:
    def __init__(self, repository, actor):
        self.repository = repository
        self.actor = actor

    def authorize(self, write=False):
        roles = {"empresa", "gestor"} if write else {"empresa", "gestor", "operacional"}
        if not self.actor.active or self.actor.role not in roles:
            raise AppError(403, "access_denied", "Sem acesso aos treinamentos.")
        require_feature(self.repository.client, self.actor, 'treinamentos')
        return self.actor.empresa_id

    def validate_relations(self, payload, company):
        for field, table in (("colaborador_id", "colaboradores"), ("funcao_id", "funcoes"),
                             ("treinamento_tipo_id", "treinamento_tipos")):
            if field in payload and not self.repository.exists(table, payload[field],
                    None if table == "treinamento_tipos" else company):
                raise AppError(422, "invalid_reference", "Referência inválida para esta empresa.")
        path = payload.get("certificado_url")
        if path is not None and not re.fullmatch(re.escape(str(company)) + r"/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+", path):
            raise AppError(422, "invalid_certificate", "Certificado deve pertencer à pasta da empresa.")

    def list(self, table, employee=None):
        company = self.authorize()
        if employee and not self.repository.exists("colaboradores", employee, company):
            raise AppError(404, "not_found", "Colaborador não encontrado.")
        return self.repository.list(table, company, employee)

    def get(self, item):
        row = self.repository.get("treinamentos", item, self.authorize())
        if row is None:
            raise AppError(404, "not_found", "Treinamento não encontrado.")
        return row

    def create(self, table, data):
        company = self.authorize(True)
        payload = data.model_dump(mode="json")
        self.validate_relations(payload, company)
        row = self.repository.create(table, payload | {"empresa_id": str(company)})
        if row is None:
            raise AppError(503, "unconfirmed_write", "Não foi possível confirmar o cadastro.")
        return row

    def update(self, table, item, data):
        company = self.authorize(True)
        if self.repository.get(table, item, company) is None:
            raise AppError(404, "not_found", "Registro não encontrado.")
        payload = data.model_dump(mode="json", exclude_unset=True)
        self.validate_relations(payload, company)
        row = self.repository.update(table, item, company, payload)
        if row is None:
            raise AppError(404, "not_found", "Registro não encontrado.")
        return row

    def delete_requirement(self, item):
        company = self.authorize(True)
        if not self.repository.delete_requirement(item, company):
            raise AppError(404, "not_found", "Requisito não encontrado.")
