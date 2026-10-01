import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import ColaboradoresPage, { AddColabModal, ProfileModal } from '@/modules/colaboradores/ColaboradoresPage'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { useColaboradores, useColaborador } from '@/hooks/queries/useColaboradores'
import { qk } from '@/lib/queryKeys'
import ExamesPage from '@/modules/exames/ExamesPage'
import TreinamentosPage from '@/modules/treinamentos/TreinamentosPage'
import DocumentosPage from '@/modules/documentos/DocumentosPage'

const { auth } = vi.hoisted(() => ({ auth: {
  profile: { id: 'actor', empresa_id: 'own', role: 'empresa', active: true },
  session: { access_token: 'test' }, loading: false, profileLoading: false, profileError: null,
} }))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

let qc: QueryClient
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  auth.profile.role = 'empresa'
  auth.profile.active = true
})
function render(children: ReactNode) {
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>)
}
const row = { id: 'employee', empresa_id: 'own', nome: 'Pessoa Teste', cpf: '12345678901',
  matricula: null, funcao_id: 'catalog', setor_id: 'catalog', ambiente_id: null,
  data_admissao: '2025-01-01', data_demissao: null, active: true, created_at: null,
  funcao: { id: 'catalog', nome: 'Função' }, setor: { id: 'catalog', nome: 'Setor' }, ambiente: null }

it('admin cannot mount the employee page or creation form', () => {
  auth.profile.role = 'admin'
  expect(render(<ColaboradoresPage />)).toContain('Sem acesso')
  expect(render(<AddColabModal empresaId="own" onClose={() => {}} />)).toBe('')
  expect(render(<ProfileModal colab={row} onClose={() => {}} />)).toBe('')
  expect(render(<ProtectedRoute allowedRoles={['empresa', 'gestor', 'operacional']}><span>Restricted child</span></ProtectedRoute>)).not.toContain('Restricted child')
})

it.each(['empresa', 'gestor'])('%s can access the page and creation/edit/deactivation controls', role => {
  auth.profile.role = role
  expect(render(<ColaboradoresPage />)).toContain('Adicionar colaborador')
  expect(render(<AddColabModal empresaId="own" onClose={() => {}} />)).toContain('Individual')
  const html = render(<ProfileModal colab={row} onClose={() => {}} />)
  expect(html).toContain('Editar colaborador')
  expect(html).toContain('Inativar')
})

it('operacional sees the page and profile without employee write controls', () => {
  auth.profile.role = 'operacional'
  expect(render(<ColaboradoresPage />)).not.toContain('Adicionar colaborador')
  const html = render(<ProfileModal colab={row} onClose={() => {}} />)
  expect(html).toContain('Pessoa Teste')
  expect(html).not.toContain('Editar colaborador')
  expect(html).not.toContain('Inativar')
  expect(render(<AddColabModal empresaId="own" onClose={() => {}} />)).toBe('')
})

it('inactive profile and foreign company cannot open creation', () => {
  expect(render(<AddColabModal empresaId="foreign" onClose={() => {}} />)).toBe('')
  expect(render(<ProfileModal colab={{ ...row, empresa_id: 'foreign' }} onClose={() => {}} />)).toBe('')
  auth.profile.active = false
  expect(render(<ColaboradoresPage />)).toContain('Sem acesso')
  expect(render(<AddColabModal empresaId="own" onClose={() => {}} />)).toBe('')
})

function Consumer({ company }: { company: string | null }) {
  const list = useColaboradores(company)
  const detail = useColaborador('employee')
  return <span>{list.data?.length ?? 0}:{String(list.isLoading)}:{detail.data?.nome ?? 'empty'}</span>
}

it.each(['admin', 'operacional', 'empresa', 'gestor'])('shared hooks are safe for %s, missing tenant and foreign tenant', role => {
  auth.profile.role = role
  expect(render(<Consumer company={null} />)).toContain('0:false:empty')
  expect(render(<Consumer company="foreign" />)).toContain('0:false:empty')
  const own = render(<Consumer company="own" />)
  expect(own).toContain(role === 'admin' ? '0:false:empty' : '0:true:empty')
})

it('role change does not expose cached employee data through disabled hooks', () => {
  qc.setQueryData([...qk.colaboradores.list('own'), 'actor', true], [row])
  qc.setQueryData([...qk.colaboradores.detail('employee'), 'actor', 'own', true], row)
  expect(render(<Consumer company="own" />)).toContain('1:false:Pessoa Teste')
  auth.profile.role = 'admin'
  expect(render(<Consumer company="own" />)).toContain('0:false:empty')
})

it.each([ExamesPage, TreinamentosPage, DocumentosPage])('admin consumer renders without querying individual collaborators', Page => {
  auth.profile.role = 'admin'
  expect(() => render(<Page />)).not.toThrow()
  expect(qc.getQueryCache().findAll({ queryKey: qk.colaboradores.all })).toHaveLength(0)
})
