import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { Documento, DocumentoTipo, ExameCatalogo, SubtipoExame } from '@/types/database'

export interface AsoComDetalhes extends Omit<Documento, 'tipo' | 'colaborador'> {
  tipo: DocumentoTipo | null
  colaborador: { id: string; nome: string } | null
}

export interface AsoInput {
  empresa_id: string
  colaborador_id: string
  titulo: string
  subtipo_exame: SubtipoExame
  emissao?: string | null
  vencimento?: string | null
  numero?: string | null
  observacoes?: string | null
  exames_realizados?: string[] | null
  arquivo_url?: string | null
  // tipo_id é resolvido automaticamente pelo serviço via upsert
  tipo_id?: string
}

/** Upload do PDF do ASO — reaproveita o bucket 'documentos' (mesmo padrão de documentosService). */
export async function uploadAsoArquivo(empresaId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'pdf'
  const path = `${empresaId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('documentos')
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error) throw handleSupabaseError(error, 'Não foi possível fazer o upload do PDF do ASO.')

  const { data } = supabase.storage.from('documentos').getPublicUrl(path)
  return data.publicUrl
}

const ASO_SELECT = `
  *,
  tipo:documento_tipos(*),
  colaborador:colaboradores(id, nome)
`

export async function listarAsos(empresaId: string): Promise<AsoComDetalhes[]> {
  const { data, error } = await supabase
    .from('documentos')
    .select(ASO_SELECT)
    .eq('empresa_id', empresaId)
    .not('colaborador_id', 'is', null)
    .order('vencimento', { ascending: true, nullsFirst: false })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os ASOs.')
  return (data ?? []) as unknown as AsoComDetalhes[]
}

export async function listarAsosDoColaborador(colaboradorId: string): Promise<AsoComDetalhes[]> {
  const { data, error } = await supabase
    .from('documentos')
    .select(ASO_SELECT)
    .eq('colaborador_id', colaboradorId)
    .order('vencimento', { ascending: true, nullsFirst: false })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os ASOs do colaborador.')
  return (data ?? []) as unknown as AsoComDetalhes[]
}

// Busca o tipo 'ASO' — sempre presente via seed da migration 001
async function getOrCreateAsoTipoId(): Promise<string> {
  const { data, error } = await supabase
    .from('documento_tipos')
    .select('id')
    .ilike('nome', 'ASO')
    .limit(1)
    .single()
  if (error || !data) throw new Error('Tipo de documento ASO não encontrado no banco. Execute a migration 001 para corrigir.')
  return data.id as string
}

export async function criarAso(input: AsoInput): Promise<Documento> {
  const tipoId = input.tipo_id ?? await getOrCreateAsoTipoId()
  const { data, error } = await supabase
    .from('documentos')
    .insert({
      empresa_id:        input.empresa_id,
      tipo_id:           tipoId,
      colaborador_id:    input.colaborador_id,
      titulo:            input.titulo,
      subtipo_exame:     input.subtipo_exame,
      emissao:           input.emissao ?? null,
      vencimento:        input.vencimento ?? null,
      numero:            input.numero ?? null,
      observacoes:       input.observacoes ?? null,
      exames_realizados: input.exames_realizados ?? [],
      arquivo_url:       input.arquivo_url ?? null,
    })
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível criar o ASO.')
  return data as Documento
}

export async function atualizarAso(
  id: string,
  input: Partial<Omit<AsoInput, 'empresa_id'>>
): Promise<Documento> {
  const { data, error } = await supabase
    .from('documentos')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar o ASO.')
  return data as Documento
}

export async function deletarAso(id: string): Promise<void> {
  const { error } = await supabase
    .from('documentos')
    .delete()
    .eq('id', id)

  if (error) throw handleSupabaseError(error, 'Não foi possível deletar o ASO.')
}

export async function listarExamesCatalogo(): Promise<ExameCatalogo[]> {
  const { data, error } = await supabase
    .from('exames_catalogo')
    .select('*')
    .order('ordem')

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar o catálogo de exames.')
  return (data ?? []) as unknown as ExameCatalogo[]
}
