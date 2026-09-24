import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryKeys'
import { handleSupabaseError } from '@/lib/errors'
import type { UserProfile } from '@/types/database'

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  /** true enquanto a sessão inicial está sendo carregada */
  loading: boolean
  /** true enquanto o profile do usuário logado está sendo carregado */
  profileLoading: boolean
  /** true se a sessão existe mas o profile não pôde ser carregado ou está inativo */
  profileError: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

async function fetchProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar seu perfil.')
  return data as UserProfile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  const profileQuery = useQuery({
    queryKey: qk.auth.profile(userId),
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  })

  const profile = profileQuery.data ?? null
  const profileLoading = !!userId && profileQuery.isLoading
  const profileError = !!userId && (profileQuery.isError || (!!profile && !profile.active))

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile: profileError ? null : profile,
        loading,
        profileLoading,
        profileError,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
