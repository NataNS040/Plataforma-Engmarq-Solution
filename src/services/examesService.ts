import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { Documento, DocumentoTipo, SubtipoExame } from '@/types/database'

export interface AsoComDetalhes extends Omit<Documento, 'tipo' | 'colaborador'> {
  tipo: DocumentoTipo | null
  colaborador: { id: string; nome: string } | null
}

export interface AsoInput {
  empresa_id: string
  tipo_id: string           // ID do tipo 'ASO'
  colaborador_id: string
  titulo: string            // Ex.: "ASO — João da Silva"
  subtipo_exame: SubtipoExame
  emissao?: string | null   // ISO date
  vencimento?: string | null
  numero?: string | null
  observacoes?: string | null
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

export async function criarAso(input: AsoInput): Promise<Documento> {
  const { data, error } = await supabase
    .from('documentos')
    .insert({
      empresa_id:     input.empresa_id,
      tipo_id:        input.tipo_id,
      colaborador_id: input.colaborador_id,
      titulo:         input.titulo,
      subtipo_exame:  input.subtipo_exame,
      emissao:        input.emissao ?? null,
      vencimento:     input.vencimento ?? null,
      numero:         input.numero ?? null,
      observacoes:    input.observacoes ?? null,
      arquivo_url:    null,
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
