import {
  getColaboradores, getColaborador, postColaborador, patchColaborador,
  type ColaboradorCreateInput, type ColaboradorUpdateInput,
} from './api/colaboradores'
import { AppError } from '@/lib/errors'

export type { ColaboradorComCatalogos, ColaboradorUpdateInput } from './api/colaboradores'

// Legacy UI/cache context only; never sent to the API as tenant authority.
export interface ColaboradorInput extends ColaboradorCreateInput {
  empresa_id: string
}

export function listarColaboradores(_empresaId: string) {
  return getColaboradores()
}

export function obterColaborador(id: string) {
  return getColaborador(id)
}

export function criarColaborador(input: ColaboradorInput) {
  const { empresa_id: _empresaId, ...payload } = input
  return postColaborador(payload)
}

export function atualizarColaborador(id: string, input: ColaboradorUpdateInput) {
  return patchColaborador(id, input)
}

export function desativarColaborador(id: string, data_demissao: string) {
  return patchColaborador(id, { active: false, data_demissao })
}

// The spreadsheet UI resolves catalog names; each employee uses the same POST
// contract as individual creation. Partial successes are intentionally preserved.
export async function importarColaboradores<T>(rows: T[], resolveInput: (row: T) => Promise<ColaboradorInput>) {
  let ok = 0, fail = 0
  let limitMessage: string | undefined
  for (const [index, row] of rows.entries()) {
    try {
      await criarColaborador(await resolveInput(row))
      ok++
    } catch (error) {
      fail++
      if (error instanceof AppError && error.code === 'collaborator_limit_reached') {
        limitMessage = error.message
        fail += rows.length - index - 1
        break
      }
    }
  }
  return { ok, fail, ...(limitMessage ? { limitMessage } : {}) }
}
