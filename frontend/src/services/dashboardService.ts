import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DashboardKpis {
  totalColaboradores: number
  totalEmpresas: number       // só para admin
  totalDocumentos: number
  totalTreinamentos: number
  docsVencidos: number
  docsVencendo: number
  treinamentosVencidos: number
  treinamentosVencendo: number
  compliancePct: number       // % de docs+treinamentos em dia
}

export interface AlertaCritico {
  tipo: 'documento' | 'treinamento'
  empresa_id: string
  titulo: string
  nome_envolvido: string | null
  status: string
  dias_restantes: number | null
  vencimento: string | null
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------
export async function buscarKpis(empresaId: string | 'all'): Promise<DashboardKpis> {
  const isAll = empresaId === 'all'

  const [colabs, docs, treins, empresas] = await Promise.all([
    isAll
      ? supabase.from('colaboradores').select('id', { count: 'exact', head: true }).eq('active', true)
      : supabase.from('colaboradores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('active', true),

    isAll
      ? supabase.from('documentos').select('id, status')
      : supabase.from('documentos').select('id, status').eq('empresa_id', empresaId),

    isAll
      ? supabase.from('treinamentos').select('id, status')
      : supabase.from('treinamentos').select('id, status').eq('empresa_id', empresaId),

    isAll
      ? supabase.from('empresas').select('id', { count: 'exact', head: true })
      : Promise.resolve({ count: 1, error: null, data: null }),
  ])

  if (colabs.error)  throw handleSupabaseError(colabs.error)
  if (docs.error)    throw handleSupabaseError(docs.error)
  if (treins.error)  throw handleSupabaseError(treins.error)
  if (empresas.error) throw handleSupabaseError(empresas.error)

  const docsData    = (docs.data ?? []) as { status: string }[]
  const treinsData  = (treins.data ?? []) as { status: string }[]

  const docsVencidos   = docsData.filter(d => d.status === 'vencido').length
  const docsVencendo   = docsData.filter(d => d.status === 'vencendo').length
  const docsOk         = docsData.filter(d => d.status === 'vigente').length

  const treinsVencidos  = treinsData.filter(t => t.status === 'vencido').length
  const treinsVencendo  = treinsData.filter(t => t.status === 'vencendo').length
  const treinsOk        = treinsData.filter(t => t.status === 'em_dia').length

  const totalItems = docsData.length + treinsData.length
  const totalOk    = docsOk + treinsOk
  const compliancePct = totalItems > 0 ? Math.round((totalOk / totalItems) * 100) : 100

  return {
    totalColaboradores: colabs.count ?? 0,
    totalEmpresas:      empresas.count ?? 0,
    totalDocumentos:    docsData.length,
    totalTreinamentos:  treinsData.length,
    docsVencidos,
    docsVencendo,
    treinamentosVencidos: treinsVencidos,
    treinamentosVencendo: treinsVencendo,
    compliancePct,
  }
}

export async function buscarAlertasCriticos(
  empresaId: string | 'all',
  limit = 5
): Promise<AlertaCritico[]> {
  const isAll = empresaId === 'all'

  const [docs, treins] = await Promise.all([
    isAll
      ? supabase
          .from('vw_dashboard_documentos')
          .select('empresa_id, titulo, status_calculado, dias_restantes, vencimento')
          .in('status_calculado', ['vencido', 'vencendo'])
          .order('dias_restantes', { ascending: true, nullsFirst: false })
          .limit(limit)
      : supabase
          .from('vw_dashboard_documentos')
          .select('empresa_id, titulo, status_calculado, dias_restantes, vencimento')
          .in('status_calculado', ['vencido', 'vencendo'])
          .eq('empresa_id', empresaId)
          .order('dias_restantes', { ascending: true, nullsFirst: false })
          .limit(limit),

    isAll
      ? supabase
          .from('vw_dashboard_treinamentos')
          .select('empresa_id, colaborador_nome, treinamento_nome, status_calculado, dias_restantes, data_vencimento')
          .in('status_calculado', ['vencido', 'vencendo'])
          .order('dias_restantes', { ascending: true, nullsFirst: false })
          .limit(limit)
      : supabase
          .from('vw_dashboard_treinamentos')
          .select('empresa_id, colaborador_nome, treinamento_nome, status_calculado, dias_restantes, data_vencimento')
          .in('status_calculado', ['vencido', 'vencendo'])
          .eq('empresa_id', empresaId)
          .order('dias_restantes', { ascending: true, nullsFirst: false })
          .limit(limit),
  ])

  const alertasDoc: AlertaCritico[] = (docs.data ?? []).map(d => ({
    tipo:            'documento',
    empresa_id:      d.empresa_id,
    titulo:          d.titulo,
    nome_envolvido:  null,
    status:          d.status_calculado,
    dias_restantes:  d.dias_restantes,
    vencimento:      d.vencimento,
  }))

  const alertasTrein: AlertaCritico[] = (treins.data ?? []).map(t => ({
    tipo:            'treinamento',
    empresa_id:      t.empresa_id,
    titulo:          t.treinamento_nome,
    nome_envolvido:  t.colaborador_nome,
    status:          t.status_calculado,
    dias_restantes:  t.dias_restantes,
    vencimento:      t.data_vencimento,
  }))

  return [...alertasDoc, ...alertasTrein]
    .sort((a, b) => (a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999))
    .slice(0, limit)
}
