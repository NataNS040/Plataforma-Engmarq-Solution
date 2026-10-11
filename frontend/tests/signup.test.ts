import { beforeEach, describe, expect, it, vi } from 'vitest'
const signUp = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signUp } } }))
import { signupCompany, signupSchema, validCnpj } from '@/modules/auth/signup'
const values = { razao_social: 'Nova Empresa', cnpj: '33.000.167/0001-01', full_name: 'Administrador Empresa', email: 'admin@example.test', password: 'senha-segura-123', confirmation: 'senha-segura-123' }
beforeEach(() => { vi.stubGlobal('window', { location: { origin: 'https://norveo.com.br' } }); signUp.mockReset() })
describe('public company signup', () => {
  it('validates numeric and alphanumeric CNPJ, passwords and identification', () => {
    expect(validCnpj(values.cnpj)).toBe(true)
    expect(validCnpj('00.000.000/E08G-12')).toBe(true)
    expect(validCnpj('11.111.111/1111-11')).toBe(false)
    expect(signupSchema.safeParse({ ...values, confirmation: 'different' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...values, full_name: '' }).success).toBe(false)
  })
  it('uses public Auth, forwards CAPTCHA and only identification metadata, with the active domain callback', async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null })
    expect(await signupCompany(values,'captcha')).toEqual({ session: null })
    const request = signUp.mock.calls[0][0]
    expect(request.options.captchaToken).toBe('captcha')
    expect(new URL(request.options.emailRedirectTo).origin).toBe('https://norveo.com.br')
    expect(request.options.data).toEqual({ norveo_signup: { version: '1', razao_social: values.razao_social, cnpj: values.cnpj, full_name: values.full_name } })
    expect(request.options.data).not.toHaveProperty('role')
  })
  it('returns session for immediate dashboard navigation when email confirmation is disabled', async () => {
    const session = { access_token: 'synthetic' }
    signUp.mockResolvedValue({ data: { session }, error: null })
    expect((await signupCompany(values)).session).toBe(session)
  })
  it('handles duplicate signup, rate limits and provisioning failures without leaking database details', async () => {
    for (const error of [{ status: 429 }, { code: 'user_already_exists' }, { message: 'internal database details' }]) {
      signUp.mockResolvedValue({ data: {}, error })
      await expect(signupCompany(values)).rejects.toThrow()
      await expect(signupCompany(values)).rejects.not.toThrow('internal database details')
    }
  })
})
