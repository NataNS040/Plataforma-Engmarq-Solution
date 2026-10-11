import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ session:null,loading:false,signOut:vi.fn() }) }))
import RecoveryPage from '@/modules/auth/RecoveryPage'
import PasswordResetPage from '@/modules/auth/PasswordResetPage'
it('recovery offers resend and password recovery, safe reserved CNPJ instructions and configured support',()=>{
  vi.stubEnv('VITE_AUTH_CAPTCHA_REQUIRED','true');vi.stubEnv('VITE_SUPPORT_EMAIL','support@example.test')
  const html=renderToStaticMarkup(<MemoryRouter><RecoveryPage /></MemoryRouter>)
  expect(html).toContain('Reenviar confirmação');expect(html).toContain('Recuperar minha senha')
  expect(html).toContain('não é liberado automaticamente');expect(html).toContain('mailto:support@example.test')
  expect(html).toContain('disabled=""')
})
it('password reset without a session cannot render an enabled password submission',()=>{
  const html=renderToStaticMarkup(<MemoryRouter><PasswordResetPage /></MemoryRouter>)
  expect(html).toContain('link expirou');expect(html).not.toContain('id="reset-password"')
})
