"""Effective grants are checked with the caller JWT; SQL remains authoritative."""
import httpx
from postgrest.exceptions import APIError
from app.core.errors import AppError


DATABASE_ERRORS = {
    'P2501': (403, 'feature_not_enabled', 'Recurso indisponível para esta conta.'),
    'P2502': (409, 'collaborator_limit_reached', 'Limite de colaboradores ativos atingido.'),
    'P2503': (403, 'tenant_forbidden', 'Sem permissão para esta operação.'),
    'P2504': (403, 'company_inactive', 'Conta empresarial indisponível.'),
    'P2505': (403, 'user_inactive', 'Acesso indisponível.'),
    'P2506': (503, 'usage_unavailable', 'Não foi possível validar o uso da conta.'),
}


def database_error(exc):
    if exc.code in DATABASE_ERRORS:
        raise AppError(*DATABASE_ERRORS[exc.code]) from None


def enabled(client, actor, feature):
    if not actor.active:
        raise AppError(403, 'user_inactive', 'Acesso indisponível.')
    if actor.role not in {'empresa', 'gestor', 'operacional'}:
        raise AppError(403, 'tenant_forbidden', 'Sem permissão para esta operação.')
    try:
        # Foundation RLS checks fresh profile/company state and tenant.
        rows = (client.table('empresa_features').select('enabled')
                .eq('empresa_id', str(actor.empresa_id)).eq('feature_key', feature)
                .limit(1).execute().data)
        return bool(rows and rows[0].get('enabled') is True and feature != 'epi')
    except APIError as exc:
        database_error(exc)
        if exc.code == 'PGRST301':
            raise AppError(401, 'unauthorized', 'Sessão inválida ou expirada.') from None
        raise AppError(503, 'entitlements_unavailable', 'Não foi possível validar o acesso.') from None
    except httpx.HTTPError:
        raise AppError(503, 'entitlements_unavailable', 'Não foi possível validar o acesso.') from None


def require_feature(client, actor, feature):
    if not enabled(client, actor, feature):
        raise AppError(403, 'feature_not_enabled', 'Recurso indisponível para esta conta.')
