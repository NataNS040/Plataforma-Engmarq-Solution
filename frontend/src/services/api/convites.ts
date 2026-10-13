import { z } from 'zod'
import { apiRequest } from './client'

export const invitationsEnabled = import.meta.env.VITE_USER_INVITATIONS_ENABLED === 'true'
export const inviteSchema = z.object({
  email: z.email('Informe um e-mail válido'), full_name: z.string().trim().min(2).max(150),
  role: z.enum(['gestor', 'operacional']), empresa_id: z.uuid().optional(),
})
const detail = z.object({
  id: z.uuid(), email: z.string(), full_name: z.string(), invited_role: z.enum(['gestor', 'operacional']),
  state: z.enum(['pending', 'expired', 'accepted', 'cancelled', 'failed']), expires_at: z.string(), user_id: z.uuid().nullable(),
})
export type Invitation = z.infer<typeof detail>
export const createInvitation = (values: z.infer<typeof inviteSchema>) => apiRequest('/convites', {
  method: 'POST', json: inviteSchema.parse(values), parse: data => z.object({ invitation_id: z.uuid() }).parse(data),
})
export const listInvitations = (company?: string) => apiRequest(`/convites${company ? `?empresa_id=${encodeURIComponent(z.uuid().parse(company))}` : ''}`, {
  parse: data => z.array(detail).parse(data),
})
export const cancelInvitation = (id: string) => apiRequest(`/convites/${z.uuid().parse(id)}/cancelar`, { method: 'POST' })
export const acceptInvitation = (id: string) => apiRequest(`/convites/${z.uuid().parse(id)}/aceitar`, {
  method: 'POST', parse: data => z.object({ empresa_id: z.uuid() }).parse(data),
})
