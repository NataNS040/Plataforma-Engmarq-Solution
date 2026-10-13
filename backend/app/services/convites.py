import hashlib
import secrets
from uuid import UUID
from urllib.parse import urlencode

import httpx
from postgrest.exceptions import APIError

from app.core.errors import AppError
from app.integrations.supabase import create_admin_client
from app.schemas.convites import ConviteResponse


def _company(actor, company):
    if not actor.active or actor.role not in {"empresa", "gestor", "admin"}:
        raise AppError(403, "access_denied", "Sem permissão para convidar usuários.")
    if actor.role == "admin":
        if company is None:
            raise AppError(422, "company_required", "Informe a empresa do convite.")
        return company
    if company is not None and company != actor.empresa_id:
        raise AppError(403, "access_denied", "O convite deve pertencer à sua empresa.")
    return actor.empresa_id


def _enabled(settings):
    if not settings.user_invitations_enabled:
        raise AppError(503, "invitations_paused", "Os convites estão temporariamente indisponíveis.")


def _error(exc):
    if isinstance(exc, APIError):
        if exc.code == "23505":
            raise AppError(409, "invitation_exists", "Já existe cadastro ou convite para este e-mail.") from None
        if exc.code == "P2602":
            raise AppError(409, "invitation_unavailable", "Convite expirado, cancelado ou já utilizado.") from None
        if exc.code == "42501":
            raise AppError(403, "access_denied", "Sem autorização para este convite.") from None
    raise AppError(503, "invitations_unavailable", "Não foi possível concluir o convite.") from None


def create_invitation(data, actor, settings):
    _enabled(settings)
    company = _company(actor, data.empresa_id)
    capability = secrets.token_urlsafe(32)
    with httpx.Client(timeout=settings.supabase_timeout_seconds) as http:
        admin = create_admin_client(settings, http)
        try:
            invitation = admin.rpc("convite_criar", {
                "actor": str(actor.id), "company": str(company), "invite_email": str(data.email),
                "invite_name": data.full_name, "invite_role": data.role,
                "token_hash": hashlib.sha256(capability.encode()).hexdigest(),
            }).execute().data
        except Exception as exc:
            _error(exc)
        try:
            # Native Auth invite email: no secret link returned to the inviter.
            result = admin.auth.admin.invite_user_by_email(str(data.email), {
                "data": {"norveo_invite": capability},
                "redirect_to": str(settings.invitation_callback_url) + "?" + urlencode({"convite": str(invitation)}),
            })
            if result is None or result.user is None:
                raise RuntimeError("Auth invitation outcome missing")
        except Exception:
            # Do not retry ambiguous delivery or delete a possibly-created identity.
            try:
                admin.rpc("convite_falhou", {"actor": str(actor.id), "invitation": str(invitation)}).execute()
            except Exception:
                pass  # Still inactive; operator reconciles the pending row.
            raise AppError(503, "invitation_delivery_failed", "Não foi possível confirmar o envio. Verifique o convite antes de tentar novamente.") from None
    return ConviteResponse(invitation_id=UUID(str(invitation)))


def invitation_operation(operation, actor, settings, invitation=None, company=None):
    _enabled(settings)
    if operation == "list":
        company = _company(actor, company)
        args = {"actor": str(actor.id), "company": str(company)}
        rpc = "convite_listar"
    elif operation == "cancel":
        _company(actor, actor.empresa_id)
        args = {"actor": str(actor.id), "invitation": str(invitation)}
        rpc = "convite_cancelar"
    elif operation == "accept":
        # actor is a verified Auth identity; no active profile required yet.
        args = {"invitee": str(actor.id), "invitation": str(invitation)}
        rpc = "convite_aceitar"
    else:
        raise ValueError("Unsupported invitation operation")
    with httpx.Client(timeout=settings.supabase_timeout_seconds) as http:
        admin = create_admin_client(settings, http)
        try:
            return admin.rpc(rpc, args).execute().data
        except Exception as exc:
            _error(exc)
