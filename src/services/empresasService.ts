import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { Empresa } from '@/types/database'

export type EmpresaStatus = Empresa['status']

export interface EmpresaComContagem extends Empresa {
  colaboradores_count: number
}

export interface EmpresaInput {
  razao_social: string
  cnpj: string
  setor?: string | null
  cidade?: string | null
  uf?: string | null
  responsavel?: string | null
  email?: string | null
  telefone?: string | null
  status?: EmpresaStatus
  logo_url?: string | null
}

export async function listarEmpresas(): Promise<EmpresaComContagem[]> {
  const { data, error } = await supabase
    .from('empresas')
    .select('*, colaboradores(count)')
    .order('razao_social', { ascending: true })

  if (error) throw handleSupabaseError(error, 'Não foi possível carregar as empresas.')

  return (data ?? []).map(row => {
    const { colaboradores, ...rest } = row as Empresa & {
      colaboradores?: { count: number }[]
    }
    return {
      ...(rest as Empresa),
      colaboradores_count: colaboradores?.[0]?.count ?? 0,
    }
  })
}

export async function obterEmpresa(id: string): Promise<Empresa> {
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw handleSupabaseError(error, 'Empresa não encontrada.')
  return data as Empresa
}

export async function criarEmpresa(input: EmpresaInput): Promise<Empresa> {
  const payload = {
    razao_social: input.razao_social,
    cnpj: input.cnpj,
    setor: input.setor ?? null,
    cidade: input.cidade ?? null,
    uf: input.uf ?? null,
    responsavel: input.responsavel ?? null,
    email: input.email ?? null,
    telefone: input.telefone ?? null,
    status: input.status ?? 'ativa',
    logo_url: input.logo_url ?? null,
  }

  const { data, error } = await supabase
    .from('empresas')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível cadastrar a empresa.')
  return data as Empresa
}

export async function atualizarEmpresa(id: string, input: Partial<EmpresaInput>): Promise<Empresa> {
  const { data, error } = await supabase
    .from('empresas')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw handleSupabaseError(error, 'Não foi possível atualizar a empresa.')
  return data as Empresa
}

/**
 * Desativa a empresa (soft delete via status='suspensa').
 * Não usamos DELETE porque empresas têm muitas FKs dependentes.
 */
export async function desativarEmpresa(id: string): Promise<Empresa> {
  return atualizarEmpresa(id, { status: 'suspensa' })
}

/**
 * Upload da logo da empresa (bucket 'logos', público). Sobrescreve o
 * arquivo anterior (upsert) — diferente da foto de assinatura, aqui faz
 * sentido trocar a logo quantas vezes for preciso.
 */
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
