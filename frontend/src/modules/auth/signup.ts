import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { authCallback } from './recovery'

export function validCnpj(raw: string): boolean {
  const value = raw.trim().toUpperCase()
  if (!/^([A-Z0-9]{12}[0-9]{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-[0-9]{2})$/.test(value)) return false
  const c = value.replace(/[./-]/g, '')
  if (c === c[0].repeat(14)) return false
  const digit = (weights: number[]) => {
    const sum = weights.reduce((n, w, i) => n + (c.charCodeAt(i) - 48) * w, 0)
    return sum % 11 < 2 ? 0 : 11 - sum % 11
  }
  return Number(c[12]) === digit([5,4,3,2,9,8,7,6,5,4,3,2]) &&
    Number(c[13]) === digit([6,5,4,3,2,9,8,7,6,5,4,3,2])
}

export const signupSchema = z.object({
  razao_social: z.string().trim().min(2, 'Informe a razão social').max(200),
  cnpj: z.string().trim().refine(validCnpj, 'Informe um CNPJ válido'),
  full_name: z.string().trim().min(2, 'Informe seu nome completo').max(150),
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(12, 'Use pelo menos 12 caracteres').max(128),
  confirmation: z.string(),
}).refine(v => v.password === v.confirmation, { path: ['confirmation'], message: 'As senhas precisam ser iguais' })
export type SignupValues = z.infer<typeof signupSchema>

export async function signupCompany(values: SignupValues, captchaToken?: string) {
  const valid = signupSchema.parse(values)
  const { data, error } = await supabase.auth.signUp({
    email: valid.email, password: valid.password,
    options: {
      emailRedirectTo: authCallback('login'),
      captchaToken,
      data: { norveo_signup: { version: '1', razao_social: valid.razao_social,
        cnpj: valid.cnpj, full_name: valid.full_name } },
    },
  })
  if (error) {
    if (error.status === 429) throw new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.')
    if (error.code === 'captcha_failed') throw new Error('Não foi possível validar a verificação de segurança. Tente novamente.')
    if (error.code === 'user_already_exists') throw new Error('Não foi possível cadastrar. Se você já tem conta, faça login.')
    throw new Error('Não foi possível concluir o cadastro. O cadastro público pode estar indisponível ou os dados já podem estar reservados. Use Recuperar acesso para reenviar a confirmação ou contate o suporte. Não tente assumir outra empresa.')
  }
  // Auth may conceal duplicate email with a synthetic user; never promise provisioning.
  return { session: data.session }
}
