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

const logoExtensions: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
}
const logoTenantPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Private Storage: persist a stable bucket/path, never a public or signed URL.
export async function uploadEmpresaLogo(empresaId: string, file: File): Promise<string> {
  const ext = logoExtensions[file.type]
  if (!logoTenantPattern.test(empresaId) || !ext || file.size === 0 || file.size > 2097152) {
    throw new Error('Selecione uma imagem PNG, JPEG ou WebP de até 2 MB.')
  }
  const path = `${empresaId}/logo.${ext}`

  const { error } = await supabase.storage
    .from('logos')
    .upload(path, file, { cacheControl: '0', contentType: file.type, upsert: true })

  if (error) throw handleSupabaseError(error, 'Não foi possível fazer o upload da logo.')

  return `logos/${path}`
}

export async function downloadEmpresaLogo(empresaId: string, reference: string): Promise<Blob> {
  if (!logoTenantPattern.test(empresaId)
    || !new RegExp(`^logos/${empresaId}/logo\\.(png|jpg|webp)$`).test(reference)) {
    throw new Error('Referência de logo inválida para esta empresa.')
  }
  const { data, error } = await supabase.storage.from('logos').download(reference.slice('logos/'.length))
  if (error || !data) throw handleSupabaseError(error, 'Não foi possível carregar a logo.')
  return data
}
