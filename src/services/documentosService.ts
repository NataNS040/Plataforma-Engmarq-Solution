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
}

export interface DocumentoInput {
  empresa_id: string
  tipo_id: string
  titulo: string
  numero?: string | null
  emissao?: string | null   // ISO date
  vencimento?: string | null
  observacoes?: string | null
}

export async function listarDocumentos(empresaId: string): Promise<DocumentoComTipo[]> {
  const { data, error } = await supabase
    .from('documentos')
    .select('*, tipo:documento_tipos(*)')
    .eq('empresa_id', empresaId)
    .order('vencimento', { ascending: true, nullsFirst: false })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os documentos.')
  return (data ?? []) as unknown as DocumentoComTipo[]
}

export async function criarDocumento(input: DocumentoInput): Promise<Documento> {
  const { data, error } = await supabase
    .from('documentos')
    .insert({
      empresa_id:  input.empresa_id,
      tipo_id:     input.tipo_id,
      titulo:      input.titulo,
      numero:      input.numero ?? null,
      emissao:     input.emissao ?? null,
      vencimento:  input.vencimento ?? null,
      observacoes: input.observacoes ?? null,
      arquivo_url: null,
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

export async function deletarDocumento(id: string): Promise<void> {
  const { error } = await supabase
    .from('documentos')
    .delete()
    .eq('id', id)

  if (error) throw handleSupabaseError(error, 'Não foi possível deletar o documento.')
}
