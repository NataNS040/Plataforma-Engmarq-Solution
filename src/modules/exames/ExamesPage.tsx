import { useState, useMemo } from 'react'
import {
  CheckCircle2, Clock, AlertTriangle, Calendar, Download, Plus,
  Eye, Trash2, X, Search, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useExames, useCriarExame, useDeletarExame, useExamesCatalogo } from '@/hooks/queries/useExames'
import { useColaboradores } from '@/hooks/queries/useColaboradores'
import { useDocumentoTipos } from '@/hooks/queries/useDocumentos'
import { useEmpresas } from '@/hooks/queries/useEmpresas'
import { useDashboardKpis } from '@/hooks/queries/useDashboard'
import type { SubtipoExame } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayMid() {
  const t = new Date(); t.setHours(0, 0, 0, 0); return t
}
function pISO(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function brDate(iso: string | undefined | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function addYears(iso: string, n: number) {
  const d = pISO(iso)!; d.setFullYear(d.getFullYear() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function asoStatus(validadeISO: string | undefined | null) {
  const d = pISO(validadeISO ?? '')
  if (!d) return { key: 'neutral' as const, label: 'Sem validade', rel: '' }
  const days = Math.round((d.getTime() - todayMid().getTime()) / 86400000)
  if (days < 0)  return { key: 'crit' as const, label: 'Vencido',  rel: `há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}` }
  if (days <= 30) return { key: 'warn' as const, label: 'Vencendo', rel: `em ${days} ${days === 1 ? 'dia' : 'dias'}` }
  return { key: 'ok' as const, label: 'Em dia', rel: `em ${days} dias` }
}

type AsoStatusKey = 'ok' | 'warn' | 'crit' | 'neutral'

const AVATAR_COLORS = ['#2563EB','#DB2777','#7C3AED','#0891B2','#059669','#D97706','#475569','#BE185D']
function avatarColor(nome: string) {
  let h = 0; for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const TIPOS = ['Admissional', 'Periódico', 'Mudança de risco', 'Retorno ao trabalho', 'Demissional']
const RESULTADOS = ['Apto', 'Apto com restrição', 'Inapto']
const RES_KEY: Record<string, AsoStatusKey> = { 'Apto': 'ok', 'Apto com restrição': 'warn', 'Inapto': 'crit' }

const SUBTIPO_MAP: Record<string, SubtipoExame> = {
  'Admissional':         'admissional',
  'Periódico':           'periodico',
  'Mudança de risco':    'mudanca_risco',
  'Retorno ao trabalho': 'retorno_trabalho',
  'Demissional':         'demissional',
}

interface AsoSeed { id: string; colab: string; tipo: string; realizado: string; validade: string; resultado: string; exames: string[] }

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className="mp-field" style={full ? { gridColumn:'1 / -1' } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status preview
// ---------------------------------------------------------------------------
function StatusPreviewWidget({ validade }: { validade: string }) {
  const st = asoStatus(validade)
  return (
    <div className="status-preview">
      <div className="status-preview-label">Status automático</div>
      {validade
        ? <div className="status-preview-body">
            <span className={`chip ${st.key}`} style={{ fontSize:12 }}>{st.label}</span>
            <span style={{ fontSize:12, color:'var(--ink-500)' }}>vence {brDate(validade)} · {st.rel}</span>
          </div>
        : <div style={{ fontSize:12, color:'var(--ink-400)' }}>Informe a validade para calcular o status.</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NewAsoModal
// ---------------------------------------------------------------------------
function NewAsoModal({ onClose, empresaId }: { onClose: () => void; empresaId: string }) {
  const [colabId, setColabId] = useState('')
  const [tipo, setTipo] = useState('')
  const [resultado, setResultado] = useState('')
  const [realizado, setRealizado] = useState('')
  const [validade, setValidade] = useState('')
  const [examsSel, setExamsSel] = useState<string[]>([])

  const colabsQuery   = useColaboradores(empresaId)
  const tiposQuery    = useDocumentoTipos()
  const catalogoQuery = useExamesCatalogo()
  const criar         = useCriarExame()

  const catalogo = catalogoQuery.data ?? []

  const toggleExame = (nome: string) =>
    setExamsSel(prev => prev.includes(nome) ? prev.filter(e => e !== nome) : [...prev, nome])

  const suggest = () => { if (realizado) setValidade(addYears(realizado, 1)) }
  const canSave = colabId && tipo && resultado && realizado && validade

  async function handleSave() {
    const colab = (colabsQuery.data ?? []).find(c => c.id === colabId)
    if (!colab) return
    const tipos = tiposQuery.data ?? []
    const tipoAso = tipos.find(t => /aso/i.test(t.nome)) ?? tipos[0]
    if (!tipoAso) { toast.error('Cadastre tipos de documento em Configurações antes de registrar um ASO.'); return }
    try {
      await criar.mutateAsync({
        empresa_id:        empresaId,
        tipo_id:           tipoAso.id,
        colaborador_id:    colabId,
        titulo:            `ASO — ${colab.nome}`,
        subtipo_exame:     SUBTIPO_MAP[tipo] ?? 'periodico',
        emissao:           realizado || null,
        vencimento:        validade || null,
        observacoes:       resultado,
        exames_realizados: examsSel.length > 0 ? examsSel : null,
      })
      onClose()
    } catch { /* toast já disparado */ }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth:560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Registrar ASO</h2>
            <div style={{ fontSize:12.5, color:'var(--ink-500)', marginTop:2 }}>Atestado de Saúde Ocupacional · status automático por validade</div>
          </div>
          <button className="icon-btn sm" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          <div className="mp-form">
            <Field label="Colaborador" full>
              <select className="mp-input" value={colabId} onChange={e => setColabId(e.target.value)} disabled={colabsQuery.isLoading}>
                <option value="">Selecione…</option>
                {(colabsQuery.data ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <Field label="Tipo de exame">
                <select className="mp-input" value={tipo} onChange={e => setTipo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Resultado">
                <select className="mp-input" value={resultado} onChange={e => setResultado(e.target.value)}>
                  <option value="">Selecione…</option>
                  {RESULTADOS.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Data de realização">
                <input className="mp-input" type="date" value={realizado} onChange={e => setRealizado(e.target.value)} onBlur={() => { if (!validade) suggest() }}/>
              </Field>
              <Field label="Data de validade">
                <input className="mp-input" type="date" value={validade} onChange={e => setValidade(e.target.value)}/>
              </Field>
            </div>
            {realizado && !validade && (
              <button className="tbtn ghost" style={{ alignSelf:'flex-start', fontSize:12 }} onClick={suggest}>
                <Clock size={12}/> Sugerir validade (+1 ano)
              </button>
            )}
            <StatusPreviewWidget validade={validade}/>

            {/* Exames realizados */}
            <div style={{ gridColumn:'1 / -1' }}>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--ink-600)', marginBottom:8 }}>
                Exames realizados
                {examsSel.length > 0 && <span style={{ marginLeft:8, fontWeight:400, color:'var(--ink-400)' }}>{examsSel.length} selecionado{examsSel.length > 1 ? 's' : ''}</span>}
              </label>
              {catalogoQuery.isLoading
                ? <div style={{ fontSize:12, color:'var(--ink-400)' }}>Carregando catálogo…</div>
                : <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px', maxHeight:220, overflowY:'auto', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:8, background:'var(--surface-2)' }}>
                    {catalogo.map(e => (
                      <label key={e.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', padding:'3px 0', userSelect:'none' }}>
                        <input
                          type="checkbox"
                          checked={examsSel.includes(e.nome)}
                          onChange={() => toggleExame(e.nome)}
                          style={{ accentColor:'var(--primary)', width:14, height:14, cursor:'pointer', flexShrink:0 }}
                        />
                        {e.nome}
                      </label>
                    ))}
                  </div>
              }
            </div>
          </div>
          <div className="modal-foot">
            <button className="tbtn" onClick={onClose}>Cancelar</button>
            <button
              className="tbtn primary"
              disabled={!canSave || criar.isPending}
              style={(!canSave || criar.isPending) ? { opacity:0.5, pointerEvents:'none' } : undefined}
              onClick={() => void handleSave()}
            >
              {criar.isPending ? <Loader2 size={13} className="btn-spinner" /> : <CheckCircle2 size={13}/>}
              {criar.isPending ? 'Salvando...' : 'Salvar ASO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScheduleModal
// ---------------------------------------------------------------------------
function ScheduleModal({ prefill, onClose }: { prefill: string | null; onClose: () => void }) {
  const [colab, setColab] = useState(prefill ?? '')
  const [tipo, setTipo] = useState('Periódico')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const canSave = colab && data && hora

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth:500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Agendar exame</h2>
            <div style={{ fontSize:12.5, color:'var(--ink-500)', marginTop:2 }}>Agenda da clínica ocupacional · junho/2026</div>
          </div>
          <button className="icon-btn sm" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          <div className="mp-form">
            <Field label="Colaborador" full>
              <select className="mp-input" value={colab} onChange={e => setColab(e.target.value)}>
                <option value="">Selecione…</option>
              </select>
            </Field>
            <Field label="Tipo de exame" full>
              <select className="mp-input" value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <Field label="Data"><input className="mp-input" type="date" value={data} onChange={e => setData(e.target.value)}/></Field>
              <Field label="Horário"><input className="mp-input" type="time" value={hora} onChange={e => setHora(e.target.value)}/></Field>
            </div>
          </div>
          <div className="modal-foot">
            <button className="tbtn" onClick={onClose}>Cancelar</button>
            <button
              className="tbtn primary"
              disabled={!canSave}
              style={!canSave ? { opacity:0.5, pointerEvents:'none' } : undefined}
              onClick={() => { toast.success('Exame agendado com sucesso.'); onClose() }}
            >
              <CheckCircle2 size={13}/> Agendar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConfirmDelete
// ---------------------------------------------------------------------------
function ConfirmDelete({ row, onCancel, onConfirm }: { row: AsoSeed; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth:430 }} onClick={e => e.stopPropagation()}>
        <div className="modal-body" style={{ paddingTop:26 }}>
          <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
            <div className="del-ic"><Trash2 size={20}/></div>
            <div>
              <h2 style={{ margin:'0 0 6px', fontSize:18, fontFamily:'var(--font-display)' }}>Excluir ASO?</h2>
              <p style={{ margin:0, fontSize:13, color:'var(--ink-500)', lineHeight:1.5 }}>
                O ASO <strong style={{ color:'var(--ink-900)' }}>{row.tipo}</strong> de <strong style={{ color:'var(--ink-900)' }}>{row.colab}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
              </p>
            </div>
          </div>
          <div className="modal-foot">
            <button className="tbtn" onClick={onCancel}>Cancelar</button>
            <button className="tbtn danger" onClick={onConfirm}><Trash2 size={13}/> Excluir</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExamesEmpresa
// ---------------------------------------------------------------------------
function ExamesEmpresa({ empresaIdProp, empresaNome, onBack }: {
  empresaIdProp?: string | null
  empresaNome?: string
  onBack?: () => void
}) {
  const { empresaId: empresaIdPerfil } = useCurrentProfile()
  const empresaId = empresaIdProp ?? empresaIdPerfil
  const asosQuery = useExames(empresaId)
  const asosBanco = asosQuery.data ?? []

  // Adaptar dados do banco para o shape que a UI usa
  const asos = useMemo(() => asosBanco.map(a => ({
    id: a.id,
    colab: a.colaborador?.nome ?? a.titulo,
    tipo: a.subtipo_exame
      ? ({
          admissional:     'Admissional',
          periodico:       'Periódico',
          mudanca_risco:   'Mudança de risco',
          retorno_trabalho:'Retorno ao trabalho',
          demissional:     'Demissional',
        }[a.subtipo_exame] ?? 'Periódico')
      : 'Periódico',
    realizado: a.emissao ?? '',
    validade:  a.vencimento ?? '',
    resultado: a.observacoes ?? 'Apto',
    exames:    a.exames_realizados ?? [],
  })), [asosBanco])

  const [fTipo, setFTipo] = useState('Todos')
  const [fStatus, setFStatus] = useState('all')
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [schedOpen, setSchedOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<typeof asos[number] | null>(null)
  const [prefill, setPrefill] = useState<string | null>(null)

  const rows = useMemo(() => asos.map(a => ({ ...a, cor: avatarColor(a.colab), cargo: '—', setor: '—', st: asoStatus(a.validade) })), [asos])
  const kpis = useMemo(() => {
    const total = rows.length
    const ok   = rows.filter(r => r.st.key === 'ok').length
    const warn = rows.filter(r => r.st.key === 'warn').length
    const crit = rows.filter(r => r.st.key === 'crit').length
    return { total, ok, warn, crit, pct: total ? Math.round((ok / total) * 100) : 0 }
  }, [rows])

  const filtered = useMemo(() => rows
    .filter(r => fTipo === 'Todos' || r.tipo === fTipo)
    .filter(r => fStatus === 'all' || r.st.key === fStatus)
    .filter(r => !q.trim() || `${r.colab} ${r.cargo} ${r.setor} ${r.tipo}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.validade < b.validade ? -1 : 1)),
    [rows, fTipo, fStatus, q]
  )

  const deletar = useDeletarExame()
  const doDelete = async (row: typeof asos[number]) => {
    if (!empresaId) return
    const original = asosBanco.find(a => a.id === row.id)
    try {
      await deletar.mutateAsync({ id: row.id, empresaId, colaboradorId: original?.colaborador_id ?? null })
      setConfirmDel(null)
    } catch { /* toast já disparado */ }
  }
  const openSchedFor = (nome: string) => { setPrefill(nome); setSchedOpen(true) }

  return (
    <div className="content">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {onBack && (
            <button className="icon-btn sm" title="Voltar" onClick={onBack} style={{ marginRight:4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}
          <div>
            <h1>ASOs e PCMSO{empresaNome ? ` · ${empresaNome}` : ''}</h1>
            <p className="sub">Atestados de saúde ocupacional · status automático por validade</p>
          </div>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14}/> Exportar</button>
          <button className="tbtn" onClick={() => { setPrefill(null); setSchedOpen(true) }}><Calendar size={14}/> Agendar exame</button>
          <button className="tbtn primary" onClick={() => setNewOpen(true)}><Plus size={14}/> Registrar ASO</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>ASOs em dia</span><span className="kpi-ic green"><CheckCircle2 size={16}/></span></div>
          <div className="kpi-value">{kpis.pct}%</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>{kpis.ok} de {kpis.total} dentro da validade</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencendo em 30 dias</span><span className="kpi-ic orange"><Clock size={16}/></span></div>
          <div className="kpi-value">{kpis.warn}</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>exames a reagendar</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>ASOs vencidos</span><span className="kpi-ic red"><AlertTriangle size={16}/></span></div>
          <div className="kpi-value" style={{ color: kpis.crit ? 'var(--red-500)' : undefined }}>{kpis.crit}</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>requer ação imediata</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Total de ASOs</span><span className="kpi-ic violet"><Calendar size={16}/></span></div>
          <div className="kpi-value">{kpis.total}</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>registros monitorados</div>
        </div>
      </div>

      {/* ASO layout */}
      <div className="aso-layout">
        {/* Tabela ASOs */}
        <div className="glass" style={{ padding:0, overflow:'hidden' }}>
          <div className="aso-head">
            <div>
              <div className="ctitle">Atestados de Saúde Ocupacional (ASO)</div>
              <div className="csub">Status calculado automaticamente pela validade do exame</div>
            </div>
            <div className="aso-search">
              <Search size={15}/>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar colaborador…"/>
            </div>
          </div>

          <div className="aso-filters">
            <div className="seg">
              {['Todos', ...TIPOS].map(t => (
                <button key={t} className={fTipo === t ? 'on' : ''} onClick={() => setFTipo(t)}>
                  {t === 'Mudança de risco' ? 'Mudança' : t === 'Retorno ao trabalho' ? 'Retorno' : t}
                </button>
              ))}
            </div>
            <div className="seg">
              {[['all','Status'],['ok','Em dia'],['warn','Vencendo'],['crit','Vencido']].map(([k,l]) => (
                <button key={k} className={fStatus === k ? 'on' : ''} onClick={() => setFStatus(k)}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ overflow:'auto' }}>
            <table className="tbl aso-tbl">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Tipo</th>
                  <th>Exames realizados</th>
                  <th>Realização</th>
                  <th>Validade</th>
                  <th>Resultado</th>
                  <th>Status</th>
                  <th style={{ textAlign:'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'var(--ink-500)' }}>Nenhum ASO encontrado com esses filtros.</td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="aso-person">
                        <span className="ava" style={{ background:r.cor, width:34, height:34, fontSize:12 }}>{initials(r.colab)}</span>
                        <div>
                          <div className="aso-name">{r.colab}</div>
                          <div className="aso-role">{r.cargo} · {r.setor}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="aso-tipo">{r.tipo}</span></td>
                    <td style={{ maxWidth:240 }}>
                      {r.exames.length > 0
                        ? <span style={{ fontSize:11.5, color:'var(--ink-700)', lineHeight:1.6 }}>{r.exames.join('; ')}</span>
                        : <span style={{ fontSize:11.5, color:'var(--ink-400)' }}>—</span>
                      }
                    </td>
                    <td style={{ color:'var(--ink-700)', fontVariantNumeric:'tabular-nums' }}>{brDate(r.realizado)}</td>
                    <td style={{ fontVariantNumeric:'tabular-nums' }}>
                      <div style={{ fontWeight:600, color: r.st.key === 'crit' ? 'var(--red-500)' : r.st.key === 'warn' ? 'var(--orange-600)' : 'var(--ink-900)' }}>{brDate(r.validade)}</div>
                      <div style={{ fontSize:11, color:'var(--ink-500)' }}>{r.st.rel}</div>
                    </td>
                    <td>
                      <span className={`res-pill ${RES_KEY[r.resultado] ?? 'neutral'}`}>
                        <span className="res-dot"/>{r.resultado}
                      </span>
                    </td>
                    <td><span className={`chip ${r.st.key}`}>{r.st.label}</span></td>
                    <td>
                      <div className="aso-actions">
                        <button className="icon-btn sm" title="Visualizar PDF"><Eye size={15}/></button>
                        <button className="icon-btn sm" title="Baixar PDF"><Download size={15}/></button>
                        {r.st.key !== 'ok'
                          ? <button className="tbtn ghost sm accent" onClick={() => openSchedFor(r.colab)}><Calendar size={13}/> Agendar</button>
                          : <button className="tbtn ghost sm" onClick={() => openSchedFor(r.colab)}><Calendar size={13}/> Agendar</button>}
                        <button className="icon-btn sm danger" title="Excluir" onClick={() => setConfirmDel(r)}><Trash2 size={15}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Agenda */}
        <div className="glass aso-agenda">
          <div className="agenda-head">
            <div>
              <div className="ctitle">Agenda de exames</div>
              <div className="csub">Agendamentos futuros</div>
            </div>
            <button className="icon-btn sm" onClick={() => { setPrefill(null); setSchedOpen(true) }} title="Agendar"><Plus size={15}/></button>
          </div>
          <div style={{ padding:'32px 16px', textAlign:'center', color:'var(--ink-400)', fontSize:12 }}>
            Nenhum agendamento registrado ainda.
          </div>
        </div>
      </div>

      {newOpen && empresaId && <NewAsoModal onClose={() => setNewOpen(false)} empresaId={empresaId}/>}
      {schedOpen && <ScheduleModal prefill={prefill} onClose={() => setSchedOpen(false)}/>}
      {confirmDel && <ConfirmDelete row={confirmDel} onCancel={() => setConfirmDel(null)} onConfirm={() => doDelete(confirmDel)}/>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExamesAdmin
// ---------------------------------------------------------------------------
function ExamesAdmin() {
  const [selectedEmpresa, setSelectedEmpresa] = useState<{ id: string; nome: string } | null>(null)

  if (selectedEmpresa) {
    return (
      <ExamesEmpresa
        empresaIdProp={selectedEmpresa.id}
        empresaNome={selectedEmpresa.nome}
        onBack={() => setSelectedEmpresa(null)}
      />
    )
  }

  return <ExamesAdminList onSelect={setSelectedEmpresa} />
}

function ExamesAdminList({ onSelect }: { onSelect: (e: { id: string; nome: string }) => void }) {
  const empresasQuery = useEmpresas()
  const empresas = empresasQuery.data ?? []
  const kpisQuery = useDashboardKpis('all')
  const kpis = kpisQuery.data
  const COLORS = ['#1F2A44','#10B981','#3B82F6','#8B5CF6','#F59E0B']

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Exames médicos · PCMSO · EngMarq</h1>
          <p className="sub">Saúde ocupacional consolidada · {empresas.length} empresas-cliente</p>
        </div>
        <div className="toolbar">
          <button className="tbtn primary"><Download size={14}/> Exportar consolidado</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>Empresas monitoradas</span><span className="kpi-ic blue"><CheckCircle2 size={16}/></span></div>
          <div className="kpi-value">{kpis?.totalEmpresas ?? '—'}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Colaboradores ativos</span><span className="kpi-ic green"><CheckCircle2 size={16}/></span></div>
          <div className="kpi-value">{kpis ? kpis.totalColaboradores.toLocaleString('pt-BR') : '—'}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>ASOs vencendo</span><span className="kpi-ic orange"><Clock size={16}/></span></div>
          <div className="kpi-value">{kpis?.docsVencendo ?? '—'}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>ASOs vencidos</span><span className="kpi-ic red"><AlertTriangle size={16}/></span></div>
          <div className="kpi-value" style={{ color: (kpis?.docsVencidos ?? 0) > 0 ? 'var(--red-500)' : undefined }}>
            {kpis?.docsVencidos ?? '—'}
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <div className="ctitle">Empresas — saúde ocupacional</div>
          <div className="csub">ASOs e PCMSO por empresa-cliente</div>
        </div>
        <div style={{ overflow:'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Setor</th>
                <th>Cidade / UF</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {empresas.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign:'center', padding:40, color:'var(--ink-500)' }}>Nenhuma empresa cadastrada ainda.</td></tr>
              )}
              {empresas.map((e, i) => (
                <tr
                  key={e.id}
                  style={{ cursor:'pointer' }}
                  onClick={() => onSelect({ id: e.id, nome: e.razao_social })}
                >
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span className="ava" style={{ background: COLORS[i % COLORS.length], borderRadius:8, width:32, height:32, fontSize:12, flexShrink:0 }}>
                        {e.razao_social.slice(0,1)}
                      </span>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{e.razao_social}</div>
                        <div style={{ fontSize:11, color:'var(--ink-500)' }}>{e.cnpj}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.setor ?? '—'}</td>
                  <td style={{ fontSize:12 }}>{[e.cidade, e.uf].filter(Boolean).join(' / ') || '—'}</td>
                  <td><span className={`chip ${e.status === 'ativa' ? 'ok' : 'warn'}`}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default function ExamesPage() {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <ExamesAdmin /> : <ExamesEmpresa />
}
