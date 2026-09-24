import { Navigate, useLocation } from 'react-router-dom'
import { AlertTriangle, LogOut } from 'lucide-react'
import { useAuth } from './AuthProvider'
import type { UserRole } from '@/types/database'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

function FullScreenSpinner() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-bg">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
    </div>
  )
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, loading, profileLoading, profileError, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenSpinner />

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (profileLoading) return <FullScreenSpinner />

  if (profileError || !profile) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg p-6">
        <div className="max-w-md w-full bg-surface rounded-2xl shadow-lg border border-border p-8 text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-warning-soft flex items-center justify-center">
            <AlertTriangle size={22} className="text-warning" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Conta indisponível</h2>
          <p className="text-sm text-text-secondary mb-6">
            Sua conta não está vinculada a uma empresa ativa ou foi desativada. Entre em
            contato com o administrador para regularizar seu acesso.
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
