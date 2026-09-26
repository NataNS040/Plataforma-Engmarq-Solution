import { z } from 'zod'
import type { UserRole } from '@/types/database'
import { apiRequest } from './client'

export interface UsuarioCreateInput {
  email: string
  password: string
  full_name: string
  role: UserRole
  empresa_id: string
}

const responseSchema = z.object({ user_id: z.uuid() })

export function postUsuario(input: UsuarioCreateInput) {
  return apiRequest('/usuarios', {
    method: 'POST', json: input, parse: data => responseSchema.parse(data),
  })
}

export interface UsuarioInput {
  role?: UserRole
  active?: boolean
}

const usuarioSchema = z.object({
  id: z.uuid(), email: z.string(), full_name: z.string(),
  role: z.enum(['admin', 'gestor', 'operacional', 'empresa']),
  empresa_id: z.uuid(), active: z.boolean(), created_at: z.string(),
})

export function getUsuarios(empresaId: string) {
  return apiRequest(`/usuarios?${new URLSearchParams({ empresa_id: empresaId })}`, {
    parse: data => z.array(usuarioSchema).parse(data),
  })
}

export function getUsuario(id: string) {
  return apiRequest(`/usuarios/${encodeURIComponent(id)}`, { parse: data => usuarioSchema.parse(data) })
}

export function patchUsuario(id: string, input: UsuarioInput) {
  return apiRequest(`/usuarios/${encodeURIComponent(id)}`, {
    method: 'PATCH', json: input, parse: data => usuarioSchema.parse(data),
  })
}
