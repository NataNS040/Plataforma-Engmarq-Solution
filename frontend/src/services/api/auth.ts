import { z } from 'zod'
import { apiRequest } from './client'

const meSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  full_name: z.string(),
  role: z.enum(['admin', 'gestor', 'operacional', 'empresa']),
  empresa_id: z.uuid(),
  active: z.literal(true),
})

export type CurrentApiUser = z.infer<typeof meSchema>

export function getMe(signal?: AbortSignal): Promise<CurrentApiUser> {
  return apiRequest('/me', { signal, parse: data => meSchema.parse(data) })
}
