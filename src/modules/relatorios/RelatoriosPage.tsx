import { useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Download, TrendingUp, TrendingDown, ChevronDown, Loader2 } from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useDashboardKpis } from '@/hooks/queries/useDashboard'
import { useEmpresas } from '@/hooks/queries/useEmpresas'
import { useTreinamentos } from '@/hooks/queries/useTreinamentos'
import { useExames } from '@/hooks/queries/useExames'
import { useDocumentos } from '@/hooks/queries/useDocumentos'
import { comingSoon } from '@/lib/comingSoon'
import type { TreinamentoStatus, DocStatus } from '@/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RelPeriod = '30d' | '90d' | '6m' | '12m'
type RelCategoria = 'geral' | 'treinamentos' | 'exames' | 'documentos' | 'acidentes'

interface MetricaItem {
  label: string
  valor: string | number
  variacao?: number
  cor?: string
}

const CAT_LABELS: Record<RelCategoria, string> = {
  geral:        'Geral',
  treinamentos: 'Treinamentos',
  exames:       'Exames',
  documentos:   'Documentos',
  acidentes:    'Acidentes',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function MetricaCard({ item }: { item: MetricaItem }) {
  const up = item.variacao !== undefined && item.variacao > 0
  const dn = item.variacao !== undefined && item.variacao < 0
  return (
    <div className="glass rel-metrica-card">
      <div className="rel-metrica-val" style={{ color: item.cor }}>{item.valor}</div>
      <div className="rel-metrica-lbl">{item.label}</div>
      {item.variacao !== undefined && item.variacao !== 0 && (
        <div className={`rel-metrica-var ${up ? 'up' : dn ? 'dn' : ''}`}>
          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {up ? '+' : ''}{item.variacao}{typeof item.valor === 'string' ? 'pp' : ''}
        </div>
      )}
    </div>
  )
}

const PERIOD_LABELS: Record<RelPeriod, string> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '6m':  'Últimos 6 meses',
  '12m': 'Último ano',
}

const PERIOD_DAYS: Record<RelPeriod, number> = { '30d': 30, '90d': 90, '6m': 182, '12m': 365 }

function periodStartIso(period: RelPeriod): string {
  const d = new Date()
  d.setDate(d.getDate() - PERIOD_DAYS[period])
  return d.toISOString().slice(0, 10)
}

const TREINO_STATUS_LABEL: Record<TreinamentoStatus, string> = {
  em_dia: 'Em dia', vencendo: 'Vencendo', vencido: 'Vencido', pendente: 'Pendente',
}
const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  vigente: 'Vigente', vencendo: 'Vencendo', vencido: 'Vencido',
}

// Sheet vazia ainda assim precisa de um header — json_to_sheet([]) gera uma
// aba sem nenhuma coluna, o que parece um arquivo quebrado no Excel.
function sheetRowsOrPlaceholder<T extends Record<string, unknown>>(rows: T[], placeholderCol: string): Record<string, unknown>[] {
  return rows.length > 0 ? rows : [{ [placeholderCol]: 'Nenhum registro no período selecionado.' }]
}

interface GerarRelModalProps { onClose: () => void }
function GerarRelModal({ onClose }: GerarRelModalProps) {
  const { isAdmin, empresaId: empresaIdPerfil } = useCurrentProfile()
  const [cat, setCat] = useState<RelCategoria>('geral')
  const [period, setPeriod] = useState<RelPeriod>('30d')
  const [formato, setFormato] = useState<'pdf' | 'xlsx'>('xlsx')
  const [empresaIdEscolhida, setEmpresaIdEscolhida] = useState('')
  const [generating, setGenerating] = useState(false)

  const empresasQuery = useEmpresas()
  const empresas = empresasQuery.data ?? []
  const empresaId = isAdmin ? empresaIdEscolhida : (empresaIdPerfil ?? '')
  const empresaNome = empresas.find(e => e.id === empresaId)?.razao_social ?? ''

  const kpisQuery = useDashboardKpis(empresaId || undefined)
  const treinosQuery = useTreinamentos(empresaId || undefined)
  const examesQuery = useExames(empresaId || undefined)
  const documentosQuery = useDocumentos(empresaId || undefined)
  // Dado ainda carregando pra empresa escolhida — gerar agora exportaria
  // planilhas vazias em vez de esperar a resposta real do banco.
  const dadosCarregando = !!empresaId && (
    kpisQuery.isLoading || treinosQuery.isLoading || examesQuery.isLoading || documentosQuery.isLoading
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (formato === 'pdf') { comingSoon('Relatório em PDF'); return }
    if (cat === 'acidentes') { comingSoon('Relatório de acidentes'); return }
    if (!empresaId) { toast.error('Selecione uma empresa para gerar o relatório.'); return }
    if (dadosCarregando) { toast.info('Ainda carregando os dados da empresa — aguarde um instante.'); return }

    setGenerating(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const cutoff = periodStartIso(period)
      const kpis = kpisQuery.data

      if (cat === 'geral') {
        const resumo = [
          { Métrica: 'Empresa',                Valor: empresaNome },
          { Métrica: 'Período',                Valor: PERIOD_LABELS[period] },
          { Métrica: 'Colaboradores ativos',   Valor: kpis?.totalColaboradores ?? '' },
          { Métrica: 'Conformidade geral',     Valor: kpis ? `${kpis.compliancePct}%` : '' },
          { Métrica: 'Documentos vencendo',    Valor: kpis?.docsVencendo ?? '' },
          { Métrica: 'Documentos vencidos',    Valor: kpis?.docsVencidos ?? '' },
          { Métrica: 'Treinamentos vencendo',  Valor: kpis?.treinamentosVencendo ?? '' },
          { Métrica: 'Treinamentos vencidos',  Valor: kpis?.treinamentosVencidos ?? '' },
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo')
      }

      if (cat === 'geral' || cat === 'treinamentos') {
        const rows = (treinosQuery.data ?? [])
          .filter(t => t.data_realizacao >= cutoff)
          .map(t => ({
            Colaborador:            t.colaborador?.nome ?? '—',
            NR:                     t.treinamento_tipo?.nr_referencia ?? t.treinamento_tipo?.nome ?? '—',
            Treinamento:            t.treinamento_tipo?.nome ?? '—',
            'Data de realização':   t.data_realizacao,
            'Vencimento':           t.data_vencimento ?? '',
            'Carga horária (h)':    t.carga_horaria ?? '',
            'Status':               TREINO_STATUS_LABEL[t.status],
          }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRowsOrPlaceholder(rows, 'Treinamentos')), 'Treinamentos')
      }

      if (cat === 'geral' || cat === 'exames') {
        const rows = (examesQuery.data ?? [])
          .filter(a => !a.emissao || a.emissao >= cutoff)
          .map(a => ({
            Colaborador:  a.colaborador?.nome ?? '—',
            Tipo:         a.tipo?.nome ?? '—',
            Subtipo:      a.subtipo_exame ?? '',
            Emissão:      a.emissao ?? '',
            Vencimento:   a.vencimento ?? '',
            Status:       DOC_STATUS_LABEL[a.status],
          }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRowsOrPlaceholder(rows, 'Exames')), 'Exames')
      }

      if (cat === 'geral' || cat === 'documentos') {
        const rows = (documentosQuery.data ?? [])
          .filter(d => !d.emissao || d.emissao >= cutoff)
          .map(d => ({
            Documento:    d.titulo,
            Tipo:         d.tipo?.nome ?? '—',
            Número:       d.numero ?? '',
            Emissão:      d.emissao ?? '',
            Vencimento:   d.vencimento ?? '',
            Status:       DOC_STATUS_LABEL[d.status],
          }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRowsOrPlaceholder(rows, 'Documentos')), 'Documentos')
      }

      const nomeArquivo = `relatorio_${cat}_${(empresaNome || 'empresa').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${period}.xlsx`
      XLSX.writeFile(wb, nomeArquivo)
      toast.success('Relatório gerado.')
      onClose()
    } catch {
      toast.error('Não foi possível gerar o relatório.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className="doc-ic file"><BarChart3 size={16} /></div>
            <span>Gerar relatório</span>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer' }}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {isAdmin && (
              <div className="mp-field">
                <label className="mp-label">Empresa</label>
                <div className="mp-select-wrap" style={{ width:'100%' }}>
                  <select className="mp-input" value={empresaIdEscolhida} onChange={e => setEmpresaIdEscolhida(e.target.value)} disabled={empresasQuery.isLoading}>
                    <option value="">Selecione…</option>
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
                  </select>
                  <ChevronDown size={14} className="mp-select-ic" />
                </div>
              </div>
            )}
            <div className="mp-field">
              <label className="mp-label">Categoria</label>
              <div className="mp-select-wrap" style={{ width:'100%' }}>
                <select className="mp-input" value={cat} onChange={e => setCat(e.target.value as RelCategoria)}>
                  {(Object.entries(CAT_LABELS) as [RelCategoria, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}{k === 'acidentes' ? ' (em breve)' : ''}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="mp-select-ic" />
              </div>
            </div>
            <div className="mp-field">
              <label className="mp-label">Período</label>
              <div className="mp-select-wrap" style={{ width:'100%' }}>
                <select className="mp-input" value={period} onChange={e => setPeriod(e.target.value as RelPeriod)}>
                  {(Object.entries(PERIOD_LABELS) as [RelPeriod, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="mp-select-ic" />
              </div>
            </div>
            <div className="mp-field">
              <label className="mp-label">Formato</label>
              <div className="seg" style={{ width:'fit-content' }}>
                <button type="button" className={`tbtn${formato === 'xlsx' ? '' : ' ghost'}`} style={{ fontSize:12 }} onClick={() => setFormato('xlsx')}>Excel</button>
                <button type="button" className={`tbtn${formato === 'pdf' ? '' : ' ghost'}`} style={{ fontSize:12 }} onClick={() => setFormato('pdf')}>PDF (em breve)</button>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="tbtn ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="tbtn accent" disabled={generating || dadosCarregando}>
                {generating || dadosCarregando ? <Loader2 size={14} className="btn-spinner" /> : <Download size={14} />}
                {generating ? 'Gerando…' : dadosCarregando ? 'Carregando dados…' : 'Gerar relatório'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RelatoriosAdmin
// ---------------------------------------------------------------------------
function RelatoriosAdmin() {
  const [showGerar, setShowGerar] = useState(false)
  const kpisQuery = useDashboardKpis('all')
  const kpis = kpisQuery.data

  const metricas: MetricaItem[] = kpis ? [
    { label: 'Empresas monitoradas',   valor: kpis.totalEmpresas,          cor: 'var(--blue-500)'   },
    { label: 'Colaboradores ativos',   valor: kpis.totalColaboradores,     cor: 'var(--navy-500)'   },
    { label: 'Conformidade geral',     valor: `${kpis.compliancePct}%`,    cor: 'var(--green-500)'  },
    { label: 'Documentos vencidos',    valor: kpis.docsVencidos,           cor: 'var(--red-500)'    },
    { label: 'Treinamentos vencidos',  valor: kpis.treinamentosVencidos,   cor: 'var(--red-500)'    },
    { label: 'Treinamentos monitorados', valor: kpis.totalTreinamentos,    cor: 'var(--green-500)'  },
  ] : []

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p className="sub">Relatórios de conformidade SST para todas as empresas</p>
        </div>
        <button className="tbtn accent" onClick={() => setShowGerar(true)}>
          <BarChart3 size={15} /> Gerar relatório
        </button>
      </div>

      <div className="rel-metricas-grid">
        {metricas.map((m, i) => <MetricaCard key={i} item={m} />)}
      </div>

      <div className="glass" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
        <BarChart3 size={36} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.25 }} />
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-600)', fontWeight: 600 }}>Nenhum relatório gerado ainda</p>
        <p style={{ margin: '4px 0 0', fontSize: 12 }}>Use o botão “Gerar relatório” para criar um novo.</p>
      </div>

      {showGerar && <GerarRelModal onClose={() => setShowGerar(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RelatoriosEmpresa
// ---------------------------------------------------------------------------
function RelatoriosEmpresa() {
  const [showGerar, setShowGerar] = useState(false)
  const { empresaId } = useCurrentProfile()
  const kpisQuery = useDashboardKpis(empresaId)
  const kpis = kpisQuery.data

  const metricas: MetricaItem[] = kpis ? [
    { label: 'Colaboradores',          valor: kpis.totalColaboradores,     cor: 'var(--blue-500)'   },
    { label: 'Conformidade geral',     valor: `${kpis.compliancePct}%`,    cor: 'var(--green-500)'  },
    { label: 'Docs vencendo',          valor: kpis.docsVencendo,           cor: 'var(--orange-500)' },
    { label: 'Docs vencidos',          valor: kpis.docsVencidos,           cor: 'var(--red-500)'    },
    { label: 'Treinamentos monitorados', valor: kpis.totalTreinamentos,    cor: 'var(--green-500)'  },
    { label: 'Treinamentos vencidos',  valor: kpis.treinamentosVencidos,   cor: 'var(--red-500)'    },
  ] : []

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p className="sub">Relatórios de conformidade da sua empresa</p>
        </div>
        <button className="tbtn accent" onClick={() => setShowGerar(true)}>
          <BarChart3 size={15} /> Gerar relatório
        </button>
      </div>

      <div className="rel-metricas-grid">
        {metricas.map((m, i) => <MetricaCard key={i} item={m} />)}
      </div>

      <div className="glass" style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)' }}>
        <BarChart3 size={36} style={{ margin: '0 auto 14px', display: 'block', opacity: 0.25 }} />
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-600)', fontWeight: 600 }}>Nenhum relatório gerado ainda</p>
        <p style={{ margin: '4px 0 0', fontSize: 12 }}>Use o botão “Gerar relatório” para criar um novo.</p>
      </div>

      {showGerar && <GerarRelModal onClose={() => setShowGerar(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default function RelatoriosPage() {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <RelatoriosAdmin /> : <RelatoriosEmpresa />
}
