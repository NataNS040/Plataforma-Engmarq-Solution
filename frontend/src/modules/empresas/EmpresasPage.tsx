import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2, Search, Plus, Eye, Trash2, X,
  Users, FileText, Heart, GraduationCap,
  MapPin, Phone, Mail, CheckCircle2, AlertTriangle,
  Clock, ChevronDown, Loader2,
} from 'lucide-react'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import {
  useEmpresas,
  useCriarEmpresa,
  useDesativarEmpresa,
} from '@/hooks/queries/useEmpresas'
import type { EmpresaComContagem } from '@/services/empresasService'
import type { Empresa } from '@/types/database'

type EmpresaStatus = Empresa['status']

const STATUS_LABELS: Record<EmpresaStatus, string> = {
  ativa:    'Ativa',
  suspensa: 'Suspensa',
  pendente: 'Pendente',
}

const SETORES = [
  'Metalurgia', 'Construção Civil', 'Metal-mecânica', 'Transporte',
  'Alimentício', 'Químico', 'Mineração', 'Outros',
] as const

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

const CNPJ_REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/

// ---------------------------------------------------------------------------
// Nova empresa: schema + modal
// ---------------------------------------------------------------------------
const empresaSchema = z.object({
  razao_social: z.string().min(2, 'Informe a razão social'),
  cnpj: z.string().regex(CNPJ_REGEX, 'Formato: 00.000.000/0001-00'),
  setor: z.string().min(1, 'Selecione o setor'),
  cidade: z.string().min(1, 'Informe a cidade'),
  uf: z.string().length(2, 'UF'),
  responsavel: z.string().min(2, 'Informe o responsável'),
  email: z.string().email('E-mail inválido'),
  telefone: z.string(),
})

type EmpresaForm = z.infer<typeof empresaSchema>

function FieldError({ msg }: { msg: string }) {
  return (
    <span role="alert" style={{ color:'var(--red-600, #dc2626)', fontSize:11.5, marginTop:4, display:'block' }}>
      {msg}
    </span>
  )
}

function NovaEmpresaModal({ onClose }: { onClose: () => void }) {
  const criar = useCriarEmpresa()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmpresaForm>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      razao_social: '', cnpj: '', setor: 'Metalurgia',
      cidade: '', uf: 'RS', responsavel: '', email: '', telefone: '',
    },
  })

  async function onSubmit(values: EmpresaForm) {
    try {
      await criar.mutateAsync(values)
      onClose()
    } catch {
      // toast já foi disparado pelo hook
    }
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
          <form onSubmit={handleSubmit(onSubmit)} style={{ display:'flex', flexDirection:'column', gap:14 }} noValidate>
            <div className="mp-field">
              <label className="mp-label">Razão social</label>
              <input className="mp-input" placeholder="Nome da empresa" {...register('razao_social')} />
              {errors.razao_social && <FieldError msg={errors.razao_social.message!} />}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="mp-field">
                <label className="mp-label">CNPJ</label>
                <input className="mp-input" placeholder="00.000.000/0001-00" {...register('cnpj')} />
                {errors.cnpj && <FieldError msg={errors.cnpj.message!} />}
              </div>
              <div className="mp-field">
                <label className="mp-label">Setor</label>
                <div className="mp-select-wrap" style={{ width:'100%' }}>
                  <select className="mp-input" {...register('setor')}>
                    {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} className="mp-select-ic" />
                </div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12 }}>
              <div className="mp-field">
                <label className="mp-label">Cidade</label>
                <input className="mp-input" placeholder="Porto Alegre" {...register('cidade')} />
                {errors.cidade && <FieldError msg={errors.cidade.message!} />}
              </div>
              <div className="mp-field">
                <label className="mp-label">UF</label>
                <div className="mp-select-wrap" style={{ width:'100%' }}>
                  <select className="mp-input" {...register('uf')}>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown size={14} className="mp-select-ic" />
                </div>
              </div>
            </div>
            <div className="mp-field">
              <label className="mp-label">Responsável SST</label>
              <input className="mp-input" placeholder="Nome do responsável" {...register('responsavel')} />
              {errors.responsavel && <FieldError msg={errors.responsavel.message!} />}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="mp-field">
                <label className="mp-label">E-mail</label>
                <input className="mp-input" type="email" placeholder="responsavel@empresa.com" {...register('email')} />
                {errors.email && <FieldError msg={errors.email.message!} />}
              </div>
              <div className="mp-field">
                <label className="mp-label">Telefone</label>
                <input className="mp-input" placeholder="(51) 3000-0000" {...register('telefone')} />
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="tbtn ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="tbtn accent" disabled={criar.isPending}>
                {criar.isPending ? <Loader2 size={14} className="btn-spinner" /> : <Plus size={14} />}
                {criar.isPending ? 'Salvando...' : 'Cadastrar empresa'}
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
function EmpresaDetailPanel({ empresa: e, onClose }: { empresa: EmpresaComContagem; onClose: () => void }) {
  return (
    <div className="glass emp-detail-panel">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', marginBottom:16 }}>
        <div>
          <div className="aso-name">{e.razao_social}</div>
          <div className="aso-role">{e.setor ?? '—'} · {e.cidade ?? '—'}{e.uf ? `/${e.uf}` : ''}</div>
        </div>
        <button className="icon-btn sm" onClick={onClose}><X size={13} /></button>
      </div>

      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--ink-700)' }}>Compliance geral</span>
          <span style={{ fontSize:18, fontWeight:800, color:'var(--ink-400)' }}>—</span>
        </div>
        <div className="exame-progress-bar" style={{ height:8 }}>
          <div className="exame-progress-fill" style={{ width:'0%', background:'var(--ink-200)' }} />
        </div>
        <div style={{ fontSize:11, color:'var(--ink-400)', marginTop:4 }}>
          Cálculo em breve — depende dos módulos de Documentos e Treinamentos.
        </div>
      </div>

      <div className="emp-stat-grid">
        <div className="emp-stat-item">
          <Users size={13} style={{ color:'var(--navy-500)' }} />
          <div>
            <div className="emp-stat-n">{e.colaboradores_count}</div>
            <div className="emp-stat-l">Colaboradores</div>
          </div>
        </div>
        <div className="emp-stat-item">
          <FileText size={13} style={{ color:'var(--blue-500)' }} />
          <div>
            <div className="emp-stat-n">—</div>
            <div className="emp-stat-l">Docs</div>
          </div>
        </div>
        <div className="emp-stat-item">
          <Heart size={13} style={{ color:'var(--red-500)' }} />
          <div>
            <div className="emp-stat-n">—</div>
            <div className="emp-stat-l">ASOs</div>
          </div>
        </div>
        <div className="emp-stat-item">
          <GraduationCap size={13} style={{ color:'var(--violet-500)' }} />
          <div>
            <div className="emp-stat-n">—</div>
            <div className="emp-stat-l">Treinamentos</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
        <div className="aso-block-head">Contato</div>
        {e.responsavel && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--ink-700)' }}>
            <Users size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.responsavel}
          </div>
        )}
        {e.email && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink-500)' }}>
            <Mail size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.email}
          </div>
        )}
        {e.telefone && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink-500)' }}>
            <Phone size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.telefone}
          </div>
        )}
        {(e.cidade || e.uf) && (
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--ink-500)' }}>
            <MapPin size={12} style={{ flexShrink:0, color:'var(--ink-400)' }} /> {e.cidade}{e.uf ? ` / ${e.uf}` : ''}
          </div>
        )}
      </div>

      <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--ink-400)' }}>
        CNPJ {e.cnpj} · cliente desde {fmtDate(e.created_at)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmpresasPage
// ---------------------------------------------------------------------------
export default function EmpresasPage() {
  const { isAdmin } = useCurrentProfile()
  const empresasQuery = useEmpresas()
  const desativar = useDesativarEmpresa()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<EmpresaStatus | 'todos'>('todos')
  const [filterSetor, setFilterSetor] = useState<string>('todos')
  const [selected, setSelected] = useState<EmpresaComContagem | null>(null)
  const [showNova, setShowNova] = useState(false)

  const empresas = empresasQuery.data ?? []

  const setores = useMemo(
    () => [...new Set(empresas.map(e => e.setor).filter(Boolean) as string[])],
    [empresas]
  )

  const filtered = useMemo(() => empresas.filter(e => {
    const s = search.toLowerCase()
    const matchSearch = !search ||
      e.razao_social.toLowerCase().includes(s) ||
      (e.cidade ?? '').toLowerCase().includes(s) ||
      (e.responsavel ?? '').toLowerCase().includes(s) ||
      e.cnpj.includes(search)
    const matchStatus = filterStatus === 'todos' || e.status === filterStatus
    const matchSetor  = filterSetor  === 'todos' || e.setor  === filterSetor
    return matchSearch && matchStatus && matchSetor
  }), [empresas, search, filterStatus, filterSetor])

  const totalColabs = empresas.reduce((s, e) => s + e.colaboradores_count, 0)
  const totalAtivas = empresas.filter(e => e.status === 'ativa').length

  if (!isAdmin) {
    return (
      <div className="content">
        <div style={{ padding:40, textAlign:'center', color:'var(--ink-500)' }}>
          <Building2 size={40} style={{ margin:'0 auto 12px', opacity:0.3 }} />
          <div>Acesso restrito a administradores.</div>
        </div>
      </div>
    )
  }

  async function handleDesativar(e: EmpresaComContagem) {
    const ok = window.confirm(
      `Suspender "${e.razao_social}"? A empresa deixará de estar ativa mas os dados serão preservados.`
    )
    if (!ok) return
    try {
      await desativar.mutateAsync(e.id)
      if (selected?.id === e.id) setSelected(null)
    } catch {
      // toast já disparado
    }
  }

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

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Empresas ativas</div>
          <div className="kpi-value">{totalAtivas}</div>
          <div className="kpi-meta">de {empresas.length} cadastradas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total de colaboradores</div>
          <div className="kpi-value">{totalColabs.toLocaleString('pt-BR')}</div>
          <div className="kpi-meta"><Users size={12} /> monitorados</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Compliance médio</div>
          <div className="kpi-value" style={{ color:'var(--ink-400)' }}>—</div>
          <div className="kpi-meta">em breve</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Alertas críticos</div>
          <div className="kpi-value" style={{ color:'var(--ink-400)' }}>—</div>
          <div className="kpi-meta">em breve</div>
        </div>
      </div>

      <div className="row-2" style={{ alignItems:'start', gap:20 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="glass" style={{ borderRadius:14, overflow:'hidden' }}>
            <div className="doc-tbl-head">
              <div className="doc-search">
                <Search size={14} style={{ color:'var(--ink-400)' }} />
                <input
                  placeholder="Buscar empresa, cidade, CNPJ ou responsável…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <div className="mp-select-wrap" style={{ width:150 }}>
                  <select
                    className="mp-input" style={{ height:34, fontSize:12 }}
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value as EmpresaStatus | 'todos')}
                  >
                    <option value="todos">Todos status</option>
                    <option value="ativa">Ativa</option>
                    <option value="pendente">Pendente</option>
                    <option value="suspensa">Suspensa</option>
                  </select>
                  <ChevronDown size={12} className="mp-select-ic" />
                </div>
                <div className="mp-select-wrap" style={{ width:170 }}>
                  <select
                    className="mp-input" style={{ height:34, fontSize:12 }}
                    value={filterSetor}
                    onChange={e => setFilterSetor(e.target.value)}
                  >
                    <option value="todos">Todos os setores</option>
                    {setores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={12} className="mp-select-ic" />
                </div>
              </div>
            </div>

            {empresasQuery.isLoading ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13 }}>
                <Loader2 size={20} className="btn-spinner" style={{ display:'inline-block', marginRight:8 }} />
                Carregando empresas…
              </div>
            ) : empresasQuery.isError ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--red-500)', fontSize:13 }}>
                <AlertTriangle size={20} style={{ display:'inline-block', marginRight:8 }} />
                Erro ao carregar empresas.{' '}
                <button className="tbtn ghost" style={{ marginLeft:8 }} onClick={() => empresasQuery.refetch()}>
                  Tentar novamente
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13 }}>
                <Building2 size={28} style={{ margin:'0 auto 8px', opacity:0.4, display:'block' }} />
                {empresas.length === 0
                  ? 'Nenhuma empresa cadastrada ainda. Comece adicionando uma.'
                  : 'Nenhuma empresa encontrada com esses filtros.'}
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Setor</th>
                    <th>Cidade</th>
                    <th style={{ textAlign:'center' }}>Colabs</th>
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
                            <div className="doc-name-main">{emp.razao_social}</div>
                            <div className="doc-name-sub">{emp.cnpj}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {emp.setor
                          ? <span className="doc-type-pill">{emp.setor}</span>
                          : <span style={{ color:'var(--ink-400)' }}>—</span>}
                      </td>
                      <td>
                        {emp.cidade
                          ? <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12.5, color:'var(--ink-700)' }}>
                              <MapPin size={11} style={{ color:'var(--ink-400)' }} /> {emp.cidade}{emp.uf ? `/${emp.uf}` : ''}
                            </div>
                          : <span style={{ color:'var(--ink-400)' }}>—</span>}
                      </td>
                      <td style={{ textAlign:'center', fontWeight:600 }}>{emp.colaboradores_count}</td>
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
                          <button
                            className="icon-btn sm danger"
                            title="Suspender"
                            disabled={emp.status === 'suspensa' || desativar.isPending}
                            onClick={e => { e.stopPropagation(); void handleDesativar(emp) }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

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
