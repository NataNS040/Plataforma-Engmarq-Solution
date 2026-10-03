import re
from datetime import date, timedelta, datetime
from zoneinfo import ZoneInfo
from uuid import uuid4
from urllib.parse import urlsplit
from app.core.errors import AppError

def aso_status(expiry, today=None):
    today = today or datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    expiry = date.fromisoformat(str(expiry)) if expiry else None
    if expiry is None:
        return 'vigente'
    return 'vencido' if expiry < today else 'vencendo' if expiry <= today + timedelta(days=30) else 'vigente'

class ExamesService:
    def __init__(self, repository, actor, storage_origin):
        self.repository, self.actor = repository, actor
        self.storage_origin = str(storage_origin).rstrip('/')

    def authorize(self, write=False):
        roles = {'empresa', 'gestor'} if write else {'empresa', 'gestor', 'operacional'}
        if not self.actor.active or self.actor.role not in roles:
            raise AppError(403, 'access_denied', 'Sem acesso aos ASOs.')
        return self.actor.empresa_id

    def response(self, row):
        if row is None:
            raise AppError(404, 'not_found', 'ASO não encontrado.')
        return row | {'status': aso_status(row.get('vencimento'))}

    def get(self, item):
        return self.response(self.repository.get(item, self.authorize()))

    def list(self, employee=None):
        company = self.authorize()
        if employee is not None and not self.repository.employee_exists(employee, company):
            raise AppError(404, 'not_found', 'Colaborador não encontrado.')
        return [self.response(r) for r in self.repository.list(company, employee)]

    def catalog(self):
        self.authorize()
        return self.repository.catalog()

    def validate(self, payload, old=None):
        company = self.authorize(True)
        if 'colaborador_id' in payload and not self.repository.employee_exists(payload['colaborador_id'], company):
            raise AppError(422, 'invalid_reference', 'Colaborador inválido para esta empresa.')
        merged = (old or {}) | payload
        # Only validate changed dates: historical values remain editable without reinterpretation.
        if 'emissao' in payload or 'vencimento' in payload:
            if merged.get('emissao') and merged.get('vencimento') and str(merged['vencimento']) < str(merged['emissao']):
                raise AppError(422, 'invalid_dates', 'Vencimento anterior à emissão.')
        if 'exames_realizados' in payload:
            names = {r['nome'] for r in self.repository.catalog()}
            if len(set(payload['exames_realizados'])) != len(payload['exames_realizados']) or any(x not in names for x in payload['exames_realizados']):
                raise AppError(422, 'invalid_procedures', 'Procedimentos inválidos ou duplicados.')
        return company

    def create(self, data):
        self.authorize(True)
        payload = data.model_dump(mode='json')
        company = self.validate(payload)
        return self.response(self.repository.create(payload | {'empresa_id': str(company), 'tipo_id': self.repository.tipo()}))

    def update(self, item, data):
        self.authorize(True)
        old = self.get(item)
        payload = data.model_dump(mode='json', exclude_unset=True)
        company = self.validate(payload, old)
        return self.response(self.repository.update(item, company, payload))

    def delete(self, item):
        company = self.authorize(True)
        self.get(item)
        if not self.repository.delete(item, company):
            raise AppError(404, 'not_found', 'ASO não encontrado.')
        # Preserve objects: another document may reference the same object or legacy URL.

    def path(self, row):
        company = self.authorize()
        path = row.get('arquivo_path')
        if path is None:
            raw = row.get('arquivo_url') or ''
            prefix = self.storage_origin + '/storage/v1/object/public/documentos/'
            url = urlsplit(raw)
            if not raw.startswith(prefix) or url.query or url.fragment or url.username or url.password:
                raise AppError(422, 'invalid_file', 'Referência de arquivo inválida.')
            path = raw[len(prefix):]
        if not re.fullmatch(re.escape(str(company)) + r'/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+', path):
            raise AppError(422, 'invalid_file', 'Arquivo fora da pasta autorizada.')
        return path

    def file_url(self, item, download=False):
        row = self.get(item)
        path = self.path(row)
        try:
            options = {'download': 'ASO.pdf'} if download else None
            data = self.repository.storage().create_signed_url(path, 60, options)
            url = data.get('signedURL') or data.get('signedUrl')
            if not url:
                raise ValueError('Missing link')
            return {'url': url, 'expires_in': 60}
        except Exception:
            raise AppError(503, 'file_unavailable', 'Não foi possível acessar o arquivo.') from None

    def upload(self, item, content, mime):
        company = self.authorize(True)
        self.get(item)
        if mime != 'application/pdf' or not content.startswith(b'%PDF-') or not content or len(content) > 10485760:
            raise AppError(422, 'invalid_file', 'Envie PDF válido de até 10 MB.')
        path = f'{company}/{uuid4()}.pdf'
        uploaded = False
        try:
            self.repository.storage().upload(path, content, {'content-type': 'application/pdf', 'upsert': 'false'})
            uploaded = True
            return self.response(self.repository.update(item, company, {'arquivo_path': path}))
        except Exception as exc:
            # A timed-out update may have committed. Never remove a possibly referenced file.
            if uploaded and isinstance(exc, AppError) and exc.status_code in {403, 404, 409, 422}:
                try:
                    if not self.repository.referenced(path, company):
                        self.repository.storage().remove([path])
                except Exception:
                    pass  # Unknown state: keep object for manual inventory, never delete blindly.
            raise AppError(503, 'upload_unconfirmed', 'Não foi possível confirmar o anexo. Atualize o ASO antes de tentar novamente.') from None
