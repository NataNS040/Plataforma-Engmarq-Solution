import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
import SignupPage from '@/modules/auth/SignupPage'
it('renders company identification, free quota, login link and keeps unconfigured signup disabled', () => {
  vi.stubEnv('VITE_PUBLIC_SIGNUP_ENABLED', 'false')
  const html = renderToStaticMarkup(<MemoryRouter><SignupPage /></MemoryRouter>)
  expect(html).toContain('Plano gratuito — até 100 colaboradores ativos')
  for (const field of ['razao_social','cnpj','full_name','email','password','confirmation']) expect(html).toContain(`signup-${field}`)
  expect(html).toContain('href="/login"')
  expect(html).toContain('disabled=""')
  expect(html).toContain('estará disponível em breve')
})
