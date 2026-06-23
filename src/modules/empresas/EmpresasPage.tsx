import { useState, useMemo } from 'react'
import {
  Building2, Search, Plus, Eye, Trash2, X,
  Users, FileText, Heart, GraduationCap,
  MapPin, Phone, Mail, CheckCircle2, AlertTriangle,
  Clock, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EmpresaStatus = 'ativa' | 'suspensa' | 'pendente'
type EmpresaSetor = 'Metalurgia' | 'Construção Civil' | 'Metal-mecânica' | 'Transporte' | 'Alimentício' | 'Químico' | 'Mineração' | 'Outros'

interface Empresa {
  id: string
  nome: string
  cnpj: string
  setor: EmpresaSetor
  cidade: string
  uf: string
  responsavel: string
  email: string
  telefone: string
  colaboradores: number
  compliance: number     // 0–100 percent
  docsOk: number
  docsCrit: number
  examesOk: number
  examesCrit: number
  treinOk: number
  treinCrit: number
  status: EmpresaStatus
  desde: string          // ISO date
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const EMPRESAS: Empresa[] = [
  { id:'em1', nome:'Metalúrgica Belo Aço',   cnpj:'12.345.678/0001-90', setor:'Metalurgia',       cidade:'Porto Alegre',  uf:'RS', responsavel:'Carlos Melo',    email:'carlos@beloaco.com.br',   telefone:'(51) 3021-4500', colaboradores:247, compliance:97, docsOk:6,  docsCrit:1,  examesOk:231, examesCrit:16, treinOk:189, treinCrit:8,  status:'ativa',    desde:'2021-03-15' },
  { id:'em2', nome:'Construtora Nordin',      cnpj:'23.456.789/0001-01', setor:'Construção Civil',  cidade:'Canoas',        uf:'RS', responsavel:'Fernanda Souza', email:'fsouza@nordin.com.br',    telefone:'(51) 3344-2200', colaboradores:183, compliance:91, docsOk:5,  docsCrit:2,  examesOk:168, examesCrit:15, treinOk:154, treinCrit:12, status:'ativa',    desde:'2020-08-01' },
  { id:'em3', nome:'TechInox Ltda',           cnpj:'34.567.890/0001-12', setor:'Metal-mecânica',    cidade:'Novo Hamburgo', uf:'RS', responsavel:'Marcos Vieira',  email:'marcos@techinox.com',     telefone:'(51) 3540-8800', colaboradores:94,  compliance:99, docsOk:7,  docsCrit:0,  examesOk:91,  examesCrit:3,  treinOk:88,  treinCrit:2,  status:'ativa',    desde:'2022-01-10' },
  { id:'em4', nome:'Logística Sul Express',   cnpj:'45.678.901/0001-23', setor:'Transporte',        cidade:'Gravataí',      uf:'RS', responsavel:'Patrícia Lima',  email:'plima@sulexpress.com.br', telefone:'(51) 3490-6600', colaboradores:312, compliance:95, docsOk:6,  docsCrit:1,  examesOk:298, examesCrit:14, treinOk:270, treinCrit:18, status:'ativa',    desde:'2019-05-20' },
  { id:'em5', nome:'Frigorífico Pampa',       cnpj:'56.789.012/0001-34', setor:'Alimentício',       cidade:'Pelotas',       uf:'RS', responsavel:'Roberto Dias',   email:'rdias@frigopampa.com.br', telefone:'(53) 3221-7700', colaboradores:521, compliance:86, docsOk:4,  docsCrit:3,  examesOk:458, examesCrit:63, treinOk:420, treinCrit:40, status:'ativa',    desde:'2018-11-05' },
  { id:'em6', nome:'Química Horizonte',       cnpj:'67.890.123/0001-45', setor:'Químico',           cidade:'Triunfo',       uf:'RS', responsavel:'Ana Carvalho',   email:'acarvalho@qhorizonte.com',telefone:'(51) 3633-4400', colaboradores:76,  compliance:88, docsOk:5,  docsCrit:2,  examesOk:68,  examesCrit:8,  treinOk:65,  treinCrit:5,  status:'pendente', desde:'2023-09-18' },
  { id:'em7', nome:'Construção Alpha',        cnpj:'78.901.234/0001-56', setor:'Construção Civil',  cidade:'São Leopoldo',  uf:'RS', responsavel:'Luiz Santos',    email:'lsantos@construalpha.com', telefone:'(51) 3570-3300', colaboradores:142, compliance:93, docsOk:6,  docsCrit:1,  examesOk:133, examesCrit:9,  treinOk:125, treinCrit:8,  status:'ativa',    desde:'2021-07-30' },
  { id:'em8', nome:'Mineração Cordeiro',      cnpj:'89.012.345/0001-67', setor:'Mineração',         cidade:'Caçapava do Sul',uf:'RS', responsavel:'Simone Rocha',   email:'srocha@mincordeiro.com.br',telefone:'(55) 3281-5500', colaboradores:388, compliance:82, docsOk:4,  docsCrit:3,  examesOk:340, examesCrit:48, treinOk:310, treinCrit:35, status:'suspensa', desde:'2017-04-12' },
]

const STATUS_LABELS: Record<EmpresaStatus, string> = {
  ativa:    'Ativa',
  suspensa: 'Suspensa',
  pendente: 'Pendente',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCNPJ(cnpj: string) { return cnpj }
function fmtDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function complianceColor(n: number) {
  if (n >= 95) return 'var(--green-500)'
  if (n >= 85) return 'var(--orange-500)'
  return 'var(--red-500)'
}

// ---------------------------------------------------------------------------
// NovaEmpresaModal
// ---------------------------------------------------------------------------
interface NovaEmpresaModalProps { onClose: () => void }
function NovaEmpresaModal({ onClose }: NovaEmpresaModalProps) {
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [setor, setSetor] = useState<EmpresaSetor>('Metalurgia')
  const [cidade, setCidade] = useState('')
  const [resp, setResp] = useState('')
  const [email, setEmail] = useState('')

  const setores: EmpresaSetor[] = ['Metalurgia','Construção Civil','Metal-mecânica','Transporte','Alimentício','Químico','Mineração','Outros']

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth:500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div className="doc-ic file"><Building2 size={16} /></div>
            <span>Nova empresa</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="mp-field">
              <label className="mp-label">Razão social</label>
              <input className="mp-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da empresa" required />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="mp-field">
                <label className="mp-label">CNPJ</label>
                <input className="mp-input" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" required />
              </div>
              <div className="mp-field">
                <label className="mp-label">Setor</label>
                <div className="mp-select-wrap" style={{ width:'100%' }}>
                  <select className="mp-input" value={setor} onChange={e => setSetor(e.target.value as EmpresaSetor)}>
                    {setores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} className="mp-select-ic" />
                </div>
              </div>
            </div>
            <div className="mp-field">
              <label className="mp-label">Cidade / UF</label>
              <input className="mp-input" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Porto Alegre, RS" required />
            </div>
            <div className="mp-field">
              <label className="mp-label">Responsável SST</label>
              <input className="mp-input" value={resp} onChange={e => setResp(e.target.value)} placeholder="Nome do responsável" required />
            </div>
            <div className="mp-field">
              <label className="mp-label">E-mail</label>
              <input className="mp-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="responsavel@empresa.com" required />
            </div>
            <div className="modal-foot">
              <button type="button" className="tbtn ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="tbtn accent">
                <Plus size={14} /> Cadastrar empresa
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmpresaDetailPanel
// ---------------------------------------------------------------------------
interface EmpresaDetailProps { empresa: Empresa; onClose: () => void }
function EmpresaDetailPanel({ empresa: e, onClose }: EmpresaDetailProps) {
  return (
    <div className="glass emp-detail-panel">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', marginBottom:16 }}>
        <div>
          <div className="aso-name">{e.nome}</div>
          <div className="aso-role">{e.setor} · {e.cidade}/{e.uf}</div>
        </div>
        <button className="icon-btn sm" onClick={onClose}><X size={13} /></button>
      </div>

      {/* compliance gauge */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--ink-700)' }}>Compliance geral</span>
          <span style={{ fontSize:18, fontWeight:800, color: complianceColor(e.compliance) }}>{e.compliance}%</span>
        </div>
        <div className="exame-progress-bar" style={{ height:8 }}>
          <div className="exame-progress-fill" style={{ width:`${e.compliance}%`, background: complianceColor(e.compliance) }} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="emp-stat-grid">
        <div className="emp-stat-item">
          <FileText size={13} style={{ color:'var(--blue-500)' }} />
          <div>
            <div className="emp-stat-n">{e.docsOk}</div>
            <div className="emp-stat-l">Docs ok</div>
          </div>
          {e.docsCrit > 0 && <span className="chip crit" style={{ marginLeft:'auto' }}>{e.docsCrit}</span>}
        </div>
        <div className="emp-stat-item">
          <Heart size={13} style={{ color:'var(--red-500)' }} />
          <div>
            <div className="emp-stat-n">{e.examesOk}</div>
            <div className="emp-stat-l">ASOs ok</div>
          </div>
          {e.examesCrit > 0 && <span className="chip crit" style={{ marginLeft:'auto' }}>{e.examesCrit}</span>}
        </div>
        <div className="emp-stat-item">
          <GraduationCap size={13} style={{ color:'var(--violet-500)' }} />
          <div>
            <div className="emp-stat-n">{e.treinOk}</div>
            <div className="emp-stat-l">Trein. ok</div>
          </div>
          {e.treinCrit > 0 && <span className="chip warn" style={{ marginLeft:'auto' }}>{e.treinCrit}</span>}
        </div>
        <div className="emp-stat-item">
          <Users size={13} style={{ color:'var(--navy-500)' }} />
          <div>
            <div className="emp-stat-n">{e.colaboradores}</div>
            <div className="emp-stat-l">Colaboradores</div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
        <div className="aso-block-head">Contato</div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--ink-700)' }}>
          <Users size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.responsavel}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink-500)' }}>
          <Mail size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.email}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink-500)' }}>
          <Phone size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.telefone}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink-500)' }}>
          <MapPin size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.cidade} / {e.uf}
        </div>
      </div>

      <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--ink-400)' }}>
        CNPJ {fmtCNPJ(e.cnpj)} · cliente desde {fmtDate(e.desde)}
      </div>

      <button className="tbtn accent" style={{ width:'100%', marginTop:16 }}>
        <Eye size={14} /> Ver empresa completo
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmpresasPage (admin only)
// ---------------------------------------------------------------------------
export default function EmpresasPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<EmpresaStatus | 'todos'>('todos')
  const [filterSetor, setFilterSetor] = useState<EmpresaSetor | 'todos'>('todos')
  const [selected, setSelected] = useState<Empresa | null>(null)
  const [showNova, setShowNova] = useState(false)

  // Redirect if not admin
  if (profile?.role !== 'admin') {
    return (
      <div className="content">
        <div style={{ padding:40, textAlign:'center', color:'var(--ink-500)' }}>
          <Building2 size={40} style={{ margin:'0 auto 12px', opacity:0.3 }} />
          <div>Acesso restrito a administradores.</div>
        </div>
      </div>
    )
  }

  const setores = [...new Set(EMPRESAS.map(e => e.setor))] as EmpresaSetor[]

  const filtered = useMemo(() => EMPRESAS.filter(e => {
    const matchSearch = !search ||
      e.nome.toLowerCase().includes(search.toLowerCase()) ||
      e.cidade.toLowerCase().includes(search.toLowerCase()) ||
      e.responsavel.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'todos' || e.status === filterStatus
    const matchSetor  = filterSetor  === 'todos' || e.setor  === filterSetor
    return matchSearch && matchStatus && matchSetor
  }), [search, filterStatus, filterSetor])

  const totalColabs = EMPRESAS.reduce((s, e) => s + e.colaboradores, 0)
  const totalAtivas = EMPRESAS.filter(e => e.status === 'ativa').length
  const avgCompliance = Math.round(EMPRESAS.reduce((s, e) => s + e.compliance, 0) / EMPRESAS.length)
  const critCount = EMPRESAS.filter(e => e.compliance < 85).length

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Empresas</h1>
          <p className="sub">Gestão de empresas clientes e conformidade SST</p>
        </div>
        <button className="tbtn accent" onClick={() => setShowNova(true)}>
          <Plus size={15} /> Nova empresa
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Empresas ativas</div>
          <div className="kpi-value">{totalAtivas}</div>
          <div className="kpi-meta">de {EMPRESAS.length} cadastradas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total de colaboradores</div>
          <div className="kpi-value">{totalColabs.toLocaleString('pt-BR')}</div>
          <div className="kpi-meta"><Users size={12} /> monitorados</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Compliance médio</div>
          <div className="kpi-value" style={{ color: complianceColor(avgCompliance) }}>{avgCompliance}%</div>
          <div className="kpi-meta">media geral</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Abaixo do limite</div>
          <div className="kpi-value" style={{ color: critCount > 0 ? 'var(--red-500)' : 'var(--green-500)' }}>{critCount}</div>
          <div className="kpi-meta">compliance &lt; 85%</div>
        </div>
      </div>

      {/* Alert */}
      {critCount > 0 && (
        <div className="doc-alert">
          <AlertTriangle size={18} className="doc-alert-ic" />
          <div>
            <div className="doc-alert-title">{critCount} empresa{critCount > 1 ? 's' : ''} abaixo do nível mínimo de compliance</div>
            <div className="doc-alert-row">
              {EMPRESAS.filter(e => e.compliance < 85).map(e => (
                <span key={e.id} className="doc-alert-chip crit">{e.nome} · {e.compliance}%</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Layout: table + detail */}
      <div className="row-2" style={{ alignItems:'start', gap:20 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {/* Filters */}
          <div className="glass" style={{ borderRadius:14, overflow:'hidden' }}>
            <div className="doc-tbl-head">
              <div className="doc-search">
                <Search size={14} style={{ color:'var(--ink-400)' }} />
                <input
                  placeholder="Buscar empresa, cidade ou responsável…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <div className="mp-select-wrap" style={{ width:150 }}>
                  <select className="mp-input" style={{ height:34, fontSize:12 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value as EmpresaStatus | 'todos')}>
                    <option value="todos">Todos status</option>
                    <option value="ativa">Ativa</option>
                    <option value="pendente">Pendente</option>
                    <option value="suspensa">Suspensa</option>
                  </select>
                  <ChevronDown size={12} className="mp-select-ic" />
                </div>
                <div className="mp-select-wrap" style={{ width:170 }}>
                  <select className="mp-input" style={{ height:34, fontSize:12 }} value={filterSetor} onChange={e => setFilterSetor(e.target.value as EmpresaSetor | 'todos')}>
                    <option value="todos">Todos os setores</option>
                    {setores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={12} className="mp-select-ic" />
                </div>
              </div>
            </div>

            <table className="tbl">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Setor</th>
                  <th>Cidade</th>
                  <th style={{ textAlign:'center' }}>Colabs</th>
                  <th style={{ textAlign:'center' }}>Compliance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => (
                  <tr
                    key={emp.id}
                    onClick={() => setSelected(emp)}
                    style={{ cursor:'pointer', background: selected?.id === emp.id ? 'var(--blue-50)' : undefined }}
                  >
                    <td>
                      <div className="doc-name">
                        <div className="doc-ic file"><Building2 size={14} /></div>
                        <div>
                          <div className="doc-name-main">{emp.nome}</div>
                          <div className="doc-name-sub">{emp.cnpj}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="doc-type-pill">{emp.setor}</span></td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, color:'var(--ink-700)' }}>
                        <MapPin size={11} style={{ color:'var(--ink-400)' }} /> {emp.cidade}/{emp.uf}
                      </div>
                    </td>
                    <td style={{ textAlign:'center', fontWeight:600 }}>{emp.colaboradores}</td>
                    <td>
                      <div className="exame-progress-wrap" style={{ justifyContent:'center' }}>
                        <div className="exame-progress-bar" style={{ minWidth:50 }}>
                          <div className="exame-progress-fill" style={{ width:`${emp.compliance}%`, background: complianceColor(emp.compliance) }} />
                        </div>
                        <span className="exame-progress-pct" style={{ color: complianceColor(emp.compliance) }}>{emp.compliance}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`chip ${emp.status === 'ativa' ? 'ok' : emp.status === 'pendente' ? 'warn' : 'crit'}`}>
                        {emp.status === 'ativa' && <CheckCircle2 size={10} />}
                        {emp.status === 'pendente' && <Clock size={10} />}
                        {emp.status === 'suspensa' && <AlertTriangle size={10} />}
                        {STATUS_LABELS[emp.status]}
                      </span>
                    </td>
                    <td>
                      <div className="doc-actions">
                        <button className="icon-btn sm" title="Ver detalhes" onClick={e => { e.stopPropagation(); setSelected(emp) }}>
                          <Eye size={13} />
                        </button>
                        <button className="icon-btn sm danger" title="Remover" onClick={e => e.stopPropagation()}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {selected ? (
          <EmpresaDetailPanel empresa={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="glass emp-detail-panel" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40 }}>
            <Building2 size={36} style={{ color:'var(--ink-300)', marginBottom:10 }} />
            <div style={{ fontSize:13, color:'var(--ink-400)', textAlign:'center' }}>Selecione uma empresa para ver os detalhes</div>
          </div>
        )}
      </div>

      {showNova && <NovaEmpresaModal onClose={() => setShowNova(false)} />}
    </div>
  )
}
