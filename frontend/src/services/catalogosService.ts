import { catalogosApi, type CatalogoCreateInput, type CatalogoUpdateInput, type FuncaoCreateInput, type FuncaoUpdateInput } from './api/catalogos'

// empresa_id is legacy UI/cache context only, never tenant authority on the wire.
export interface SetorInput extends CatalogoCreateInput { empresa_id: string }
export interface FuncaoInput extends FuncaoCreateInput { empresa_id: string }
export interface AmbienteInput extends CatalogoCreateInput { empresa_id: string }
export type { CatalogoUpdateInput, FuncaoUpdateInput } from './api/catalogos'

export const listarSetores = (_empresaId: string) => catalogosApi.setores.list()
export const listarFuncoes = (_empresaId: string) => catalogosApi.funcoes.list()
export const listarAmbientes = (_empresaId: string) => catalogosApi.ambientes.list()

export function criarSetor({ empresa_id: _empresaId, ...input }: SetorInput) { return catalogosApi.setores.create(input) }
export function criarFuncao({ empresa_id: _empresaId, ...input }: FuncaoInput) { return catalogosApi.funcoes.create(input) }
export function criarAmbiente({ empresa_id: _empresaId, ...input }: AmbienteInput) { return catalogosApi.ambientes.create(input) }

export const atualizarSetor = (id: string, input: CatalogoUpdateInput) => catalogosApi.setores.update(id, input)
export const atualizarFuncao = (id: string, input: FuncaoUpdateInput) => catalogosApi.funcoes.update(id, input)
export const atualizarAmbiente = (id: string, input: CatalogoUpdateInput) => catalogosApi.ambientes.update(id, input)
export const desativarSetor = (id: string) => atualizarSetor(id, { active: false })
export const desativarFuncao = (id: string) => atualizarFuncao(id, { active: false })
export const desativarAmbiente = (id: string) => atualizarAmbiente(id, { active: false })
