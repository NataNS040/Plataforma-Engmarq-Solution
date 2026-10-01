import { z } from 'zod'
import { apiRequest } from './client'

export interface ColaboradorCreateInput {
  nome: string
  cpf: string
  matricula?: string | null
  funcao_id: string
  setor_id: string
  ambiente_id?: string | null
  data_admissao: string
}

export type ColaboradorUpdateInput = Partial<Pick<ColaboradorCreateInput,
  'nome' | 'matricula' | 'funcao_id' | 'setor_id' | 'ambiente_id'>> & {
  active?: false
  data_demissao?: string
}

const catalogo = z.object({ id: z.uuid(), nome: z.string() }).nullable()
const colaborador = z.object({
  id: z.uuid(), empresa_id: z.uuid(), nome: z.string(), cpf: z.string(),
  matricula: z.string().nullable(), funcao_id: z.uuid(), setor_id: z.uuid(),
  ambiente_id: z.uuid().nullable(), data_admissao: z.string(),
  data_demissao: z.string().nullable(), active: z.boolean(), created_at: z.string().nullable(),
  funcao: catalogo, setor: catalogo, ambiente: catalogo,
})
export type ColaboradorComCatalogos = z.infer<typeof colaborador>
const path = (id: string) => `/colaboradores/${encodeURIComponent(z.uuid().parse(id))}`

export function getColaboradores() {
  return apiRequest('/colaboradores', { parse: data => z.array(colaborador).parse(data) })
}

export function getColaborador(id: string) {
  return apiRequest(path(id), { parse: data => colaborador.parse(data) })
}

export function postColaborador(input: ColaboradorCreateInput) {
  return apiRequest('/colaboradores', {
    method: 'POST', json: input, parse: data => colaborador.parse(data),
  })
}

export function patchColaborador(id: string, input: ColaboradorUpdateInput) {
  return apiRequest(path(id), {
    method: 'PATCH', json: input, parse: data => colaborador.parse(data),
  })
}
