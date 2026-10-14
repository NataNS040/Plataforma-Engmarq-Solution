// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCaptcha } from '@/modules/auth/useCaptcha'

const load = vi.hoisted(() => vi.fn())
const api = vi.hoisted(() => ({ render: vi.fn(), reset: vi.fn(), remove: vi.fn() }))
vi.mock('@/modules/auth/captcha', () => ({ loadCaptcha: load, captchaApi: () => api }))
let root: Root
let current: ReturnType<typeof useCaptcha>
let options: Record<string, unknown>
let host: HTMLDivElement

function Probe({ enabled = true }: { enabled?: boolean }) {
  current = useCaptcha(enabled)
  return <div ref={current.node}><output>{current.token ?? 'no-token'}</output></div>
}
async function mount(enabled = true) { await act(async () => { root.render(<Probe enabled={enabled} />) }) }
async function callback(name: string, value?: string) {
  await act(async () => { (options[name] as (value?: string) => void)(value) })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
  vi.stubEnv('VITE_AUTH_CAPTCHA_REQUIRED', 'true')
  load.mockReset().mockResolvedValue(api)
  api.render.mockReset().mockImplementation((_node, value) => { options = value; return 'widget' })
  api.reset.mockReset(); api.remove.mockReset()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => { root.unmount() }); host.remove(); vi.unstubAllEnvs() })

it('stores a successful token and clears it before a subsequent submission', async () => {
  await mount(); expect(current.required).toBe(true); expect(current.token).toBeUndefined()
  await callback('callback', 'synthetic-token'); expect(current.token).toBe('synthetic-token')
  await act(async () => { current.reset() })
  expect(current.token).toBeUndefined(); expect(api.reset).toHaveBeenCalledWith('widget')
})
it('discards an expired token and requires a fresh verification', async () => {
  await mount(); await callback('callback', 'expired-token'); await callback('expired-callback')
  expect(current.token).toBeUndefined(); expect(current.error).toContain('expirou')
  await callback('callback', 'fresh-token'); expect(current.token).toBe('fresh-token'); expect(current.error).toBe('')
})
it('discards tokens on provider error and timeout', async () => {
  await mount()
  for (const event of ['error-callback', 'timeout-callback']) {
    await callback('callback', 'token'); await callback(event)
    expect(current.token).toBeUndefined(); expect(current.error).not.toBe('')
  }
})
it('fails closed when CAPTCHA is required but the site key is absent', async () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
  await mount(); expect(current.required).toBe(true); expect(current.token).toBeUndefined()
  expect(current.error).toContain('não está configurada'); expect(load).not.toHaveBeenCalled()
})
it('keeps existing login/recovery free of a widget when both controls are closed', async () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', ''); vi.stubEnv('VITE_AUTH_CAPTCHA_REQUIRED', 'false')
  await mount(); expect(current.required).toBe(false); expect(load).not.toHaveBeenCalled()
})
it('does not load the widget for the closed signup page even when a key exists', async () => {
  await mount(false); expect(current.required).toBe(false); expect(load).not.toHaveBeenCalled()
})
it('reports a loader failure instead of permitting submission', async () => {
  load.mockRejectedValue(new Error('Provider unavailable'))
  await mount(); expect(current.required).toBe(true); expect(current.token).toBeUndefined()
  expect(current.error).toBe('Provider unavailable')
})

it('uses the configured production site key and compact layout in a narrow form', async () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAFWHLDhOoEvRZg7I')
  await mount()
  expect(options.sitekey).toBe('0x4AAAAAAFWHLDhOoEvRZg7I')
  expect(options.size).toBe('compact')
  expect(options.language).toBe('pt-BR')
})

it('ignores a late token from a removed widget after retry', async () => {
  await mount()
  const oldCallback = options.callback as (token: string) => void
  await act(async () => { current.retry() })
  await act(async () => { oldCallback('stale-token') })
  expect(current.token).toBeUndefined()
  await callback('callback', 'fresh-token')
  expect(current.token).toBe('fresh-token')
})
