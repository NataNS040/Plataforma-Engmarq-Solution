import { useState } from 'react'
import {
  BarChart3, Download, FileText, Calendar, TrendingUp,
  TrendingDown, AlertTriangle, CheckCircle2, Users,
  GraduationCap, Heart, Shield, ChevronDown, Eye,
} from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RelPeriod = '30d' | '90d' | '6m' | '12m'
type RelCategoria = 'geral' | 'treinamentos' | 'exames' | 'documentos' | 'acidentes'

interface RelatorioCard {
  id: string
  titulo: string
  descricao: string
  categoria: RelCategoria
  periodo: string
  gerado: string      // ISO date
  tamanho: string
  icon: React.ElementType
  destaque?: string
  tendencia?: 'up' | 'down' | 'neutro'
}

interface MetricaItem {
  label: string
  valor: string | number
  variacao?: number   // percent, positive = melhora
  cor?: string
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const RELATORIOS: RelatorioCard[] = [
  {
    id:'r1', titulo:'Relatório de Conformidade Geral',
    descricao:'Panorama completo de documentos, exames e treinamentos de todas as empresas.',
    categoria:'geral', periodo:'Junho 2026', gerado:'2026-06-01',
    tamanho:'2,4 MB', icon: Shield, destaque:'98,4% compliance', tendencia:'up',
  },
  {
    id:'r2', titulo:'Treinamentos NR — Resumo Mensal',
    descricao:'Índice de conclusão por NR, por empresa e por colaborador.',
    categoria:'treinamentos', periodo:'Maio 2026', gerado:'2026-06-02',
    tamanho:'1,1 MB', icon: GraduationCap, destaque:'94% conclusão', tendencia:'up',
  },
  {
    id:'r3', titulo:'Exames Ocupacionais — ASOs Vencidos',
    descricao:'Lista de ASOs vencidos e prestes a vencer com risco de autuação.',
    categoria:'exames', periodo:'Junho 2026', gerado:'2026-06-10',
    tamanho:'0,8 MB', icon: Heart, destaque:'87 ASOs críticos', tendencia:'down',
  },
  {
    id:'r4', titulo:'Documentação Empresarial — Status',
    descricao:'Status de todos os documentos legais por empresa (PCMSO, PPRA, LTCAT, etc.).',
    categoria:'documentos', periodo:'Junho 2026', gerado:'2026-06-12',
    tamanho:'1,6 MB', icon: FileText, destaque:'12 docs vencendo', tendencia:'neutro',
  },
  {
    id:'r5', titulo:'Registro de Acidentes e Incidentes',
    descricao:'CAT registradas, acidentes sem afastamento e quase-acidentes do semestre.',
    categoria:'acidentes', periodo:'Jan–Jun 2026', gerado:'2026-06-15',
    tamanho:'3,2 MB', icon: AlertTriangle, destaque:'3 CATs emitidas', tendencia:'up',
  },
  {
    id:'r6', titulo:'Relatório de Auditoria SST',
    descricao:'Resultado das auditorias realizadas nas empresas cadastradas no período.',
    categoria:'geral', periodo:'1º Semestre 2026', gerado:'2026-06-20',
    tamanho:'4,8 MB', icon: Shield, destaque:'7 empresas auditadas', tendencia:'up',
  },
]

const METRICAS_GERAL: MetricaItem[] = [
  { label:'Empresas monitoradas',      valor:24,    variacao:+4,   cor:'var(--blue-500)' },
  { label:'Colaboradores ativos',      valor:1863,  variacao:+47,  cor:'var(--navy-500)' },
  { label:'Conformidade geral',        valor:'98,4%',variacao:+0.8, cor:'var(--green-500)' },
  { label:'Documentos vencidos',       valor:12,    variacao:-3,   cor:'var(--red-500)' },
  { label:'ASOs vencidos',             valor:87,    variacao:-12,  cor:'var(--red-500)' },
  { label:'Treinamentos concluídos',   valor:342,   variacao:+28,  cor:'var(--green-500)' },
]

const METRICAS_EMPRESA: MetricaItem[] = [
  { label:'Colaboradores',         valor:247,   variacao:+5,   cor:'var(--blue-500)' },
  { label:'Conformidade geral',    valor:'96,2%',variacao:+1.4, cor:'var(--green-500)' },
  { label:'ASOs em dia',           valor:231,   variacao:+8,   cor:'var(--green-500)' },
  { label:'Treinamentos 2026',     valor:189,   variacao:+21,  cor:'var(--green-500)' },
  { label:'Documentos pendentes',  valor:4,     variacao:-1,   cor:'var(--orange-500)' },
  { label:'Incidentes no período', valor:1,     variacao:0,    cor:'var(--ink-500)' },
]

const CAT_LABELS: Record<RelCategoria, string> = {
  geral:        'Geral',
  treinamentos: 'Treinamentos',
  exames:       'Exames',
  documentos:   'Documentos',
  acidentes:    'Acidentes',
}

const PERIOD_LABELS: Record<RelPeriod, string> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '6m':  'Últimos 6 meses',
  '12m': 'Último ano',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtBR(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
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

interface GerarRelModalProps { onClose: () => void }
function GerarRelModal({ onClose }: GerarRelModalProps) {
  const [cat, setCat] = useState<RelCategoria>('geral')
  const [period, setPeriod] = useState<RelPeriod>('30d')
  const [formato, setFormato] = useState<'pdf' | 'xlsx'>('pdf')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
  const [filterCat, setFilterCat] = useState<RelCategoria | 'todos'>('todos')
  const [showGerar, setShowGerar] = useState(false)

  const filtered = filterCat === 'todos' ? RELATORIOS : RELATORIOS.filter(r => r.categoria === filterCat)

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

      {/* Métricas */}
      <div className="rel-metricas-grid">
        {METRICAS_GERAL.map((m, i) => <MetricaCard key={i} item={m} />)}
      </div>

      {/* Filtros categoria */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {(['todos', ...Object.keys(CAT_LABELS)] as (RelCategoria | 'todos')[]).map(cat => (
          <button
            key={cat}
            className={`tbtn${filterCat === cat ? '' : ' ghost'} sm`}
            onClick={() => setFilterCat(cat)}
          >
            {cat === 'todos' ? 'Todos' : CAT_LABELS[cat as RelCategoria]}
          </button>
        ))}
      </div>

      {/* Cards de relatórios */}
      <div className="rel-cards-grid">
        {filtered.map(rel => {
          const Icon = rel.icon
          return (
            <div key={rel.id} className="glass rel-card">
              <div className="rel-card-head">
                <div className="doc-ic file"><Icon size={16} /></div>
                <span className="doc-type-pill">{CAT_LABELS[rel.categoria]}</span>
                {rel.tendencia && rel.tendencia !== 'neutro' && (
                  <span className={`chip ${rel.tendencia === 'up' ? 'ok' : 'crit'}`} style={{ marginLeft:'auto' }}>
                    {rel.tendencia === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {rel.destaque}
                  </span>
                )}
              </div>
              <div className="rel-card-titulo">{rel.titulo}</div>
              <div className="rel-card-desc">{rel.descricao}</div>
              <div className="rel-card-foot">
                <div className="rel-card-meta">
                  <Calendar size={11} /> {rel.periodo}
                  <span style={{ color:'var(--ink-300)' }}>·</span>
                  <span>{rel.tamanho}</span>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="icon-btn sm" title="Visualizar"><Eye size={13} /></button>
                  <button className="icon-btn sm" title="Baixar"><Download size={13} /></button>
                </div>
              </div>
            </div>
          )
        })}
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

  const empRelatorios = RELATORIOS.filter(r =>
    ['treinamentos', 'exames', 'documentos'].includes(r.categoria)
  )

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

      {/* Métricas */}
      <div className="rel-metricas-grid">
        {METRICAS_EMPRESA.map((m, i) => <MetricaCard key={i} item={m} />)}
      </div>

      {/* Relatórios disponíveis */}
      <div style={{ marginBottom:12 }}>
        <h2 style={{ fontSize:15, fontWeight:700, color:'var(--ink-900)' }}>Relatórios disponíveis</h2>
      </div>

      <div className="rel-cards-grid">
        {empRelatorios.map(rel => {
          const Icon = rel.icon
          return (
            <div key={rel.id} className="glass rel-card">
              <div className="rel-card-head">
                <div className="doc-ic file"><Icon size={16} /></div>
                <span className="doc-type-pill">{CAT_LABELS[rel.categoria]}</span>
                {rel.destaque && (
                  <span className={`chip ${rel.tendencia === 'up' ? 'ok' : rel.tendencia === 'down' ? 'crit' : 'warn'}`} style={{ marginLeft:'auto' }}>
                    {rel.destaque}
                  </span>
                )}
              </div>
              <div className="rel-card-titulo">{rel.titulo}</div>
              <div className="rel-card-desc">{rel.descricao}</div>
              <div className="rel-card-foot">
                <div className="rel-card-meta">
                  <Calendar size={11} /> {rel.periodo}
                  <span style={{ color:'var(--ink-300)' }}>·</span>
                  <span>{rel.tamanho}</span>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="icon-btn sm" title="Visualizar"><Eye size={13} /></button>
                  <button className="icon-btn sm" title="Baixar"><Download size={13} /></button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Histórico */}
      <div style={{ marginTop:24 }}>
        <h2 style={{ fontSize:15, fontWeight:700, color:'var(--ink-900)', marginBottom:12 }}>Histórico de downloads</h2>
        <div className="glass" style={{ borderRadius:14, overflow:'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Relatório</th>
                <th>Categoria</th>
                <th>Período</th>
                <th>Gerado em</th>
                <th>Tamanho</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {empRelatorios.map(r => {
                const Icon = r.icon
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="doc-name">
                        <div className="doc-ic file"><Icon size={14} /></div>
                        <div className="doc-name-main">{r.titulo}</div>
                      </div>
                    </td>
                    <td><span className="doc-type-pill">{CAT_LABELS[r.categoria]}</span></td>
                    <td style={{ fontSize:12.5, color:'var(--ink-700)' }}>{r.periodo}</td>
                    <td style={{ fontSize:12.5 }}>{fmtBR(r.gerado)}</td>
                    <td style={{ fontSize:12, color:'var(--ink-500)' }}>{r.tamanho}</td>
                    <td>
                      <button className="icon-btn sm" title="Baixar novamente"><Download size={13} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
