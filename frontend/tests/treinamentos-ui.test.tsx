import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import TreinamentosPage, { AddTreinamentoModal } from '@/modules/treinamentos/TreinamentosPage'
import { ProfileModal } from '@/modules/colaboradores/ColaboradoresPage'
import { useTreinamentos, useMatrizTreinamentos, useTreinamentosDoColaborador, useAtualizarTreinamento } from '@/hooks/queries/useTreinamentos'
import { qk } from '@/lib/queryKeys'

const { auth, update } = vi.hoisted(() => ({ auth: {
  profile: { id: 'actor', empresa_id: 'own', role: 'empresa', active: true },
}, update: vi.fn() }))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/services/treinamentosService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/treinamentosService')>(), atualizarTreinamento: update,
}))
let qc: QueryClient
const tipo = { id: 'tipo', nome: 'Treinamento realizado', descricao: null, nr_referencia: 'NR-10', validade_meses: 12 }
const employee = { id: 'employee', empresa_id: 'own', nome: 'Pessoa Teste', cpf: '12345678901', matricula: null,
  funcao_id: 'funcao', setor_id: 'setor', ambiente_id: null, data_admissao: '2025-01-01', data_demissao: null,
  active: true, created_at: null, funcao: { id: 'funcao', nome: 'Funcao' }, setor: { id: 'setor', nome: 'Setor' }, ambiente: null }
const row = { id: 'training', empresa_id: 'own', colaborador_id: 'employee', treinamento_tipo_id: 'tipo',
  data_realizacao: '2025-01-01', data_vencimento: null, status: 'em_dia', treinamento_tipo: tipo, colaborador: employee }
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  auth.profile.role = 'empresa'; auth.profile.active = true
  qc.setQueryData([...qk.colaboradores.list('own'), 'actor', true], [employee])
  qc.setQueryData([...qk.treinamentos.list('own'), 'actor', true], [row])
  qc.setQueryData([...qk.treinamentos.byColaborador('employee'), 'actor', 'own', true], [row])
  qc.setQueryData([...qk.treinamentoTipos.list(), 'actor', true], [tipo])
  qc.setQueryData([...qk.matrizTreinamentos.list('own'), 'actor', true], [{ id: 'requirement', empresa_id: 'own', funcao_id: 'funcao',
    obrigatorio: true, treinamento_tipo_id: 'pending', treinamento_tipo: { ...tipo, id: 'pending', nome: 'Requisito pendente', nr_referencia: 'NR-35' } }])
  update.mockReset().mockResolvedValue(row)
})
function render(children: ReactNode) { return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>) }
const modal = (company='own') => <AddTreinamentoModal empresaId={company} colab={{ id: 'employee', nome: 'Pessoa', cor: '#fff', foto: 'PT' }} tipos={[tipo]} onClose={() => {}} />
it.each(['empresa','gestor','operacional'])('%s reads the grid, only managers can register', role => {
  auth.profile.role = role
  const html = render(<TreinamentosPage />)
  expect(html).toContain('Pessoa Teste'); expect(html).toContain('NR-10')
  expect(html.includes('title="Registrar treinamento"')).toBe(role !== 'operacional')
  expect(html).not.toContain('Excluir treinamento')
  expect(render(modal()).includes('Registrar treinamento')).toBe(role !== 'operacional')
})
it('admin and inactive profiles do not mount operational queries, foreign modal denied', () => {
  expect(render(modal('foreign'))).toBe('')
  for (const active of [false,true]) {
    auth.profile.active = active; auth.profile.role = active ? 'admin' : 'empresa'
    expect(render(<TreinamentosPage />)).toContain('Sem acesso')
    expect(render(modal())).toBe('')
  }
})
it('employee profile preserves required pending rows plus extra completed training, without deletion', () => {
  const html = render(<ProfileModal colab={employee} onClose={() => {}} />)
  expect(html).toContain('Requisito pendente')
  expect(html).toContain('Treinamento realizado')
  expect(html).not.toContain('Excluir treinamento')
})
function Consumer({ company }: { company: string | null }) {
  const list = useTreinamentos(company); const matrix = useMatrizTreinamentos(company); const individual = useTreinamentosDoColaborador('employee')
  return <span>{list.data?.length ?? 0}:{matrix.data?.length ?? 0}:{individual.data?.length ?? 0}</span>
}
it('hooks isolate company, identity and permission changes', () => {
  expect(render(<Consumer company="own" />)).toContain('1:1:1')
  expect(render(<Consumer company="foreign" />)).toContain('0:0:1')
  expect(render(<Consumer company={null} />)).toContain('0:0:1')
  auth.profile.role='admin'
  expect(render(<Consumer company="own" />)).toContain('0:0:0')
  auth.profile.role='empresa'; auth.profile.id='other'
  expect(render(<Consumer company="own" />)).toContain('0:0:0')
  auth.profile.id='actor'
})
it('editing invalidates all participant lists and dashboard aggregates', async () => {
  qc.setQueryData(qk.dashboard.all, {})
  let mutation: ReturnType<typeof useAtualizarTreinamento> | undefined
  function Capture() { mutation = useAtualizarTreinamento(); return null }
  render(<Capture />)
  await mutation!.mutateAsync({ id: 'training', empresaId: 'own', colaboradorId: 'employee', input: { colaborador_id: 'new' } })
  for (const key of [[...qk.treinamentos.list('own'),'actor',true], [...qk.treinamentos.byColaborador('employee'),'actor','own',true], qk.dashboard.all]) {
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
  }
})
