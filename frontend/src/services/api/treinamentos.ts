import { z } from 'zod'
import { apiRequest } from './client'

export const tipoSchema = z.object({ id: z.uuid(), nome: z.string(), descricao: z.string().nullable(),
  nr_referencia: z.string().nullable(), validade_meses: z.number().nullable() })
const reference = z.object({ id: z.uuid(), nome: z.string() }).nullable()
export const treinamentoSchema = z.object({ id: z.uuid(), empresa_id: z.uuid(), colaborador_id: z.uuid(),
  treinamento_tipo_id: z.uuid(), data_realizacao: z.string(), data_vencimento: z.string().nullable(),
  carga_horaria: z.number().nullable(), instrutor: z.string().nullable(),
  modalidade: z.enum(['presencial', 'online', 'semipresencial']).nullable(), certificado_url: z.string().nullable(),
  status: z.enum(['em_dia', 'vencendo', 'vencido', 'pendente']), created_at: z.string().nullable(),
  colaborador: reference, treinamento_tipo: tipoSchema.nullable() })
export const matrizSchema = z.object({ id: z.uuid(), empresa_id: z.uuid(), funcao_id: z.uuid(),
  treinamento_tipo_id: z.uuid(), obrigatorio: z.boolean(), funcao: reference, treinamento_tipo: tipoSchema.nullable() })
export const safeId = (id: string) => encodeURIComponent(z.uuid().parse(id))
export const getTipos = () => apiRequest('/treinamento-tipos', { parse: data => z.array(tipoSchema).parse(data) })
export const getMatriz = () => apiRequest('/matriz-treinamentos', { parse: data => z.array(matrizSchema).parse(data) })
export const getTreinamentos = (employee?: string) => apiRequest(employee
  ? `/colaboradores/${safeId(employee)}/treinamentos` : '/treinamentos', { parse: data => z.array(treinamentoSchema).parse(data) })
export const getTreinamento = (id: string) => apiRequest(`/treinamentos/${safeId(id)}`, { parse: data => treinamentoSchema.parse(data) })
