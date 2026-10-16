import { z } from 'zod'
import { apiRequest } from './api/client'

export const TIPOS = { tipico: 'Típico', doenca: 'Doença ocupacional', trajeto: 'Trajeto' } as const
export const GRAVIDADES = { sem_lesao: 'Sem lesão', leve: 'Leve', moderada: 'Moderada', grave: 'Grave', fatal: 'Fatal' } as const
export const PIRAMIDE = {
  lesao_grave: 'Lesão grave / incapacitante', lesao_leve: 'Lesão leve',
  dano_material: 'Dano material', quase_acidente: 'Quase acidente',
} as const
export const STATUS = { aberto: 'Aberto', em_investigacao: 'Em investigação', concluido: 'Concluído' } as const
export const LATERALIDADE = { 0: 'Não aplicável', 1: 'Esquerda', 2: 'Direita', 3: 'Ambas' } as const
export const LOCAIS = {
  1: 'Estabelecimento do empregador no Brasil', 2: 'Estabelecimento do empregador no exterior',
  3: 'Estabelecimento de terceiros', 4: 'Via pública', 5: 'Área rural', 6: 'Embarcação', 9: 'Outros',
} as const

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]
const tipo = z.enum(keys(TIPOS))
const gravidade = z.enum(keys(GRAVIDADES))
const piramide = z.enum(keys(PIRAMIDE))
const status = z.enum(keys(STATUS))
const codigo = z.string().regex(/^[0-9]{9}$/)
const colaborador = z.object({
  id: z.string().uuid(), nome: z.string(), setor: z.object({ nome: z.string() }).nullable().optional(),
}).nullable()

export const acidenteListSchema = z.object({
  id: z.string().uuid(), colaborador_id: z.string().uuid(), tipo, data_acidente: z.string(), gravidade,
  piramide_bird: piramide.nullable(), status, houve_afastamento: z.boolean(), dias_perdidos: z.number().nullable(),
  emitir_cat: z.boolean(), codigo_parte_atingida: codigo.nullable(), codigo_natureza_lesao: codigo.nullable(),
  agente_tabela: z.union([z.literal(14), z.literal(15)]).nullable(), codigo_agente_causador: codigo.nullable(),
  anulado_em: z.string().nullable(), colaborador,
})
export const acidenteSchema = acidenteListSchema.extend({
  empresa_id: z.string().uuid(), hora_acidente: z.string().nullable(), minutos_trabalhados_antes: z.number().nullable(),
  local_tipo: z.number().nullable(), local_descricao: z.string().nullable(), lateralidade: z.number().nullable(),
  codigo_situacao_geradora: codigo.nullable(), descricao_lesao: z.string().nullable(),
  ultimo_dia_trabalhado: z.string().nullable(), data_retorno: z.string().nullable(), houve_obito: z.boolean(),
  data_obito: z.string().nullable(), comunicado_policia: z.boolean(), numero_recibo_cat: z.string().nullable(),
  detalhes: z.string().nullable(), criado_por: z.string().uuid(), created_at: z.string(),
  atualizado_em: z.string().nullable(), anulado_por: z.string().uuid().nullable(), motivo_anulacao: z.string().nullable(),
})
export const resumoSchema = z.object({
  mes: z.string(), tipo, gravidade, piramide_bird: piramide.nullable(), houve_afastamento: z.boolean(),
  emitir_cat: z.boolean(), total: z.number(), dias_perdidos: z.number(),
})

export type AcidenteResumido = z.infer<typeof acidenteListSchema>
export type Acidente = z.infer<typeof acidenteSchema>
export type ResumoAcidentes = z.infer<typeof resumoSchema>

/** Campos que a tela envia. O tenant e a autoria vêm do JWT/servidor, nunca daqui. */
export interface AcidenteInput {
  colaborador_id: string
  tipo: Acidente['tipo']
  data_acidente: string
  hora_acidente?: string | null
  minutos_trabalhados_antes?: number | null
  local_tipo?: number | null
  local_descricao?: string | null
  codigo_parte_atingida?: string | null
  lateralidade?: number | null
  agente_tabela?: 14 | 15 | null
  codigo_agente_causador?: string | null
  codigo_situacao_geradora?: string | null
  codigo_natureza_lesao?: string | null
  descricao_lesao?: string | null
  gravidade: Acidente['gravidade']
  piramide_bird?: Acidente['piramide_bird']
  houve_afastamento: boolean
  ultimo_dia_trabalhado?: string | null
  data_retorno?: string | null
  dias_perdidos?: number | null
  houve_obito: boolean
  data_obito?: string | null
  comunicado_policia: boolean
  emitir_cat: boolean
  numero_recibo_cat?: string | null
  status: Acidente['status']
  detalhes?: string | null
}

const safeId = (id: string) => z.string().uuid().parse(id)
const lista = (data: unknown) => z.array(acidenteListSchema).parse(data)
const um = (data: unknown) => acidenteSchema.parse(data)

export const listarAcidentes = () => apiRequest('/acidentes', { parse: lista })
export const listarAcidentesDoColaborador = (id: string) => apiRequest(`/colaboradores/${safeId(id)}/acidentes`, { parse: lista })
export const obterAcidente = (id: string) => apiRequest(`/acidentes/${safeId(id)}`, { parse: um })
export const resumoAcidentes = () => apiRequest('/acidentes/resumo', { parse: data => z.array(resumoSchema).parse(data) })
export const criarAcidente = (input: AcidenteInput) => apiRequest('/acidentes', { method: 'POST', json: input, parse: um })
export const atualizarAcidente = (id: string, input: Partial<AcidenteInput>) =>
  apiRequest(`/acidentes/${safeId(id)}`, { method: 'PATCH', json: input, parse: um })
export const anularAcidente = (id: string, motivo: string) =>
  apiRequest(`/acidentes/${safeId(id)}/anular`, { method: 'POST', json: { motivo }, parse: um })
