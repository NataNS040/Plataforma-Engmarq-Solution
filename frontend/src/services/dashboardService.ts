import { z } from 'zod'
import { apiRequest } from './api/client'

const count = z.number().int().nonnegative()
const kpisSchema = z.object({
  totalColaboradores: count.nullable(), totalEmpresas: count, totalDocumentos: count,
  totalTreinamentos: count.nullable(), docsVencidos: count, docsVencendo: count,
  treinamentosVencidos: count.nullable(), treinamentosVencendo: count.nullable(),
  compliancePct: z.number().int().min(0).max(100), operacionalDisponivel: z.boolean(),
})
const alertaSchema = z.object({
  tipo: z.enum(['documento', 'treinamento']), empresa_id: z.uuid(), titulo: z.string(),
  nome_envolvido: z.string().nullable(), status: z.enum(['vencido', 'vencendo']),
  dias_restantes: z.number().int().nullable(), vencimento: z.string().nullable(),
})
export type DashboardKpis = z.infer<typeof kpisSchema>
export type AlertaCritico = z.infer<typeof alertaSchema>
const scopeParam = (scope: string) => encodeURIComponent(scope === 'all' ? scope : z.uuid().parse(scope))

// Scope is a request validated by the API, never an authorization source.
// Compatibility flags cannot change the server role/tenant decision.
export function buscarKpis(empresaId: string | 'all', _includeColaboradores = empresaId !== 'all'): Promise<DashboardKpis> {
  return apiRequest(`/dashboard/kpis?scope=${scopeParam(empresaId)}`, { parse: data => kpisSchema.parse(data) })
}
export function buscarAlertasCriticos(empresaId: string | 'all', limit = 5, _includeTreinamentos = empresaId !== 'all'): Promise<AlertaCritico[]> {
  z.number().int().min(1).max(50).parse(limit)
  return apiRequest(`/dashboard/alertas?scope=${scopeParam(empresaId)}&limit=${limit}`,
    { parse: data => z.array(alertaSchema).parse(data) })
}
