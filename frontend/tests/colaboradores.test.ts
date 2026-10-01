import { beforeEach, expect, it, vi } from 'vitest'
import { listarColaboradores, obterColaborador, criarColaborador, atualizarColaborador,
  desativarColaborador, importarColaboradores } from '@/services/colaboradoresService'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
// Deliberately no .from(), RPC or functions fallback.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }))
const id = '94455974-ed31-40ba-b8af-dc335bf59801'
const company = '74455974-ed31-40ba-b8af-dc335bf59801'
const input = { empresa_id: company, nome: 'Pessoa Teste', cpf: '12345678901', funcao_id: id,
  setor_id: id, ambiente_id: null, data_admissao: '2025-01-01' }
const row = { ...input, id, matricula: null, active: true, data_demissao: null,
  created_at: null, funcao: { id, nome: 'Função' }, setor: { id, nome: 'Setor' }, ambiente: null }

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api/v1')
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'caller-jwt' } }, error: null })
})

it('lists and reads through FastAPI with no tenant selector and caller JWT', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([row])).mockResolvedValueOnce(Response.json(row))
  vi.stubGlobal('fetch', fetchMock)
  expect(await listarColaboradores(company)).toEqual([row])
  expect(await obterColaborador(id)).toEqual(row)
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    'http://localhost:8000/api/v1/colaboradores', `http://localhost:8000/api/v1/colaboradores/${id}`,
  ])
  for (const [, options] of fetchMock.mock.calls) expect(options.headers.get('Authorization')).toBe('Bearer caller-jwt')
})

it('creates with POST and strips client-supplied empresa_id', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(row, { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await criarColaborador({ ...input, empresa_id: 'foreign-ui-context' })).toEqual(row)
  const [url, options] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('http://localhost:8000/api/v1/colaboradores')
  expect(options.method).toBe('POST')
  const { empresa_id: _, ...expected } = input
  expect(JSON.parse(options.body)).toEqual(expected)
})

it('edits through PATCH', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...row, nome: 'Editado' }))
  vi.stubGlobal('fetch', fetchMock)
  expect((await atualizarColaborador(id, { nome: 'Editado' })).nome).toBe('Editado')
  const [url, options] = fetchMock.mock.calls[0]
  expect(String(url)).toBe(`http://localhost:8000/api/v1/colaboradores/${id}`)
  expect(options.method).toBe('PATCH')
  expect(JSON.parse(options.body)).toEqual({ nome: 'Editado' })
})

it('deactivates with one PATCH containing active=false and dismissal date', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...row, active: false, data_demissao: '2026-01-01' }))
  vi.stubGlobal('fetch', fetchMock)
  expect((await desativarColaborador(id, '2026-01-01')).active).toBe(false)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ active: false, data_demissao: '2026-01-01' })
})

it('spreadsheet import uses the same POST for each resolved row and reports partial failures', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(row, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ error: { code: 'colaborador_conflict', message: 'Duplicado' } }, { status: 409 }))
  vi.stubGlobal('fetch', fetchMock)
  const resolver = vi.fn(async (nome: string) => ({ ...input, nome }))
  expect(await importarColaboradores(['Primeiro', 'Segundo'], resolver)).toEqual({ ok: 1, fail: 1 })
  expect(resolver).toHaveBeenCalledTimes(2)
  for (const [url, options] of fetchMock.mock.calls) {
    expect(String(url)).toBe('http://localhost:8000/api/v1/colaboradores')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).not.toHaveProperty('empresa_id')
  }
})

it.each([401, 403, 404, 409, 422, 503])('API failure %s is propagated without direct database fallback', async status => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code: 'denied', message: 'Falha' } }, { status }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(criarColaborador(input)).rejects.toMatchObject({ status })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('missing session never sends employee data', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null })
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await expect(criarColaborador(input)).rejects.toMatchObject({ status: 401 })
  expect(fetchMock).not.toHaveBeenCalled()
})
