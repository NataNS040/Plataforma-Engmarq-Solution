import { z } from 'zod'
import { apiRequest } from './client'

export type CatalogoKind = 'funcoes' | 'setores' | 'ambientes'
export interface CatalogoCreateInput { nome: string; descricao?: string | null }
export interface FuncaoCreateInput extends CatalogoCreateInput { riscos?: string | null }
export type CatalogoUpdateInput = Partial<CatalogoCreateInput> & { active?: boolean }
export type FuncaoUpdateInput = CatalogoUpdateInput & { riscos?: string | null }

const catalogo = z.object({ id: z.uuid(), empresa_id: z.uuid(), nome: z.string(),
  descricao: z.string().nullable(), active: z.boolean() })
const funcao = catalogo.extend({ riscos: z.string().nullable() })

export const catalogosApi = {
  setores: resource('setores', catalogo),
  ambientes: resource('ambientes', catalogo),
  funcoes: resource('funcoes', funcao),
}

function resource<S extends typeof catalogo | typeof funcao>(kind: CatalogoKind, schema: S) {
  return {
    list: () => apiRequest(`/${kind}`, { parse: data => z.array(schema).parse(data) }),
    create: (input: CatalogoCreateInput | FuncaoCreateInput) => apiRequest(`/${kind}`, {
      method: 'POST', json: input, parse: data => schema.parse(data) as z.infer<S>,
    }),
    update: (id: string, input: CatalogoUpdateInput | FuncaoUpdateInput) => apiRequest(`/${kind}/${encodeURIComponent(z.uuid().parse(id))}`, {
      method: 'PATCH', json: input, parse: data => schema.parse(data) as z.infer<S>,
    }),
  }
}
