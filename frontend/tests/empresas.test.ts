import { beforeEach, expect, it, vi } from 'vitest'
import {
  atualizarEmpresa, criarEmpresa, desativarEmpresa, listarEmpresas, obterEmpresa,
} from '@/services/empresasService'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
// Deliberately has no .from(): any return to direct database access fails these tests.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }))
const empresa = {
  id: '74455974-ed31-40ba-b8af-dc335bf59801', razao_social: 'Empresa teste',
  cnpj: '12.345.678/0001-90', setor: null, cidade: null, uf: null,
  responsavel: null, email: null, telefone: null, logo_url: null,
  status: 'ativa', created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api/v1')
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'user-jwt' } }, error: null })
})

it('preserves list and detail contracts through the authenticated API', async () => {
  const rows = [{ ...empresa, colaboradores_count: 7 }]
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(rows)).mockResolvedValueOnce(Response.json(empresa))
  vi.stubGlobal('fetch', fetchMock)
  expect(await listarEmpresas()).toEqual(rows)
  expect(await obterEmpresa(empresa.id)).toEqual(empresa)
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    'http://localhost:8000/api/v1/empresas', `http://localhost:8000/api/v1/empresas/${empresa.id}`,
  ])
  for (const [, init] of fetchMock.mock.calls) {
    expect(init.headers.get('Authorization')).toBe('Bearer user-jwt')
  }
})

it('sends creation to FastAPI and lets the server apply defaults', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(empresa, { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  const input = { razao_social: empresa.razao_social, cnpj: empresa.cnpj }
  expect(await criarEmpresa(input)).toEqual(empresa)
  expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input)
})

it('keeps partial edits and explicit nulls without sending omitted fields', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(empresa))
  vi.stubGlobal('fetch', fetchMock)
  await atualizarEmpresa(empresa.id, { cidade: null })
  expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cidade: null })
})

it('suspends using PATCH and never deletes records', async () => {
  const suspended = { ...empresa, status: 'suspensa' }
  const fetchMock = vi.fn().mockResolvedValue(Response.json(suspended))
  vi.stubGlobal('fetch', fetchMock)
  expect(await desativarEmpresa(empresa.id)).toEqual(suspended)
  expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'suspensa' })
})

it.each([403, 409, 503])('propagates API errors (%s) without falling back to Supabase', async status => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    error: { code: 'test_error', message: 'Operação recusada.', details: [] },
  }, { status }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(desativarEmpresa(empresa.id)).rejects.toMatchObject({ status, message: 'Operação recusada.' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('fails clearly when the API is not configured without issuing a request', async () => {
  vi.stubEnv('VITE_API_URL', '')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await expect(listarEmpresas()).rejects.toMatchObject({ code: 'api_not_configured' })
  expect(fetchMock).not.toHaveBeenCalled()
})
