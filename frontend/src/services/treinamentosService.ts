import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import type { TreinamentoModalidade } from '@/types/database'
import { apiRequest } from './api/client'
import { getTipos, getMatriz, getTreinamentos, getTreinamento, safeId, treinamentoSchema, matrizSchema } from './api/treinamentos'
import type { z } from 'zod'

export type TreinamentoComDetalhes = z.infer<typeof treinamentoSchema>
export type MatrizTreinamentoComDetalhes = z.infer<typeof matrizSchema>
export interface MatrizInput {
  empresa_id: string
  funcao_id: string
  treinamento_tipo_id: string
  obrigatorio: boolean
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
  certificado_url?: string | null
}


export const listarTreinamentoTipos = getTipos
export const listarMatrizTreinamentos = (_empresaId: string) => getMatriz()
export const listarTreinamentos = (_empresaId: string) => getTreinamentos()
export const listarTreinamentosDoColaborador = (id: string) => getTreinamentos(id)
export const obterTreinamento = getTreinamento
export function criarMatrizTreinamento({ empresa_id: _company, ...input }: MatrizInput) {
  return apiRequest('/matriz-treinamentos', { method: 'POST', json: input, parse: data => matrizSchema.parse(data) })
}
export function atualizarMatrizTreinamento(id: string, obrigatorio: boolean) {
  return apiRequest(`/matriz-treinamentos/${safeId(id)}`, { method: 'PATCH', json: { obrigatorio }, parse: data => matrizSchema.parse(data) })
}
export async function deletarMatrizTreinamento(id: string): Promise<void> {
  await apiRequest(`/matriz-treinamentos/${safeId(id)}`, { method: 'DELETE' })
}
export function registrarTreinamento({ empresa_id: _company, ...input }: TreinamentoInput) {
  return apiRequest('/treinamentos', { method: 'POST', json: input, parse: data => treinamentoSchema.parse(data) })
}
export function atualizarTreinamento(id: string, input: Partial<Omit<TreinamentoInput, 'empresa_id'>>) {
  return apiRequest(`/treinamentos/${safeId(id)}`, { method: 'PATCH', json: input, parse: data => treinamentoSchema.parse(data) })
}

// Storage remains direct with caller JWT; migration 018 restricts this namespace.
export async function uploadCertificado(file: File, empresaId: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'pdf'
  const path = `${safeId(empresaId)}/certificados/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('documentos').upload(path, file)
  if (error) throw handleSupabaseError(error as never)
  return path
}
export async function baixarCertificado(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 60)
  if (error) throw handleSupabaseError(error as never)
  return data.signedUrl
}
