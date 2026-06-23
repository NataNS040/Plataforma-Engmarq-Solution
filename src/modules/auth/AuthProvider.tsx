import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { UserProfile } from '@/types/database'

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// ---------------------------------------------------------------------------
// Dev bypass — apenas em `npm run dev` (import.meta.env.DEV = false em build)
// Troque o `role` para 'gestor' ou 'operacional' para testar outras views.
// ---------------------------------------------------------------------------
const DEV_MODE = import.meta.env.DEV

const DEV_PROFILE: UserProfile = {
  id: 'dev-0000-0000-0000-0000',
  email: 'admin@engmarq.com.br',
  full_name: 'Dev Admin',
  role: 'admin',
  empresa_id: 'dev-empresa-0000',
  active: true,
  created_at: new Date().toISOString(),
}

const DEV_SESSION = {
  access_token: 'dev-token',
  token_type: 'bearer',
  user: {
    id: DEV_PROFILE.id,
    email: DEV_PROFILE.email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: DEV_PROFILE.created_at,
  },
} as unknown as Session

// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(DEV_MODE ? DEV_SESSION : null)
  const [profile, setProfile] = useState<UserProfile | null>(DEV_MODE ? DEV_PROFILE : null)
  const [loading, setLoading] = useState(!DEV_MODE)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error loading profile:', error.message)
      return null
    }
    return data as UserProfile
  }

  useEffect(() => {
    if (DEV_MODE) return

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (DEV_MODE) return

    if (!session?.user) {
      setProfile(null)
      return
    }
    let cancelled = false
    loadProfile(session.user.id).then(p => {
      if (!cancelled) setProfile(p)
    })
    return () => { cancelled = true }
  }, [session?.user?.id])

  async function signOut() {
    if (DEV_MODE) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
