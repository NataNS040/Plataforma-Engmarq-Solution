import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import DocumentosPage from '@/modules/documentos/DocumentosPage'
import { ProfileModal } from '@/modules/colaboradores/ColaboradoresPage'
import { useFichasEpi, useFichasEpiDoColaborador } from '@/hooks/queries/useFichasEpi'
import { listarFichasEpi, listarFichasEpiDoColaborador } from '@/services/fichasEpiService'
import { EPI_DISPONIVEL } from '@/lib/modulos'

const { auth } = vi.hoisted(() => ({ auth: {
  profile: { id: 'actor', empresa_id: 'own', role: 'empresa', active: true },
  session: { access_token: 'test' }, loading: false, profileLoading: false, profileError: null,
} }))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/services/fichasEpiService', () => ({
  listarFichasEpi: vi.fn(), listarFichasEpiDoColaborador: vi.fn(),
  criarFichaEpi: vi.fn(), deletarFichaEpi: vi.fn(), assinarFichaEpi: vi.fn(),
}))

let qc: QueryClient
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  auth.profile.role = 'empresa'
})
function render(children: ReactNode) {
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>)
}
const row = { id: 'employee', empresa_id: 'own', nome: 'Pessoa Teste', cpf: '12345678901',
  matricula: null, funcao_id: 'catalog', setor_id: 'catalog', ambiente_id: null,
  data_admissao: '2025-01-01', data_demissao: null, active: true, created_at: null,
  funcao: { id: 'catalog', nome: 'Função' }, setor: { id: 'catalog', nome: 'Setor' }, ambiente: null }

it('EPI segue em quarentena até a migration própria do módulo', () => {
  expect(EPI_DISPONIVEL).toBe(false)
})

it('hooks de EPI nunca disparam consulta enquanto o módulo está em quarentena', () => {
  const status: string[] = []
  function Probe() {
    status.push(useFichasEpi('own').fetchStatus, useFichasEpiDoColaborador('employee').fetchStatus)
    return null
  }
  render(<Probe />)
  expect(status).toEqual(['idle', 'idle'])
  expect(listarFichasEpi).not.toHaveBeenCalled()
  expect(listarFichasEpiDoColaborador).not.toHaveBeenCalled()
})

it.each(['empresa', 'gestor'])('%s vê "Nova ficha de EPI" como em breve em Documentos', role => {
  auth.profile.role = role
  const html = render(<DocumentosPage />)
  expect(html).toMatch(/class="tbtn is-soon" title="Em breve"><svg[^]*?<\/svg> Nova ficha de EPI/)
})

it.each(['empresa', 'gestor', 'operacional'])('%s vê a seção de EPI do colaborador como em breve', role => {
  auth.profile.role = role
  const html = render(<ProfileModal colab={row} onClose={() => {}} />)
  expect(html).toContain('Fichas de EPI — em breve')
  expect(html).not.toContain('Nenhuma ficha de EPI registrada')
})
