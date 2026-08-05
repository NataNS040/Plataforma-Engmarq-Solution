import { useAuth } from '@/modules/auth/AuthProvider'
import type { UserRole } from '@/types/database'

/**
 * Fonte única de contexto do usuário logado.
 * Usar dentro de páginas/componentes autenticados (após ProtectedRoute).
 */
export function useCurrentProfile() {
  const { profile, profileLoading, profileError } = useAuth()

  const role = profile?.role ?? null
  const empresaId = profile?.empresa_id ?? null

  return {
    profile,
    empresaId,
    role,
    isAdmin: role === 'admin',
    isGestor: role === 'gestor',
    isOperacional: role === 'operacional',
    isEmpresa: role === 'empresa',
    canWrite: role === 'admin' || role === 'gestor' || role === 'empresa',
    loading: profileLoading,
    error: profileError,
  }
}

export function hasRole(role: UserRole | null, allowed: UserRole[]) {
  return !!role && allowed.includes(role)
}
