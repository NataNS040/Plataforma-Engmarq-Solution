import { z } from 'zod'
import { apiRequest } from './api/client'
import type { SubtipoExame } from '@/types/database'
const tipoSchema = z.object({ id: z.string().uuid(), nome: z.string(), descricao: z.string().nullable(), validade_meses: z.number().nullable() })
export const asoSchema = z.object({
  id: z.string().uuid(), empresa_id: z.string().uuid(), tipo_id: z.string().uuid(),
  colaborador_id: z.string().uuid().nullable(), titulo: z.string(), numero: z.string().nullable(),
  emissao: z.string().nullable(), vencimento: z.string().nullable(), observacoes: z.string().nullable(),
  subtipo_exame: z.enum(['admissional','periodico','retorno_trabalho','mudanca_risco','demissional']).nullable(),
  resultado_aso: z.enum(['apto','apto_com_restricao','inapto']).nullable(), exames_realizados: z.array(z.string()).nullable(),
  arquivo_path: z.string().nullable(), arquivo_url: z.string().nullable(), created_at: z.string().nullable(),
  status: z.enum(['vigente','vencendo','vencido']), tipo: tipoSchema.nullable(),
  colaborador: z.object({ id: z.string().uuid(), nome: z.string() }).nullable(),
})
export type AsoComDetalhes = z.infer<typeof asoSchema>
export interface AsoInput {
  empresa_id: string // cache context only; never sent as authorization
  colaborador_id: string
  titulo: string
  subtipo_exame: SubtipoExame
  emissao?: string | null
  vencimento?: string | null
  numero?: string | null
  observacoes?: string | null
  resultado_aso?: AsoComDetalhes['resultado_aso']
  exames_realizados?: string[] | null
}
const safeId = (id: string) => z.string().uuid().parse(id)
export const listarAsos = (_empresaId: string) => apiRequest('/exames', { parse: data => z.array(asoSchema).parse(data) })
export const listarAsosDoColaborador = (id: string) => apiRequest(`/colaboradores/${safeId(id)}/exames`, { parse: data => z.array(asoSchema).parse(data) })
export const obterAso = (id: string) => apiRequest(`/exames/${safeId(id)}`, { parse: data => asoSchema.parse(data) })
export function criarAso({ empresa_id: _empresa, ...input }: AsoInput) {
  return apiRequest('/exames', { method: 'POST', json: { ...input, exames_realizados: input.exames_realizados ?? [] }, parse: data => asoSchema.parse(data) })
}
export const atualizarAso = (id: string, input: Partial<Omit<AsoInput, 'empresa_id'>>) =>
  apiRequest(`/exames/${safeId(id)}`, { method: 'PATCH', json: input, parse: data => asoSchema.parse(data) })
export const deletarAso = (id: string) => apiRequest<void>(`/exames/${safeId(id)}`, { method: 'DELETE' })
export const listarExamesCatalogo = () => apiRequest('/exames/catalogo', {
  parse: data => z.array(z.object({ id: z.number(), nome: z.string(), ordem: z.number() })).parse(data),
})
export function uploadAsoArquivo(id: string, file: File) {
  return apiRequest(`/exames/${safeId(id)}/arquivo`, { method: 'POST', body: file,
    headers: { 'Content-Type': file.type }, timeoutMs: 60_000, parse: data => asoSchema.parse(data) })
}
export async function abrirAso(id: string, download = false) {
  const target = window.open('about:blank', '_blank')
  if (target) target.opener = null
  try {
    const { url } = await apiRequest(`/exames/${safeId(id)}/${download ? 'download' : 'arquivo'}`, {
      parse: data => z.object({ url: z.string().url(), expires_in: z.literal(60) }).parse(data),
    })
    if (target) target.location.replace(url)
    else window.location.assign(url)
  } catch (error) { target?.close(); throw error }
}
