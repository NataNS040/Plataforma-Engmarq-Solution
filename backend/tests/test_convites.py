from uuid import UUID
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.convites import ConviteCreate
from app.services.convites import _company, create_invitation

COMPANY = UUID('00000000-0000-4000-8000-000000000101')
OTHER = UUID('00000000-0000-4000-8000-000000000102')


def test_paused_invites_fail_before_opening_privileged_client(monkeypatch):
    monkeypatch.setattr('app.services.convites.create_admin_client', lambda *a: pytest.fail('Privileged client opened'))
    with pytest.raises(AppError) as exc:
        create_invitation(ConviteCreate(email='invite@example.com', full_name='Synthetic'), None, Settings(_env_file=None))
    assert exc.value.status_code == 503


@pytest.mark.parametrize('role,active,target,allowed', [
    ('gestor', True, None, True), ('empresa', True, COMPANY, True),
    ('gestor', True, OTHER, False), ('operacional', True, None, False),
    ('gestor', False, None, False), ('admin', True, OTHER, True), ('admin', True, None, False),
])
def test_company_is_authorized_not_client_chosen(role, active, target, allowed):
    actor = SimpleNamespace(role=role, active=active, empresa_id=COMPANY)
    if allowed:
        assert _company(actor, target) == (target or COMPANY)
    else:
        with pytest.raises(AppError): _company(actor, target)


@pytest.mark.parametrize('extra', [{'role': 'admin'}, {'active': True}, {'actor_id': str(COMPANY)}, {'expires_at': '2099-01-01'}])
def test_invite_payload_rejects_authority_fields(extra):
    with pytest.raises(ValidationError):
        ConviteCreate(email='invite@example.com', full_name='Synthetic', **extra)


@pytest.mark.parametrize('url', ['http://external.example.com/accept', 'https://u:p@example.com/accept', 'https://example.com/accept?target=evil', 'https://example.com/accept#evil'])
def test_callback_cannot_redirect_to_untrusted_input(url):
    with pytest.raises(ValidationError): Settings(_env_file=None, invitation_callback_url=url)


def test_enabling_invites_requires_explicit_callback():
    with pytest.raises(ValidationError): Settings(_env_file=None, user_invitations_enabled=True)
