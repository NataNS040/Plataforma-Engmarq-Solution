import { beforeEach, expect, it, vi } from 'vitest'
import { criarUsuario } from '@/services/usuariosService'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
// No functions or database API: any fallback to an Edge Function fails.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }))
const input = {
  email: 'new@example.com', password: 'test-password', full_name: 'Nome',
  role: 'gestor' as const, empresa_id: '74455974-ed31-40ba-b8af-dc335bf59801',
}
const result = { user_id: '94455974-ed31-40ba-b8af-dc335bf59801' }

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api/v1')
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'user-jwt' } }, error: null })
})

it('creates through FastAPI with the current JWT and original fields', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(result, { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await criarUsuario(input)).toEqual(result)
  const [url, options] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('http://localhost:8000/api/v1/usuarios')
  expect(options.method).toBe('POST')
  expect(options.headers.get('Authorization')).toBe('Bearer user-jwt')
  expect(JSON.parse(options.body)).toEqual(input)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it.each([401, 403, 409, 422, 500, 503])('propagates API errors (%s) without retry or fallback', async status => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    error: { code: 'creation_failed', message: 'Falha ao criar usuário.', details: [] },
  }, { status }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(criarUsuario(input)).rejects.toMatchObject({ status, code: 'creation_failed', message: 'Falha ao criar usuário.' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('does not send a password without an authenticated session', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null })
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await expect(criarUsuario(input)).rejects.toMatchObject({ status: 401 })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects an incompatible response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})))
  await expect(criarUsuario(input)).rejects.toMatchObject({ code: 'invalid_response' })
})
