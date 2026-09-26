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
