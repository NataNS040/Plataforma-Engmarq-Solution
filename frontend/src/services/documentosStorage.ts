import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export const DOCUMENTOS_BUCKET = 'documentos'
export const SIGNED_URL_SECONDS = 60
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/
const filename = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$(?![\s\S])/
const mime: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export interface DocumentoReferencia {
  arquivo_path?: string | null
  arquivo_url?: string | null
}

// Pure resolver: neither arbitrary origins nor signed URLs are object identities.
export function resolverDocumentoPath(reference: DocumentoReferencia, empresaId: string,
  storageOrigin = import.meta.env.VITE_SUPABASE_URL as string): string {
  if (!uuid.test(empresaId)) throw new Error('Empresa inválida.')
  let path = reference.arquivo_path
  if (path == null) {
    const raw = reference.arquivo_url
    if (!raw) throw new Error('Documento sem arquivo.')
    let url: URL; let origin: URL
    try { url = new URL(raw); origin = new URL(storageOrigin) }
    catch { throw new Error('Referência de arquivo inválida.') }
    const prefix = `${origin.origin}/storage/v1/object/public/${DOCUMENTOS_BUCKET}/`
    if (url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password ||
        url.search || url.hash || !raw.startsWith(prefix)) throw new Error('Referência de arquivo inválida.')
    path = raw.slice(prefix.length)
  }
  const parts = path.split('/')
  if (parts[0] !== empresaId || !((parts.length === 2 && filename.test(parts[1])) ||
      (parts.length === 3 && parts[1] === 'certificados' && filename.test(parts[2])))) {
    throw new Error('Arquivo fora da pasta autorizada.')
  }
  return path
}

async function autorizarStorage(empresaId: string, write = false): Promise<void> {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.user?.id) throw new Error('Autenticação necessária.')
  const { data: profile, error: profileError } = await supabase.from('user_profiles')
    .select('empresa_id,role,active').eq('id', session.user.id).single()
  const roles = write ? ['empresa', 'gestor'] : ['empresa', 'gestor', 'operacional']
  if (profileError || !profile?.active || profile.empresa_id !== empresaId || !roles.includes(profile.role)) {
    throw new Error('Acesso ao arquivo negado.')
  }
  // Storage RLS additionally checks the active company and the caller JWT.
}

export async function uploadArquivoPrivado(empresaId: string, file: File, certificado = false): Promise<string> {
  if (!uuid.test(empresaId)) throw new Error('Empresa inválida.')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!mime[ext] || file.size > 10485760) throw new Error('Use PDF, Word, Excel, JPG ou PNG de até 10 MB.')
  await autorizarStorage(empresaId, true)
  const path = `${empresaId}/${certificado ? 'certificados/' : ''}${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(DOCUMENTOS_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: mime[ext] })
  if (error) throw new Error('Não foi possível enviar o arquivo.')
  return path
}

export async function assinarDocumento(reference: DocumentoReferencia, empresaId: string,
  download?: string): Promise<string> {
  const path = resolverDocumentoPath(reference, empresaId)
  await autorizarStorage(empresaId)
  const bucket = supabase.storage.from(DOCUMENTOS_BUCKET)
  const { data, error } = download
    ? await bucket.createSignedUrl(path, SIGNED_URL_SECONDS, { download })
    : await bucket.createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) throw new Error('Não foi possível abrir o arquivo.')
  return data.signedUrl
}

export async function abrirDocumento(reference: DocumentoReferencia, empresaId: string,
  download?: string): Promise<void> {
  const target = window.open('about:blank', '_blank')
  if (target) target.opener = null
  try {
    const url = await assinarDocumento(reference, empresaId, download)
    if (target) target.location.replace(url)
    else window.location.assign(url)
  } catch {
    target?.close()
    toast.error('Não foi possível acessar o arquivo. Verifique sua autorização.')
  }
}
