import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ session: null as null | { access_token: string } }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ session: state.session, profile: null, profileError: true, loading: false, signOut: vi.fn() }) }))
vi.mock('@/services/api/convites', () => ({ invitationsEnabled: true, acceptInvitation: vi.fn() }))
import AcceptInvitationPage from '@/modules/auth/AcceptInvitationPage'

it('allows the pending inactive invited profile to accept using a verified session', () => {
  state.session = { access_token: 'synthetic-local-session' }
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/aceitar-convite?convite=00000000-0000-4000-8000-000000000123']}><AcceptInvitationPage /></MemoryRouter>)
  expect(html).toContain('Confirmar senha')
  expect(html).toContain('Aceitar convite')
  expect(html).not.toContain('synthetic-local-session')
})
it('invalid invite or missing session never renders an acceptance form', () => {
  state.session = null
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/aceitar-convite?convite=invalid']}><AcceptInvitationPage /></MemoryRouter>)
  expect(html).toContain('Convite inválido ou link expirado')
  expect(html).not.toContain('<form')
})
