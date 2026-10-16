// Regras puras do módulo de acidentes (sem React): conversão do formulário, validação e indicadores.
import { PIRAMIDE, type Acidente, type AcidenteInput, type ResumoAcidentes } from '@/services/acidentesService'
import type { NivelBird } from './PiramideBird'

export interface Form {
  colaborador_id: string
  tipo: Acidente['tipo'] | ''
  data_acidente: string
  hora_acidente: string
  horas_antes: string
  local_tipo: string
  local_descricao: string
  codigo_parte_atingida: string
  lateralidade: string
  agente_tabela: '14' | '15'
  codigo_agente_causador: string
  codigo_situacao_geradora: string
  codigo_natureza_lesao: string
  descricao_lesao: string
  gravidade: Acidente['gravidade'] | ''
  piramide_bird: string
  houve_afastamento: boolean
  ultimo_dia_trabalhado: string
  data_retorno: string
  dias_perdidos: string
  houve_obito: boolean
  data_obito: string
  comunicado_policia: boolean
  emitir_cat: boolean
  numero_recibo_cat: string
  status: Acidente['status']
  detalhes: string
}

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))
const hhmm = (min: number | null) => (min === null ? '' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`)

export function inicial(a?: Acidente): Form {
  return {
    colaborador_id: a?.colaborador_id ?? '', tipo: a?.tipo ?? '', data_acidente: a?.data_acidente ?? '',
    hora_acidente: a?.hora_acidente?.slice(0, 5) ?? '', horas_antes: hhmm(a?.minutos_trabalhados_antes ?? null),
    local_tipo: s(a?.local_tipo), local_descricao: s(a?.local_descricao),
    codigo_parte_atingida: s(a?.codigo_parte_atingida), lateralidade: s(a?.lateralidade),
    agente_tabela: a?.agente_tabela === 15 ? '15' : '14', codigo_agente_causador: s(a?.codigo_agente_causador),
    codigo_situacao_geradora: s(a?.codigo_situacao_geradora), codigo_natureza_lesao: s(a?.codigo_natureza_lesao),
    descricao_lesao: s(a?.descricao_lesao), gravidade: a?.gravidade ?? '', piramide_bird: s(a?.piramide_bird),
    houve_afastamento: a?.houve_afastamento ?? false, ultimo_dia_trabalhado: s(a?.ultimo_dia_trabalhado),
    data_retorno: s(a?.data_retorno), dias_perdidos: s(a?.dias_perdidos), houve_obito: a?.houve_obito ?? false,
    data_obito: s(a?.data_obito), comunicado_policia: a?.comunicado_policia ?? false, emitir_cat: a?.emitir_cat ?? false,
    numero_recibo_cat: s(a?.numero_recibo_cat), status: a?.status ?? 'aberto', detalhes: s(a?.detalhes),
  }
}

/** Converte o formulário no payload da API; campos que não se aplicam vão como null. */
export function paraInput(f: Form): AcidenteInput {
  const doenca = f.tipo === 'doenca'
  const [h, m] = f.horas_antes.split(':').map(Number)
  const n = (v: string) => (v === '' ? null : v)
  return {
    colaborador_id: f.colaborador_id, tipo: f.tipo as Acidente['tipo'], data_acidente: f.data_acidente,
    hora_acidente: doenca ? null : n(f.hora_acidente),
    minutos_trabalhados_antes: doenca || !f.horas_antes ? null : h * 60 + m,
    local_tipo: f.local_tipo ? Number(f.local_tipo) : null, local_descricao: n(f.local_descricao.trim()),
    codigo_parte_atingida: n(f.codigo_parte_atingida),
    lateralidade: f.codigo_parte_atingida && f.lateralidade !== '' ? Number(f.lateralidade) : null,
    agente_tabela: f.codigo_agente_causador ? (doenca && f.agente_tabela === '15' ? 15 : 14) : null,
    codigo_agente_causador: n(f.codigo_agente_causador),
    codigo_situacao_geradora: n(f.codigo_situacao_geradora), codigo_natureza_lesao: n(f.codigo_natureza_lesao),
    descricao_lesao: n(f.descricao_lesao.trim()), gravidade: f.gravidade as Acidente['gravidade'],
    piramide_bird: (n(f.piramide_bird) as Acidente['piramide_bird']),
    houve_afastamento: f.houve_afastamento,
    ultimo_dia_trabalhado: n(f.ultimo_dia_trabalhado),
    data_retorno: f.houve_afastamento ? n(f.data_retorno) : null,
    dias_perdidos: f.houve_afastamento && f.dias_perdidos !== '' ? Number(f.dias_perdidos) : null,
    houve_obito: f.houve_obito, data_obito: f.houve_obito ? n(f.data_obito) : null,
    comunicado_policia: f.comunicado_policia, emitir_cat: f.emitir_cat,
    numero_recibo_cat: n(f.numero_recibo_cat.trim()), status: f.status, detalhes: n(f.detalhes.trim()),
  }
}

export function validar(f: Form): string | null {
  if (!f.colaborador_id || !f.tipo || !f.data_acidente || !f.gravidade) return 'Informe colaborador, tipo, data e gravidade.'
  if (f.horas_antes && !/^\d{1,2}:[0-5]\d$/.test(f.horas_antes)) return 'Horas trabalhadas antes: use o formato HH:MM.'
  if (f.houve_afastamento && f.data_retorno && f.data_retorno < f.data_acidente) return 'A data de retorno não pode ser anterior ao acidente.'
  if (f.houve_obito && (!f.data_obito || f.gravidade !== 'fatal')) return 'Óbito exige a data do óbito e gravidade fatal.'
  if (f.numero_recibo_cat && !/^[0-9.]{1,23}$/.test(f.numero_recibo_cat.trim())) return 'Recibo da CAT: só números e pontos.'
  return null
}

/** '12m' = últimos 12 meses; senão um ano ('2026'). Compara datas ISO (AAAA-MM-DD) como texto. */
export function noPeriodo(data: string, periodo: string, hoje = new Date()) {
  if (periodo !== '12m') return data.startsWith(periodo)
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)
  const iso = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`
  return data >= iso
}

export function indicadores(resumo: ResumoAcidentes[]) {
  const soma = (f: (r: ResumoAcidentes) => boolean, campo: 'total' | 'dias_perdidos' = 'total') =>
    resumo.filter(f).reduce((s, r) => s + r[campo], 0)
  const bird = Object.fromEntries((Object.keys(PIRAMIDE) as NivelBird[]).map(k => [k, soma(r => r.piramide_bird === k)])) as Record<NivelBird, number>
  return {
    total: soma(() => true),
    afastamento: soma(r => r.houve_afastamento),
    dias: soma(() => true, 'dias_perdidos'),
    graves: soma(r => r.gravidade === 'grave' || r.gravidade === 'fatal'),
    cat: soma(r => r.emitir_cat),
    bird,
    semClassificacao: soma(r => r.piramide_bird === null),
  }
}
