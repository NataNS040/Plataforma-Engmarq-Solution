import { beforeEach, expect, it, vi } from 'vitest'
import { buscarKpis } from '@/services/dashboardService'
import { listarDocumentos } from '@/services/documentosService'
import { listarAsos } from '@/services/examesService'
import { listarFichasEpi } from '@/services/fichasEpiService'

const { from, query, result } = vi.hoisted(() => {
  const result = { data: [] as unknown[], count: 7, error: null }
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'order', 'is', 'not']) query[method] = vi.fn(() => query)
  query.then = vi.fn((resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)))
  return { from: vi.fn(() => query), query, result }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from } }))

beforeEach(() => {
  from.mockClear()
  for (const fn of Object.values(query)) fn.mockClear()
  result.data = []
})

it('global admin dashboard has unavailable employee count and never selects colaboradores', async () => {
  const kpis = await buscarKpis('all')
  expect(kpis.totalColaboradores).toBeNull()
  expect(kpis.totalTreinamentos).toBeNull()
  expect(kpis.treinamentosVencidos).toBeNull()
  expect(from.mock.calls.flat()).not.toContain('treinamentos')
  expect(from.mock.calls.flat()).not.toContain('colaboradores')
  expect(from.mock.calls.flat()).not.toContain('treinamentos')
  expect(kpis.totalEmpresas).toBe(7)
})

it('admin company-specific dashboard also avoids employee SELECT', async () => {
  expect((await buscarKpis('company', false)).totalColaboradores).toBeNull()
  expect(from.mock.calls.flat()).not.toContain('colaboradores')
})

it('tenant dashboard keeps own employee count', async () => {
  expect((await buscarKpis('own')).totalColaboradores).toBe(7)
  expect(from).toHaveBeenCalledWith('colaboradores')
  expect(query.eq).toHaveBeenCalledWith('empresa_id', 'own')
})

it('admin company documents omit employee join and request only unassigned records', async () => {
  expect(await listarDocumentos('company', true)).toEqual([])
  expect(query.select).toHaveBeenCalledWith('*, tipo:documento_tipos(*)')
  expect(query.is).toHaveBeenCalledWith('colaborador_id', null)
})

it.each([listarDocumentos, listarAsos, listarFichasEpi])(
  'tenant consumer tolerates a null employee relation without an inner join or extra employee query', async list => {
    result.data = [{ id: 'record', colaborador: null }]
    expect(await list('own')).toEqual(result.data)
    expect(from.mock.calls.flat()).not.toContain('colaboradores')
    expect(query.select.mock.calls.some(([select]) => String(select).includes('colaborador:colaboradores(id, nome)'))).toBe(true)
    expect(query.select.mock.calls.every(([select]) => !String(select).includes('!inner'))).toBe(true)
  },
)
