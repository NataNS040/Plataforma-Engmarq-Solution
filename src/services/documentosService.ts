import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { Documento, DocumentoTipo } from '@/types/database'

// ---------------------------------------------------------------------------
// Documento Tipos (catálogo global, pré-populado por seed)
// ---------------------------------------------------------------------------
export async function listarDocumentoTipos(): Promise<DocumentoTipo[]> {
  const { data, error } = await supabase
    .from('documento_tipos')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os tipos de documento.')
  return (data ?? []) as DocumentoTipo[]
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------
export interface DocumentoComTipo extends Omit<Documento, 'tipo'> {
  tipo: DocumentoTipo | null
  colaborador?: { id: string; nome: string } | null
}

export interface DocumentoInput {
  empresa_id: string
  tipo_id: string
  titulo: string
  numero?: string | null
  emissao?: string | null   // ISO date
  vencimento?: string | null
  observacoes?: string | null
  arquivo_url?: string | null
  colaborador_id?: string | null
}

const DOCUMENTO_SELECT = `*, tipo:documento_tipos(*), colaborador:colaboradores(id, nome)`

export async function listarDocumentos(empresaId: string): Promise<DocumentoComTipo[]> {
  const { data, error } = await supabase
    .from('documentos')
    .select(DOCUMENTO_SELECT)
    .eq('empresa_id', empresaId)
    .order('vencimento', { ascending: true, nullsFirst: false })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os documentos.')
  return (data ?? []) as unknown as DocumentoComTipo[]
}

export async function listarDocumentosDoColaborador(colaboradorId: string): Promise<DocumentoComTipo[]> {
  const { data, error } = await supabase
    .from('documentos')
    .select(DOCUMENTO_SELECT)
    .eq('colaborador_id', colaboradorId)
    .order('vencimento', { ascending: true, nullsFirst: false })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os documentos do colaborador.')
  return (data ?? []) as unknown as DocumentoComTipo[]
}

// Resolução estável de tipo_id por nome exato do catálogo — em vez de regex
// sobre o nome (frágil, com fallback silencioso pro primeiro tipo em ordem
// alfabética quando não achava nada). Mesmo padrão de getOrCreateAsoTipoId()
// em examesService.ts.
export async function getTipoIdPorNome(nome: string): Promise<string> {
  const { data, error } = await supabase
    .from('documento_tipos')
    .select('id')
    .ilike('nome', nome)
    .limit(1)
    .single()
  if (error || !data) throw new Error(`Tipo de documento "${nome}" não encontrado no banco. Execute a migration 010 para corrigir.`)
  return data.id as string
}

export async function criarDocumento(input: DocumentoInput): Promise<Documento> {
  const { data, error } = await supabase
    .from('documentos')
    .insert({
      empresa_id:     input.empresa_id,
      tipo_id:        input.tipo_id,
      titulo:         input.titulo,
      numero:         input.numero ?? null,
      emissao:        input.emissao ?? null,
      vencimento:     input.vencimento ?? null,
      observacoes:    input.observacoes ?? null,
      arquivo_url:    input.arquivo_url ?? null,
      colaborador_id: input.colaborador_id ?? null,
    })
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível criar o documento.')
  return data as Documento
}

export async function atualizarDocumento(
  id: string,
  input: Partial<Omit<DocumentoInput, 'empresa_id'>>
): Promise<Documento> {
  const { data, error } = await supabase
    .from('documentos')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar o documento.')
  return data as Documento
}

// Bucket 'documentos' deve estar criado no Supabase Storage (Dashboard → Storage → New bucket)
export async function uploadDocumentoArquivo(empresaId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${empresaId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('documentos')
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error) throw handleSupabaseError(error, 'Não foi possível fazer o upload do arquivo.')

  const { data } = supabase.storage.from('documentos').getPublicUrl(path)
  return data.publicUrl
}

export async function deletarDocumento(id: string): Promise<void> {
  const { error } = await supabase
    .from('documentos')
    .delete()
    .eq('id', id)

  if (error) throw handleSupabaseError(error, 'Não foi possível deletar o documento.')
}
