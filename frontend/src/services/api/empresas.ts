import { z } from 'zod'
import { apiRequest } from './client'
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

const empresaSchema = z.object({
  id: z.string().uuid(),
  razao_social: z.string(),
  cnpj: z.string(),
  setor: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  responsavel: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  status: z.enum(['ativa', 'pendente', 'suspensa']),
  logo_url: z.string().nullable(),
  created_at: z.string(),
})
const listSchema = z.array(empresaSchema.extend({ colaboradores_count: z.number().int().nonnegative() }))
const path = (id: string) => `/empresas/${encodeURIComponent(z.string().uuid().parse(id))}`

export function listarEmpresas(): Promise<EmpresaComContagem[]> {
  return apiRequest('/empresas', { parse: data => listSchema.parse(data) })
}

export function obterEmpresa(id: string): Promise<Empresa> {
  return apiRequest(path(id), { parse: data => empresaSchema.parse(data) })
}

export function criarEmpresa(input: EmpresaInput): Promise<Empresa> {
  return apiRequest('/empresas', {
    method: 'POST', json: input, parse: data => empresaSchema.parse(data),
  })
}

export function atualizarEmpresa(id: string, input: Partial<EmpresaInput>): Promise<Empresa> {
  return apiRequest(path(id), {
    method: 'PATCH', json: input, parse: data => empresaSchema.parse(data),
  })
}

/** Soft delete: related records are preserved by the backend. */
export function desativarEmpresa(id: string): Promise<Empresa> {
  return atualizarEmpresa(id, { status: 'suspensa' })
}
