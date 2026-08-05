import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { TreinamentoTipo, MatrizTreinamento, Treinamento, TreinamentoModalidade } from '@/types/database'

// ---------------------------------------------------------------------------
// Treinamento Tipos (catálogo global)
// ---------------------------------------------------------------------------
export async function listarTreinamentoTipos(): Promise<TreinamentoTipo[]> {
  const { data, error } = await supabase
    .from('treinamento_tipos')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os tipos de treinamento.')
  return (data ?? []) as TreinamentoTipo[]
}

// ---------------------------------------------------------------------------
// Matriz de treinamentos (obrigações por função × empresa)
// ---------------------------------------------------------------------------
export interface MatrizTreinamentoComDetalhes extends Omit<MatrizTreinamento, 'funcao' | 'treinamento_tipo'> {
  funcao: { id: string; nome: string } | null
  treinamento_tipo: TreinamentoTipo | null
}

export async function listarMatrizTreinamentos(empresaId: string): Promise<MatrizTreinamentoComDetalhes[]> {
  const { data, error } = await supabase
    .from('matriz_treinamentos')
    .select('*, funcao:funcoes(id, nome), treinamento_tipo:treinamento_tipos(*)')
    .eq('empresa_id', empresaId)
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar a matriz de treinamentos.')
  return (data ?? []) as unknown as MatrizTreinamentoComDetalhes[]
}

export interface MatrizInput {
  empresa_id: string
  funcao_id: string
  treinamento_tipo_id: string
  obrigatorio: boolean
}

export async function criarMatrizTreinamento(input: MatrizInput): Promise<MatrizTreinamento> {
  const { data, error } = await supabase
    .from('matriz_treinamentos')
    .insert({ ...input } as never)
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível criar a entrada na matriz.')
  return data as MatrizTreinamento
}

export async function deletarMatrizTreinamento(id: string): Promise<void> {
  const { error } = await supabase.from('matriz_treinamentos').delete().eq('id', id)
  if (error) throw handleSupabaseError(error, 'Não foi possível remover a entrada da matriz.')
}

// ---------------------------------------------------------------------------
// Treinamentos (registros individuais por colaborador)
// ---------------------------------------------------------------------------
export interface TreinamentoComDetalhes extends Omit<Treinamento, 'colaborador' | 'treinamento_tipo'> {
  colaborador: { id: string; nome: string } | null
  treinamento_tipo: TreinamentoTipo | null
}

export async function listarTreinamentos(empresaId: string): Promise<TreinamentoComDetalhes[]> {
  const { data, error } = await supabase
    .from('treinamentos')
    .select('*, colaborador:colaboradores(id, nome), treinamento_tipo:treinamento_tipos(*)')
    .eq('empresa_id', empresaId)
    .order('data_vencimento', { ascending: true, nullsFirst: false })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os treinamentos.')
  return (data ?? []) as unknown as TreinamentoComDetalhes[]
}

export async function listarTreinamentosDoColaborador(
  colaboradorId: string
): Promise<TreinamentoComDetalhes[]> {
  const { data, error } = await supabase
    .from('treinamentos')
    .select('*, colaborador:colaboradores(id, nome), treinamento_tipo:treinamento_tipos(*)')
    .eq('colaborador_id', colaboradorId)
    .order('data_vencimento', { ascending: true, nullsFirst: false })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os treinamentos.')
  return (data ?? []) as unknown as TreinamentoComDetalhes[]
}

export interface TreinamentoInput {
  empresa_id: string
  colaborador_id: string
  treinamento_tipo_id: string
  data_realizacao: string    // ISO date
  data_vencimento?: string | null
  carga_horaria?: number | null
  instrutor?: string | null
  modalidade?: TreinamentoModalidade | null
}

export async function registrarTreinamento(input: TreinamentoInput): Promise<Treinamento> {
  const { data, error } = await supabase
    .from('treinamentos')
    .insert({
      empresa_id:          input.empresa_id,
      colaborador_id:      input.colaborador_id,
      treinamento_tipo_id: input.treinamento_tipo_id,
      data_realizacao:     input.data_realizacao,
      data_vencimento:     input.data_vencimento ?? null,
      carga_horaria:       input.carga_horaria ?? null,
      instrutor:           input.instrutor ?? null,
      modalidade:          input.modalidade ?? null,
      certificado_url:     null,
    })
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível registrar o treinamento.')
  return data as Treinamento
}

export async function atualizarTreinamento(
  id: string,
  input: Partial<Omit<TreinamentoInput, 'empresa_id'>>
): Promise<Treinamento> {
  const { data, error } = await supabase
    .from('treinamentos')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar o treinamento.')
  return data as Treinamento
}
