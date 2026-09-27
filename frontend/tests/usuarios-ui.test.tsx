import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { UserProfile, UserRole } from '@/types/database'
import ConfiguracoesPage from '@/modules/configuracoes/ConfiguracoesPage'
import { CriarUsuarioModal } from '@/modules/configuracoes/CriarUsuarioModal'
import { EditarUsuarioModal } from '@/modules/configuracoes/EditarUsuarioModal'

const { auth, teamQuery } = vi.hoisted(() => ({
  auth: { profile: { id: 'actor', empresa_id: 'own', role: 'empresa', active: true } },
  teamQuery: vi.fn(() => ({ data: [] })),
}))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => auth }))
vi.mock('@/hooks/queries/useEmpresas', () => ({
  useEmpresa: () => ({ data: undefined }),
  useAtualizarEmpresa: () => ({ isPending: false }),
  // Selecting arbitrary companies must not be part of user creation.
  useEmpresas: () => { throw new Error('User management must not load companies') },
}))
vi.mock('@/hooks/queries/useUsuarios', () => ({
  useUsuariosDaEmpresa: teamQuery,
  useAtualizarUsuario: () => ({ data: undefined, isPending: false, mutate: vi.fn() }),
}))
vi.mock('@/services/empresasService', () => ({ uploadEmpresaLogo: vi.fn() }))
vi.mock('@/services/usuariosService', () => ({ criarUsuario: vi.fn() }))
vi.mock('@/modules/configuracoes/CatalogosTab', () => ({ CatalogosTab: () => null }))

beforeEach(() => {
  auth.profile.role = 'empresa'
  auth.profile.active = true
  teamQuery.mockClear()
})

it('global admin has no team tab, actions or team query', () => {
  auth.profile.role = 'admin'
  const html = renderToStaticMarkup(<ConfiguracoesPage />)
  expect(html).not.toContain('Equipe')
  expect(html).not.toContain('Criar acesso')
  expect(teamQuery).not.toHaveBeenCalled()
})

it.each(['empresa', 'gestor'])('%s has access to its team and only tenant roles', role => {
  auth.profile.role = role
  expect(renderToStaticMarkup(<ConfiguracoesPage />)).toContain('Equipe e acessos')
  const html = renderToStaticMarkup(<CriarUsuarioModal onClose={() => {}} />)
  expect(html).not.toContain('value="admin"')
  expect(html.match(/<select/g)).toHaveLength(1)
  for (const allowed of ['gestor', 'empresa', 'operacional']) {
    expect(html).toContain(`value="${allowed}"`)
  }
})

it.each(['admin', 'operacional'])('%s cannot render creation or editing modals', role => {
  auth.profile.role = role
  expect(renderToStaticMarkup(<CriarUsuarioModal onClose={() => {}} />)).toBe('')
  expect(renderToStaticMarkup(<EditarUsuarioModal usuario={target()} isSelf={false} onClose={() => {}} />)).toBe('')
})

function target(role: UserRole = 'operacional'): UserProfile {
  return { id: 'target', empresa_id: 'own', email: 'target@example.com', full_name: 'Target',
    role, active: true, created_at: '2026-01-01T00:00:00Z' }
}

it('inactive actors cannot create and foreign targets cannot be edited', () => {
  auth.profile.active = false
  expect(renderToStaticMarkup(<CriarUsuarioModal onClose={() => {}} />)).toBe('')
  auth.profile.active = true
  expect(renderToStaticMarkup(<EditarUsuarioModal usuario={{ ...target(), empresa_id: 'other' }} isSelf={false} onClose={() => {}} />)).toBe('')
})

it.each([true, false])('own access and global admin targets have all edit controls disabled (self=%s)', isSelf => {
  const html = renderToStaticMarkup(<EditarUsuarioModal usuario={target(isSelf ? 'empresa' : 'admin')} isSelf={isSelf} onClose={() => {}} />)
  expect(html).toMatch(/<select[^>]*disabled=""/)
  expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
})
