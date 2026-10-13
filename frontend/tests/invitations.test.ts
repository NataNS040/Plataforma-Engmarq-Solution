import { describe, expect, it, vi } from 'vitest'
vi.mock('@/services/api/client', () => ({ apiRequest: vi.fn() }))
import { apiRequest } from '@/services/api/client'
import { inviteSchema, acceptInvitation, createInvitation } from '@/services/api/convites'

describe('invitations', () => {
  it('rejects admin invitation and malformed target', () => {
    expect(inviteSchema.safeParse({ email: 'invite@example.com', full_name: 'Synthetic', role: 'admin' }).success).toBe(false)
    expect(inviteSchema.safeParse({ email: 'invite@example.com', full_name: 'Synthetic', role: 'operacional', empresa_id: 'other' }).success).toBe(false)
  })
  it('acceptance sends no tenant, role or activation payload', async () => {
    await acceptInvitation('00000000-0000-4000-8000-000000000123')
    expect(apiRequest).toHaveBeenCalledWith('/convites/00000000-0000-4000-8000-000000000123/aceitar', expect.objectContaining({ method: 'POST' }))
    expect(vi.mocked(apiRequest).mock.calls.at(-1)?.[1]).not.toHaveProperty('json')
  })
  it('creating access sends validated role without password or capability', async () => {
    await createInvitation({ email: 'invite@example.com', full_name: 'Synthetic', role: 'operacional' })
    const options = vi.mocked(apiRequest).mock.calls.at(-1)?.[1]
    expect(options?.json).toEqual({ email: 'invite@example.com', full_name: 'Synthetic', role: 'operacional' })
  })
})
