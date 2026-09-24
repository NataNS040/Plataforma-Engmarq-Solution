import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/services/api/client'
import { getMe } from '@/services/api/auth'
import { installApiDevtools } from '@/services/api/devtools'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }))

const me = {
  id: 'cde82aba-f063-40f2-81b6-ceab59e543ed', email: 'user@example.com',
  full_name: 'Test User', role: 'empresa',
  empresa_id: '74455974-ed31-40ba-b8af-dc335bf59801', active: true,
}
const session = (token: string) => ({ data: { session: { access_token: token } }, error: null })

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api/v1/')
  getSession.mockReset().mockResolvedValue(session('test-token'))
})

describe('API client', () => {
  it('uses the configured base URL and the existing Supabase session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(me))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getMe()).toEqual(me)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://localhost:8000/api/v1/me')
    expect(init.headers.get('Authorization')).toBe('Bearer test-token')
    expect(init.headers.get('Accept')).toBe('application/json')
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('error')
    expect(init.cache).toBe('no-store')
    expect(String(url)).not.toContain('test-token')
  })

  it('reads the current token on every request, including after refresh', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(me)))
    vi.stubGlobal('fetch', fetchMock)
    getSession.mockResolvedValueOnce(session('old-token')).mockResolvedValueOnce(session('new-token'))
    await getMe()
    await getMe()
    expect(fetchMock.mock.calls.map(([, init]) => init.headers.get('Authorization')))
      .toEqual(['Bearer old-token', 'Bearer new-token'])
  })

  it('does not call the API when logged out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(getMe()).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sanitizes session retrieval errors', async () => {
    vi.stubGlobal('fetch', vi.fn())
    getSession.mockRejectedValue(new Error('sensitive-session-value'))
    await expect(getMe()).rejects.toMatchObject({ code: 'unauthorized', message: 'Faça login para acessar a API.' })
  })

  it('fails on missing configuration only when calling the API', async () => {
    vi.stubEnv('VITE_API_URL', '')
    await expect(getMe()).rejects.toMatchObject({ code: 'api_not_configured' })
  })

  it.each(['//evil.example/me', 'https://evil.example/me', '/../outside', '/\\evil.example'])(
    'rejects a path that could escape the configured API: %s', async path => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiRequest(path)).rejects.toMatchObject({ code: 'invalid_api_path' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([401, 403, 422, 503])('preserves the standard error envelope for HTTP %s', async status => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: {
      code: 'test_error', message: 'Safe message', details: [{ field: 'body.name', code: 'missing' }],
    } }, { status }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getMe()).rejects.toMatchObject({ status, code: 'test_error', message: 'Safe message',
      details: [{ field: 'body.name', code: 'missing' }] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not expose raw gateway error pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>sensitive details</html>', { status: 502 })))
    await expect(getMe()).rejects.toMatchObject({ status: 502, code: 'http_502',
      message: 'Não foi possível concluir a solicitação à API.' })
  })

  it('validates successful response contracts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'invalid' })))
    await expect(getMe()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects malformed successful JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy page</html>')))
    await expect(getMe()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('supports JSON bodies and empty 204 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiRequest<void>('/example', { method: 'POST', json: { name: 'test' } })).resolves.toBeUndefined()
    const init = fetchMock.mock.calls[0][1]
    expect(init.body).toBe('{"name":"test"}')
    expect(init.headers.get('Content-Type')).toBe('application/json')
  })

  it('normalizes network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getMe()).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('cancels timed-out requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    await expect(apiRequest('/me', { timeoutMs: 5 })).rejects.toMatchObject({ code: 'timeout' })
  })

  it('does not send a request after cancellation', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    await expect(getMe(controller.signal)).rejects.toMatchObject({ code: 'aborted' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('installs the manual probe only in development, without making requests', () => {
    const windowMock: { engmarqApi: Window['engmarqApi'] } = { engmarqApi: undefined }
    vi.stubGlobal('window', windowMock)
    vi.stubEnv('DEV', false)
    installApiDevtools()
    expect(windowMock.engmarqApi).toBeUndefined()
    vi.stubEnv('DEV', true)
    installApiDevtools()
    expect(windowMock.engmarqApi?.me).toBe(getMe)
    expect(getSession).not.toHaveBeenCalled()
  })
})
