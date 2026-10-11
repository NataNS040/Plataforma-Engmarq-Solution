import { beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ resend: vi.fn(), resetPasswordForEmail: vi.fn(), getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }))
import { requestAccessRecovery, changeRecoveredPassword } from '@/modules/auth/recovery'
beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://norveo.com.br' } })
  for (const mock of Object.values(auth)) mock.mockReset()
})
it('resends confirmation to the original email via Auth without touching profile/company or leaking account state', async () => {
  auth.resend.mockResolvedValue({ error: null })
  const message = await requestAccessRecovery('same@example.test','confirmation','token')
  expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'same@example.test', options: { emailRedirectTo: expect.stringMatching(/^https:\/\/norveo.com.br\/.*login$/), captchaToken: 'token' } })
  auth.resend.mockResolvedValue({ error: { code: 'user_not_found' } })
  expect(await requestAccessRecovery('unknown@example.test','confirmation','token')).toBe(message)
  auth.resend.mockResolvedValue({ error: { code: 'email_already_confirmed' } })
  expect(await requestAccessRecovery('confirmed@example.test','confirmation','token')).toBe(message)
})
it('password request includes CAPTCHA and the reset callback and validates email before contacting Auth', async () => {
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  await requestAccessRecovery('same@example.test','password','token')
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('same@example.test',{ redirectTo: expect.stringMatching(/nova-senha$/), captchaToken: 'token' })
  await expect(requestAccessRecovery('invalid','password','token')).rejects.toThrow()
  expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)
})
it('rate limits, CAPTCHA and service failures show safe messages', async () => {
  for(const error of [{status:429},{code:'captcha_failed'},{message:'private SMTP details'}]) {
    auth.resend.mockResolvedValue({error})
    await expect(requestAccessRecovery('same@example.test','confirmation','token')).rejects.toThrow()
    await expect(requestAccessRecovery('same@example.test','confirmation','token')).rejects.not.toThrow('private SMTP details')
  }
})
it('expired recovery identity cannot update a password; a server-validated identity updates only its own password', async () => {
  const values = { password: 'long-password-123', confirmation: 'long-password-123' }
  auth.getUser.mockResolvedValue({ data: { user: null }, error: { message:'expired' } })
  await expect(changeRecoveredPassword(values)).rejects.toThrow('expirou')
  expect(auth.updateUser).not.toHaveBeenCalled()
  auth.getUser.mockResolvedValue({ data: { user: {id:'original-user'} }, error: null })
  auth.updateUser.mockResolvedValue({error:null})
  await changeRecoveredPassword(values)
  expect(auth.updateUser).toHaveBeenCalledWith({password:values.password})
  await expect(changeRecoveredPassword({...values,confirmation:'wrong'})).rejects.toThrow()
  expect(auth.updateUser).toHaveBeenCalledTimes(1)
})
