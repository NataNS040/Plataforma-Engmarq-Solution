import { afterEach, beforeEach, expect, it, vi } from 'vitest'
let script: { src?: string; async?: boolean; onload?: () => void; onerror?: () => void; remove: ReturnType<typeof vi.fn> }
const append = vi.fn()
beforeEach(() => {
  vi.resetModules();vi.useFakeTimers();append.mockReset()
  script = { remove: vi.fn() }
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', { createElement: () => script, head: { appendChild: append } })
})
afterEach(() => { vi.useRealTimers() })
it('shares one loader across StrictMode/multiple consumers and resolves the SDK',async()=>{
  const {loadCaptcha}=await import('@/modules/auth/captcha')
  const first=loadCaptcha(),second=loadCaptcha()
  expect(first).toBe(second);expect(append).toHaveBeenCalledTimes(1)
  expect(script.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
  const api={render:vi.fn(),remove:vi.fn(),reset:vi.fn()}
  vi.stubGlobal('window',{turnstile:api});script.onload!()
  expect(await first).toBe(api)
})
it('script failures allow retry instead of caching a rejected loader',async()=>{
  const {loadCaptcha}=await import('@/modules/auth/captcha')
  const first=loadCaptcha();const rejected=expect(first).rejects.toThrow('carregar')
  script.onerror!();await rejected
  expect(script.remove).toHaveBeenCalledTimes(1)
  const second=loadCaptcha();const retryRejected=expect(second).rejects.toThrow('carregar')
  script.onerror!();await retryRejected
  expect(append).toHaveBeenCalledTimes(2)
})
it('a stalled SDK times out without accepting a CAPTCHA token',async()=>{
  const {loadCaptcha}=await import('@/modules/auth/captcha')
  const result=loadCaptcha();const rejected=expect(result).rejects.toThrow('carregar')
  await vi.advanceTimersByTimeAsync(15_000);await rejected
  expect(script.remove).toHaveBeenCalled()
})
