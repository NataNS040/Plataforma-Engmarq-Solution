import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { Colaborador } from '@/types/database'

export interface ColaboradorComCatalogos extends Omit<Colaborador, 'funcao' | 'setor' | 'ambiente'> {
  funcao: { id: string; nome: string } | null
  setor: { id: string; nome: string } | null
  ambiente: { id: string; nome: string } | null
}

export interface ColaboradorInput {
  empresa_id: string
  nome: string
  cpf: string
  matricula?: string | null
  funcao_id: string
  setor_id: string
  ambiente_id?: string | null
  data_admissao: string    // ISO date (YYYY-MM-DD)
}

export async function listarColaboradores(empresaId: string): Promise<ColaboradorComCatalogos[]> {
  const { data, error } = await supabase
    .from('colaboradores')
    .select('*, funcao:funcoes(id, nome), setor:setores(id, nome), ambiente:ambientes(id, nome)')
    .eq('empresa_id', empresaId)
    .eq('active', true)
    .order('nome', { ascending: true })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar os colaboradores.')
  return (data ?? []) as unknown as ColaboradorComCatalogos[]
}

export async function obterColaborador(id: string): Promise<ColaboradorComCatalogos> {
  const { data, error } = await supabase
    .from('colaboradores')
    .select('*, funcao:funcoes(id, nome), setor:setores(id, nome), ambiente:ambientes(id, nome)')
    .eq('id', id)
    .single()

  if (error) throw handleSupabaseError(error, 'Colaborador não encontrado.')
  return data as unknown as ColaboradorComCatalogos
}

export async function criarColaborador(input: ColaboradorInput): Promise<Colaborador> {
  const { data, error } = await supabase
    .from('colaboradores')
    .insert({
      empresa_id:    input.empresa_id,
      nome:          input.nome,
      cpf:           input.cpf,
      matricula:     input.matricula ?? null,
      funcao_id:     input.funcao_id,
      setor_id:      input.setor_id,
      ambiente_id:   input.ambiente_id ?? null,
      data_admissao: input.data_admissao,
      active:        true,
    })
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível cadastrar o colaborador.')
  return data as Colaborador
}

export async function atualizarColaborador(
  id: string,
  input: Partial<Omit<ColaboradorInput, 'empresa_id'>>
): Promise<Colaborador> {
  const { data, error } = await supabase
    .from('colaboradores')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar o colaborador.')
  return data as Colaborador
}

export async function desativarColaborador(id: string, data_demissao: string): Promise<Colaborador> {
  return atualizarColaborador(id, {
    data_admissao: undefined, // não alterar admissão
  }).then(() =>
    supabase
      .from('colaboradores')
      .update({ active: false, data_demissao })
      .eq('id', id)
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) throw handleSupabaseError(error, 'Não foi possível desativar o colaborador.')
        return data as Colaborador
      })
  )
}
