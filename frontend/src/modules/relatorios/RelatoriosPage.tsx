import { useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Download, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useDashboardKpis } from '@/hooks/queries/useDashboard'

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

interface GerarRelModalProps { onClose: () => void }
function GerarRelModal({ onClose }: GerarRelModalProps) {
  const [cat, setCat] = useState<RelCategoria>('geral')
  const [period, setPeriod] = useState<RelPeriod>('30d')
  const [formato, setFormato] = useState<'pdf' | 'xlsx'>('pdf')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    toast.info('Geração de relatórios disponível em breve.')
    onClose()
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
            <div className="mp-field">
              <label className="mp-label">Categoria</label>
              <div className="mp-select-wrap" style={{ width:'100%' }}>
                <select className="mp-input" value={cat} onChange={e => setCat(e.target.value as RelCategoria)}>
                  {(Object.entries(CAT_LABELS) as [RelCategoria, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
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
                <button type="button" className={`tbtn${formato === 'pdf' ? '' : ' ghost'}`} style={{ fontSize:12 }} onClick={() => setFormato('pdf')}>PDF</button>
                <button type="button" className={`tbtn${formato === 'xlsx' ? '' : ' ghost'}`} style={{ fontSize:12 }} onClick={() => setFormato('xlsx')}>Excel</button>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="tbtn ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="tbtn accent">
                <Download size={14} /> Gerar relatório
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
