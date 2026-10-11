import { z } from 'zod'
import { supabase } from '@/lib/supabase'

export const recoveryEmailSchema = z.object({ email: z.email('Informe um e-mail válido') })
export const newPasswordSchema = z.object({
  password: z.string().min(12, 'Use pelo menos 12 caracteres').max(128),
  confirmation: z.string(),
}).refine(v => v.password === v.confirmation, { path: ['confirmation'], message: 'As senhas precisam ser iguais' })

export function authCallback(path: 'login' | 'nova-senha') {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.origin).href
}

function requestError(error: { status?: number; code?: string }) {
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    return new Error('Muitas tentativas. Aguarde alguns minutos antes de solicitar outro e-mail.')
  }
  if (error.code === 'captcha_failed') return new Error('Não foi possível validar a verificação de segurança. Tente novamente.')
  return new Error('Não foi possível enviar a solicitação agora. Tente novamente mais tarde ou contate o suporte.')
}

export async function requestAccessRecovery(email: string, action: 'confirmation' | 'password', captchaToken?: string) {
  const valid = recoveryEmailSchema.parse({ email })
  const result = action === 'confirmation'
    ? await supabase.auth.resend({ type: 'signup', email: valid.email,
      options: { emailRedirectTo: authCallback('login'), captchaToken } })
    : await supabase.auth.resetPasswordForEmail(valid.email, { redirectTo: authCallback('nova-senha'), captchaToken })
  // These errors reveal account state; return the same message as success.
  if (result.error && !['user_not_found','email_not_confirmed','email_already_confirmed','user_already_exists'].includes(result.error.code ?? '')) {
    throw requestError(result.error)
  }
  return 'Se houver uma conta elegível para este e-mail, você receberá as instruções. Confira também a pasta de spam.'
}

export async function changeRecoveredPassword(values: z.infer<typeof newPasswordSchema>) {
  const valid = newPasswordSchema.parse(values)
  // Server-validated identity; never trust a local session or a supplied user/company ID.
  const identity = await supabase.auth.getUser()
  if (identity.error || !identity.data.user) throw new Error('O link expirou ou a sessão é inválida. Solicite um novo e-mail de recuperação.')
  const result = await supabase.auth.updateUser({ password: valid.password })
  if (result.error) throw new Error('Não foi possível atualizar a senha. Confira a política de senha ou solicite um novo link.')
}
