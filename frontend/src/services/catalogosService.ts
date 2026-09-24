import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { Setor, Funcao, Ambiente } from '@/types/database'

// ---------------------------------------------------------------------------
// Setores
// ---------------------------------------------------------------------------
export async function listarSetores(empresaId: string): Promise<Setor[]> {
  const { data, error } = await supabase
    .from('setores')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome', { ascending: true })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os setores.')
  return (data ?? []) as Setor[]
}

export interface SetorInput {
  empresa_id: string
  nome: string
  descricao?: string | null
}

export async function criarSetor(input: SetorInput): Promise<Setor> {
  const { data, error } = await supabase
    .from('setores')
    .insert({ ...input, active: true })
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível criar o setor.')
  return data as Setor
}

export async function atualizarSetor(id: string, input: Partial<SetorInput> & { active?: boolean }): Promise<Setor> {
  const { data, error } = await supabase
    .from('setores')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar o setor.')
  return data as Setor
}

export async function desativarSetor(id: string): Promise<Setor> {
  return atualizarSetor(id, { active: false })
}

// ---------------------------------------------------------------------------
// Funções
// ---------------------------------------------------------------------------
export async function listarFuncoes(empresaId: string): Promise<Funcao[]> {
  const { data, error } = await supabase
    .from('funcoes')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome', { ascending: true })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar as funções.')
  return (data ?? []) as Funcao[]
}

export interface FuncaoInput {
  empresa_id: string
  nome: string
  descricao?: string | null
  riscos?: string | null
}

export async function criarFuncao(input: FuncaoInput): Promise<Funcao> {
  const { data, error } = await supabase
    .from('funcoes')
    .insert({ ...input, active: true })
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível criar a função.')
  return data as Funcao
}

export async function atualizarFuncao(id: string, input: Partial<FuncaoInput> & { active?: boolean }): Promise<Funcao> {
  const { data, error } = await supabase
    .from('funcoes')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar a função.')
  return data as Funcao
}

export async function desativarFuncao(id: string): Promise<Funcao> {
  return atualizarFuncao(id, { active: false })
}

// ---------------------------------------------------------------------------
// Ambientes
// ---------------------------------------------------------------------------
export async function listarAmbientes(empresaId: string): Promise<Ambiente[]> {
  const { data, error } = await supabase
    .from('ambientes')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome', { ascending: true })
  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os ambientes.')
  return (data ?? []) as Ambiente[]
}

export interface AmbienteInput {
  empresa_id: string
  nome: string
  descricao?: string | null
}

export async function criarAmbiente(input: AmbienteInput): Promise<Ambiente> {
  const { data, error } = await supabase
    .from('ambientes')
    .insert({ ...input, active: true })
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível criar o ambiente.')
  return data as Ambiente
}

export async function atualizarAmbiente(id: string, input: Partial<AmbienteInput> & { active?: boolean }): Promise<Ambiente> {
  const { data, error } = await supabase
    .from('ambientes')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar o ambiente.')
  return data as Ambiente
}

export async function desativarAmbiente(id: string): Promise<Ambiente> {
  return atualizarAmbiente(id, { active: false })
}
