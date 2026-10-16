import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import AcidentesPage from '@/modules/acidentes/AcidentesPage'
import { indicadores, inicial, noPeriodo, paraInput, validar } from '@/modules/acidentes/regras'
import { apiRequest, ApiError } from '@/services/api/client'
import {
  anularAcidente, atualizarAcidente, criarAcidente, listarAcidentes, listarAcidentesDoColaborador,
  obterAcidente, resumoAcidentes, acidenteListSchema,
} from '@/services/acidentesService'
import { carregarCatalogosEsocial } from '@/lib/esocial'
import { useAcidentes } from '@/hooks/queries/useAcidentes'
import { qk } from '@/lib/queryKeys'

const { auth } = vi.hoisted(() => ({ auth: { profile: { id: 'actor', empresa_id: 'own', role: 'empresa', active: true } } }))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/services/api/client', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/api/client')>(), apiRequest: vi.fn(),
}))

const id = '00000000-0000-4000-8000-000000000001'
const row = {
  id, colaborador_id: id, tipo: 'tipico', data_acidente: new Date().toISOString().slice(0, 10), gravidade: 'leve',
  piramide_bird: 'lesao_leve', status: 'aberto', houve_afastamento: true, dias_perdidos: 3, emitir_cat: false,
  codigo_parte_atingida: '753030000', codigo_natureza_lesao: '702000000', agente_tabela: 14,
  codigo_agente_causador: '302010200', anulado_em: null,
  colaborador: { id, nome: 'Pessoa Teste', setor: { nome: 'Manutenção' } },
} as const
const resumo = [{ mes: `${new Date().toISOString().slice(0, 7)}-01`, tipo: 'tipico', gravidade: 'grave', piramide_bird: 'lesao_grave',
  houve_afastamento: true, emitir_cat: true, total: 2, dias_perdidos: 10 }] as const

let qc: QueryClient
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  auth.profile.role = 'empresa'; auth.profile.active = true
  vi.mocked(apiRequest).mockReset().mockResolvedValue(row)
  qc.setQueryData([...qk.acidentes.list('own'), 'actor', true], [row])
  qc.setQueryData([...qk.acidentes.resumo('own'), 'actor', true], resumo)
})
const render = (child: ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter>{child}</MemoryRouter></QueryClientProvider>)

it('all accident operations go through the API and never send tenant or authorship', async () => {
  await listarAcidentes(); await listarAcidentesDoColaborador(id); await obterAcidente(id); await resumoAcidentes()
  await criarAcidente(paraInput({ ...inicial(), colaborador_id: id, tipo: 'tipico', data_acidente: '2026-03-10', gravidade: 'leve' }))
  await atualizarAcidente(id, { status: 'concluido' }); await anularAcidente(id, 'Duplicado')
  const calls = vi.mocked(apiRequest).mock.calls
  expect(calls.map(c => c[0])).toEqual(['/acidentes', `/colaboradores/${id}/acidentes`, `/acidentes/${id}`, '/acidentes/resumo',
    '/acidentes', `/acidentes/${id}`, `/acidentes/${id}/anular`])
  for (const [, options] of calls) {
    for (const forbidden of ['empresa_id', 'criado_por', 'anulado_por', 'anulado_em', 'created_at']) expect(options?.json ?? {}).not.toHaveProperty(forbidden)
  }
  expect(calls[6][1]).toMatchObject({ method: 'POST', json: { motivo: 'Duplicado' } })
  expect(() => obterAcidente('../exames')).toThrow()
})

it('form conversion follows the S-2210 rules before reaching the API', () => {
  const base = { ...inicial(), colaborador_id: id, data_acidente: '2026-03-10', gravidade: 'leve' as const }
  const tipico = paraInput({ ...base, tipo: 'tipico', hora_acidente: '08:30', horas_antes: '03:30', codigo_agente_causador: '302010200', agente_tabela: '15' })
  expect(tipico).toMatchObject({ hora_acidente: '08:30', minutos_trabalhados_antes: 210, agente_tabela: 14 })
  const doenca = paraInput({ ...base, tipo: 'doenca', hora_acidente: '08:30', horas_antes: '01:00', codigo_agente_causador: '200004300', agente_tabela: '15' })
  expect(doenca).toMatchObject({ hora_acidente: null, minutos_trabalhados_antes: null, agente_tabela: 15 })
  const semAfastamento = paraInput({ ...base, tipo: 'tipico', houve_afastamento: false, data_retorno: '2026-03-20', dias_perdidos: '5', lateralidade: '1' })
  expect(semAfastamento).toMatchObject({ data_retorno: null, dias_perdidos: null, lateralidade: null, agente_tabela: null })
})

it('client validation gives readable messages', () => {
  const base = { ...inicial(), colaborador_id: id, tipo: 'tipico' as const, data_acidente: '2026-03-10', gravidade: 'leve' as const }
  expect(validar(inicial())).toContain('Informe colaborador')
  expect(validar({ ...base, horas_antes: '3h' })).toContain('HH:MM')
  expect(validar({ ...base, houve_afastamento: true, data_retorno: '2026-03-01' })).toContain('retorno')
  expect(validar({ ...base, houve_obito: true, data_obito: '2026-03-11' })).toContain('fatal')
  expect(validar({ ...base, numero_recibo_cat: 'abc' })).toContain('CAT')
  expect(validar(base)).toBeNull()
})

it('period filter and KPIs come from the monthly summary', () => {
  const hoje = new Date(2026, 9, 16)
  expect(noPeriodo('2025-11-05', '12m', hoje)).toBe(true)
  expect(noPeriodo('2025-10-31', '12m', hoje)).toBe(false)
  expect(noPeriodo('2025-10-31', '2025', hoje)).toBe(true)
  const k = indicadores([...resumo, { ...resumo[0], gravidade: 'leve', piramide_bird: null, houve_afastamento: false, emitir_cat: false, total: 1, dias_perdidos: 0 }])
  expect(k).toMatchObject({ total: 3, afastamento: 2, dias: 10, graves: 2, cat: 2, semClassificacao: 1 })
  expect(k.bird).toEqual({ lesao_grave: 2, lesao_leve: 0, dano_material: 0, quase_acidente: 0 })
})

it('official eSocial catalogs load from the static bundle with descriptions', async () => {
  const c = await carregarCatalogosEsocial()
  expect(Object.fromEntries(Object.entries(c.tabelas).map(([k, v]) => [k, v.length]))).toEqual({ 13: 45, 14: 248, 15: 60, 17: 29 })
  expect(c.descricao('13', '753030000')).toBe('Crânio (inclusive encéfalo)')
  expect(c.descricao('17', null)).toBe('—')
  expect(c.tabelas['15'][0].conceito).toBeTruthy()
  expect(apiRequest).not.toHaveBeenCalled()
})

it.each(['empresa', 'gestor'])('%s sees the register, edit and annul actions', role => {
  auth.profile.role = role
  const html = render(<AcidentesPage />)
  expect(html).toContain('Pessoa Teste'); expect(html).toContain('Manutenção')
  expect(html).toContain('Registrar acidente'); expect(html).toContain('Editar acidente'); expect(html).toContain('Anular registro')
  expect(html).toContain('Pirâmide de Bird')
})

it('operacional reads without write controls', () => {
  auth.profile.role = 'operacional'
  const html = render(<AcidentesPage />)
  expect(html).toContain('Pessoa Teste'); expect(html).toContain('Ver acidente')
  expect(html).not.toContain('Registrar acidente'); expect(html).not.toContain('Editar acidente'); expect(html).not.toContain('Anular registro')
})

it.each(['admin', 'superadmin'])('%s sees no operational accident records', role => {
  auth.profile.role = role
  const html = render(<AcidentesPage />)
  expect(html).toContain('restritos'); expect(html).not.toContain('Pessoa Teste')
})

it('annulled records are hidden by default and never editable', () => {
  qc.setQueryData([...qk.acidentes.list('own'), 'actor', true], [{ ...row, anulado_em: '2026-03-11T00:00:00Z' }])
  const html = render(<AcidentesPage />)
  expect(html).toContain('Nenhum acidente encontrado'); expect(html).not.toContain('Editar acidente')
})

it('a company without the feature sees a clear message, not an error', () => {
  const key = [...qk.acidentes.list('own'), 'actor', true]
  qc.getQueryCache().find({ queryKey: key })?.setState({ status: 'error', error: new ApiError(403, 'feature_not_enabled', 'Recurso indisponível para esta conta.') })
  expect(render(<AcidentesPage />)).toContain('não habilitado')
})

it('error state distinguishes failure from an empty list', () => {
  const key = [...qk.acidentes.list('own'), 'actor', true]
  qc.getQueryCache().find({ queryKey: key })?.setState({ status: 'error', error: new Error('API indisponível') })
  expect(render(<AcidentesPage />)).toContain('API indisponível')
})

function Consumer() { const q = useAcidentes(); return <span>{q.data?.length ?? 0}</span> }
it('role changes cannot expose cached accident data through disabled hooks', () => {
  expect(render(<Consumer />)).toContain('1')
  auth.profile.role = 'admin'
  expect(render(<Consumer />)).toContain('0')
})

it('response parser rejects malformed eSocial codes', () => {
  expect(acidenteListSchema.parse(row).codigo_parte_atingida).toBe('753030000')
  expect(() => acidenteListSchema.parse({ ...row, codigo_parte_atingida: '123' })).toThrow()
})
