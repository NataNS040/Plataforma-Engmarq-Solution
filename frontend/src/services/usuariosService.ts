import type { UserProfile } from '@/types/database'
import { getUsuario, getUsuarios, patchUsuario, postUsuario, type UsuarioCreateInput, type UsuarioInput } from './api/usuarios'

export type { UsuarioCreateInput, UsuarioInput } from './api/usuarios'

export function criarUsuario(input: UsuarioCreateInput) {
  return postUsuario(input)
}

export function listarUsuariosDaEmpresa(empresaId: string): Promise<UserProfile[]> {
  return getUsuarios(empresaId)
}

export function obterUsuario(id: string): Promise<UserProfile> {
  return getUsuario(id)
}

export function atualizarUsuario(id: string, input: UsuarioInput): Promise<UserProfile> {
  return patchUsuario(id, input)
}
