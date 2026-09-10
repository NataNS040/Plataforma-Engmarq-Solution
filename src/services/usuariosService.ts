import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { UserProfile, UserRole } from '@/types/database'

export interface UsuarioInput {
  full_name?: string
  role?: UserRole
  active?: boolean
}

export async function listarUsuariosDaEmpresa(empresaId: string): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('full_name', { ascending: true })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar a equipe.')
  return (data ?? []) as UserProfile[]
}

export async function atualizarUsuario(id: string, input: UsuarioInput): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ ...input })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar o usuário.')
  return data as UserProfile
}
