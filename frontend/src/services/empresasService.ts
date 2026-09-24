import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'

// Compatibility facade: keep existing hooks, imports and query invalidations.
export {
  listarEmpresas,
  obterEmpresa,
  criarEmpresa,
  atualizarEmpresa,
  desativarEmpresa,
  type EmpresaStatus,
  type EmpresaComContagem,
  type EmpresaInput,
} from './api/empresas'

// Existing Storage upload remains outside the migrated database operations.
export async function uploadEmpresaLogo(empresaId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${empresaId}/logo.${ext}`

  const { error } = await supabase.storage
    .from('logos')
    .upload(path, file, { cacheControl: '3600', upsert: true })

  if (error) throw handleSupabaseError(error, 'Não foi possível fazer o upload da logo.')

  const { data } = supabase.storage.from('logos').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
