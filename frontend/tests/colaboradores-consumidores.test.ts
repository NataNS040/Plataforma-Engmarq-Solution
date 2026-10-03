import { beforeEach, expect, it, vi } from 'vitest'
import { buscarKpis } from '@/services/dashboardService'
import { apiRequest } from '@/services/api/client'
import { listarDocumentos } from '@/services/documentosService'
import { listarAsos } from '@/services/examesService'
import { listarFichasEpi } from '@/services/fichasEpiService'

const { from, query, result } = vi.hoisted(() => {
  const result = { data: [] as unknown[], count: 7, error: null }
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'order', 'is', 'not', 'neq', 'ilike', 'limit']) query[method] = vi.fn(() => query)
  query.single = vi.fn(() => Promise.resolve({ data: { id: 'aso-type' }, error: null }))
  query.then = vi.fn((resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)))
  return { from: vi.fn(() => query), query, result }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from } }))
vi.mock('@/services/api/client', () => ({ apiRequest: vi.fn() }))

beforeEach(() => {
  from.mockClear()
  for (const fn of Object.values(query)) fn.mockClear()
  result.data = []
  vi.mocked(apiRequest).mockReset().mockResolvedValue({ totalColaboradores: null,
    totalTreinamentos: null, treinamentosVencidos: null, totalEmpresas: 7 })
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

it('admin tenant-specific dashboard propagates server denial without employee SELECT', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('403'))
  await expect(buscarKpis('74455974-ed31-40ba-b8af-dc335bf59801', false)).rejects.toThrow('403')
  expect(from.mock.calls.flat()).not.toContain('colaboradores')
})

it('tenant dashboard keeps own employee count', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ totalColaboradores: 7 })
  expect((await buscarKpis('74455974-ed31-40ba-b8af-dc335bf59801')).totalColaboradores).toBe(7)
  expect(from).not.toHaveBeenCalled()
  expect(apiRequest).toHaveBeenCalledWith('/dashboard/kpis?scope=74455974-ed31-40ba-b8af-dc335bf59801',expect.any(Object))
})

it('admin company documents omit employee join and request only unassigned records', async () => {
  expect(await listarDocumentos('company', true)).toEqual([])
  expect(query.select).toHaveBeenCalledWith('*, tipo:documento_tipos(*)')
  expect(query.is).toHaveBeenCalledWith('colaborador_id', null)
  expect(query.neq).toHaveBeenCalledWith('tipo_id', 'aso-type')
})

it.each([listarDocumentos, listarFichasEpi])(
  'tenant consumer tolerates a null employee relation without an inner join or extra employee query', async list => {
    result.data = [{ id: 'record', colaborador: null }]
    expect(await list('own')).toEqual(result.data)
    expect(from.mock.calls.flat()).not.toContain('colaboradores')
    expect(query.select.mock.calls.some(([select]) => String(select).includes('colaborador:colaboradores(id, nome)'))).toBe(true)
    expect(query.select.mock.calls.every(([select]) => !String(select).includes('!inner'))).toBe(true)
  },
)

it('ASO consumer uses FastAPI rather than selecting all employee documents', async () => {
  vi.mocked(apiRequest).mockResolvedValue([])
  expect(await listarAsos('own')).toEqual([])
  expect(apiRequest).toHaveBeenCalledWith('/exames',expect.any(Object))
  expect(from).not.toHaveBeenCalled()
})
