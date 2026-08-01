import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Shield, Heart, FileText, LayoutGrid, GraduationCap, HardHat,
  Download, Calendar, Plus, CheckCircle2, Clock, AlertTriangle,
  Search, Eye, Trash2, X, Loader2,
} from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useDocumentos, useDocumentoTipos, useCriarDocumento, useDeletarDocumento } from '@/hooks/queries/useDocumentos'
import { useColaboradores } from '@/hooks/queries/useColaboradores'
import { useEmpresas } from '@/hooks/queries/useEmpresas'
import { useDashboardKpis } from '@/hooks/queries/useDashboard'
import type { DocStatus as DbDocStatus } from '@/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DocStatus = 'ok' | 'warn' | 'crit' | 'neutral'

interface StatusResult { key: DocStatus; label: string; rel: string }

interface EmpresaDoc {
  id: string; cat: string; nome: string; versao: string
  emissao: string; validade: string; resp: string; size: string
}
interface ColabReg {
  id: string; cat: string; colab: string; cor: string
  item: string; realizado: string; validade: string; ca?: string
}
type DocRow =
  | (EmpresaDoc & { kind: 'empresa'; st: StatusResult })
  | (ColabReg  & { kind: 'colab';   st: StatusResult })

interface EpiItem { equip: string; ca: string; entrega: string; validade: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayMidnight() {
  const t = new Date(); t.setHours(0, 0, 0, 0); return t
}
function parseISO(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function statusFrom(validadeISO: string | null | undefined): StatusResult {
  const d = parseISO(validadeISO ?? '')
  if (!d) return { key: 'neutral', label: 'Sem validade', rel: '' }
  const days = Math.round((d.getTime() - todayMidnight().getTime()) / 86400000)
  if (days < 0)   return { key: 'crit', label: 'Vencido',  rel: `há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}` }
  if (days <= 30) return { key: 'warn', label: 'Vencendo', rel: `em ${days} ${days === 1 ? 'dia' : 'dias'}` }
  return { key: 'ok', label: 'Em dia', rel: `em ${days} dias` }
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
function addYears(iso: string, n: number): string {
  const d = parseISO(iso)
  if (!d) return ''
  d.setFullYear(d.getFullYear() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
interface CatItem { id: string; label: string; icon: React.ElementType }
interface CatGroup { group: string; note: string; items: CatItem[] }

const CAT_GROUPS: CatGroup[] = [
  {
    group: 'Documentos da empresa', note: 'upload de arquivo',
    items: [
      { id: 'pgr',        label: 'PGR',                 icon: Shield },
      { id: 'pcmso',      label: 'PCMSO',               icon: Heart },
      { id: 'ltcat',      label: 'LTCAT',               icon: FileText },
      { id: 'laudos',     label: 'Laudos técnicos',     icon: FileText },
      { id: 'inventario', label: 'Inventário de risco', icon: LayoutGrid },
    ],
  },
  {
    group: 'Por colaborador', note: 'registro por data',
    items: [
      { id: 'cert', label: 'Certificados de treinamento', icon: GraduationCap },
      { id: 'epi',  label: 'Fichas de EPI',               icon: HardHat },
    ],
  },
]

const EMPRESA_CATS = ['pgr', 'pcmso', 'ltcat', 'laudos', 'inventario']
const CAT_LABEL: Record<string, string> = {
  pgr: 'PGR', pcmso: 'PCMSO', ltcat: 'LTCAT', laudos: 'Laudo técnico',
  inventario: 'Inventário de risco', cert: 'Certificado de treinamento', epi: 'Ficha de EPI',
}

// Dados auxiliares para DateEntryModal (mockados — aguarda Fase 4.3)
const NR_OPTS = ['NR-35 · Trabalho em altura', 'NR-33 · Espaço confinado', 'NR-10 · Segurança elétrica', 'NR-11 · Empilhadeira', 'NR-12 · Máquinas', 'NR-06 · EPI']
const EPI_OPTS = ['Capacete de segurança', 'Protetor auricular', 'Cinto talabarte duplo', 'Luvas de proteção', 'Botina de segurança', 'Óculos de proteção']

// ---------------------------------------------------------------------------
// StatusPreview
// ---------------------------------------------------------------------------
function StatusPreview({ validade }: { validade: string }) {
  const st = statusFrom(validade)
  return (
    <div className="status-preview">
      <div className="status-preview-label">Status automático</div>
      {validade ? (
        <div className="status-preview-body">
          <span className={`chip ${st.key}`} style={{ fontSize: 12 }}>{st.label}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>vence {fmtBR(validade)} · {st.rel}</span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--ink-400)' }}>Informe a data de validade para calcular o status.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DocField helper
// ---------------------------------------------------------------------------
function DocField({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className="mp-field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DateEntryModal
// ---------------------------------------------------------------------------
function DateEntryModal({ onClose, empresaId }: { onClose: () => void; empresaId: string }) {
  const [tipo, setTipo] = useState<'cert' | 'epi'>('cert')
  const [colabId, setColabId] = useState('')
  const [norma, setNorma] = useState('')
  const [realizado, setRealizado] = useState('')
  const [validade, setValidade] = useState('')
  const [epiItems, setEpiItems] = useState<EpiItem[]>([{ equip: '', ca: '', entrega: '', validade: '' }])

  const colabsQuery = useColaboradores(empresaId)
  const tiposQuery  = useDocumentoTipos()
  const criar       = useCriarDocumento()

  const suggestCert = () => { if (realizado) setValidade(addYears(realizado, 2)) }
  const updItem = (i: number, patch: Partial<EpiItem>) =>
    setEpiItems(items => items.map((it, j) => j === i ? { ...it, ...patch } : it))
  const addItem = () => setEpiItems(items => [...items, { equip: '', ca: '', entrega: '', validade: '' }])
  const removeItem = (i: number) => setEpiItems(items => items.length === 1 ? items : items.filter((_, j) => j !== i))

  const canSave = tipo === 'cert'
    ? Boolean(colabId && norma && realizado && validade)
    : Boolean(colabId && epiItems.some(it => it.equip && it.entrega))

  async function handleSave() {
    const colab = (colabsQuery.data ?? []).find(c => c.id === colabId)
    if (!colab) return
    const tipos = tiposQuery.data ?? []
    if (tipo === 'cert') {
      const tipoId = (tipos.find(t => /certif|treina/i.test(t.nome)) ?? tipos[0])?.id
      if (!tipoId) return
      try {
        await criar.mutateAsync({
          empresa_id:  empresaId,
          tipo_id:     tipoId,
          titulo:      `${norma.split(' · ')[0]} — ${colab.nome}`,
          emissao:     realizado || null,
          vencimento:  validade || null,
          observacoes: norma,
        })
        onClose()
      } catch { /* toast já disparado */ }
    } else {
      const tipoId = (tipos.find(t => /epi/i.test(t.nome)) ?? tipos[0])?.id
      if (!tipoId) return
      const validItems = epiItems.filter(it => it.equip && it.entrega)
      try {
        for (const item of validItems) {
          await criar.mutateAsync({
            empresa_id:  empresaId,
            tipo_id:     tipoId,
            titulo:      `Ficha de EPI — ${colab.nome}`,
            numero:      item.ca || null,
            emissao:     item.entrega || null,
            vencimento:  item.validade || null,
            observacoes: item.equip,
          })
        }
        onClose()
      } catch { /* toast já disparado */ }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Registrar datas</h2>
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>Registro por colaborador · sem upload · status automático</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ paddingBottom: 16 }}>
            <div className="seg" style={{ width: '100%' }}>
              <button className={tipo === 'cert' ? 'on' : ''} style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setTipo('cert')}>
                <GraduationCap size={13} /> Certificado de treinamento
              </button>
              <button className={tipo === 'epi' ? 'on' : ''} style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setTipo('epi')}>
                <HardHat size={13} /> Ficha de EPI
              </button>
            </div>
          </div>
          <div className="mp-form">
            <DocField label="Colaborador">
              <select className="mp-input" value={colabId} onChange={e => setColabId(e.target.value)} disabled={colabsQuery.isLoading}>
                <option value="">Selecione…</option>
                {(colabsQuery.data ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </DocField>
            {tipo === 'cert' ? (
              <>
                <DocField label="Norma / treinamento">
                  <select className="mp-input" value={norma} onChange={e => setNorma(e.target.value)}>
                    <option value="">Selecione…</option>
                    {NR_OPTS.map(n => <option key={n}>{n}</option>)}
                  </select>
                </DocField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <DocField label="Data de realização">
                    <input className="mp-input" type="date" value={realizado}
                      onChange={e => setRealizado(e.target.value)}
                      onBlur={() => { if (!validade) suggestCert() }} />
                  </DocField>
                  <DocField label="Data de validade">
                    <input className="mp-input" type="date" value={validade}
                      onChange={e => setValidade(e.target.value)} />
                  </DocField>
                </div>
                {realizado && !validade && (
                  <button className="tbtn ghost" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={suggestCert}>
                    <Clock size={12} /> Sugerir validade (+2 anos)
                  </button>
                )}
                <StatusPreview validade={validade} />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {epiItems.map((it, i) => {
                    const st = statusFrom(it.validade)
                    return (
                      <div key={i} className="epi-item">
                        <div className="epi-item-head">
                          <span>Item {i + 1}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {it.validade && <span className={`chip ${st.key}`} style={{ fontSize: 11 }}>{st.label}</span>}
                            {epiItems.length > 1 && (
                              <button className="icon-btn sm danger" title="Remover item" onClick={() => removeItem(i)}><Trash2 size={14} /></button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 12 }}>
                          <DocField label="Equipamento (EPI)">
                            <select className="mp-input" value={it.equip} onChange={e => updItem(i, { equip: e.target.value })}>
                              <option value="">Selecione…</option>
                              {EPI_OPTS.map(n => <option key={n}>{n}</option>)}
                            </select>
                          </DocField>
                          <DocField label="CA do equipamento">
                            <input className="mp-input" placeholder="Ex.: 38.241" value={it.ca} onChange={e => updItem(i, { ca: e.target.value })} />
                          </DocField>
                          <DocField label="Data de entrega">
                            <input className="mp-input" type="date" value={it.entrega}
                              onChange={e => updItem(i, { entrega: e.target.value })}
                              onBlur={() => { if (it.entrega && !it.validade) updItem(i, { validade: addYears(it.entrega, 1) }) }} />
                          </DocField>
                          <DocField label="Validade">
                            <input className="mp-input" type="date" value={it.validade} onChange={e => updItem(i, { validade: e.target.value })} />
                          </DocField>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button className="tbtn ghost" style={{ alignSelf: 'flex-start' }} onClick={addItem}>
                  <Plus size={13} /> Adicionar item
                </button>
              </>
            )}
          </div>
          <div className="modal-foot">
            <button className="tbtn" onClick={onClose}>Cancelar</button>
            <button
              className="tbtn primary"
              disabled={!canSave || criar.isPending}
              style={(!canSave || criar.isPending) ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
              onClick={() => void handleSave()}
            >
              {criar.isPending ? <Loader2 size={13} className="btn-spinner" /> : <CheckCircle2 size={13} />}
              {criar.isPending ? 'Salvando...' : tipo === 'epi' ? `Salvar ficha (${epiItems.length} ${epiItems.length === 1 ? 'item' : 'itens'})` : 'Salvar registro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DocumentosAdmin
// ---------------------------------------------------------------------------
function DocumentosAdmin() {
  const [selectedEmpresa, setSelectedEmpresa] = useState<{ id: string; nome: string } | null>(null)

  if (selectedEmpresa) {
    return (
      <DocumentosEmpresa
        empresaIdProp={selectedEmpresa.id}
        empresaNome={selectedEmpresa.nome}
        onBack={() => setSelectedEmpresa(null)}
      />
    )
  }

  return <DocumentosAdminList onSelect={setSelectedEmpresa} />
}

function DocumentosAdminList({ onSelect }: { onSelect: (e: { id: string; nome: string }) => void }) {
  const empresasQuery = useEmpresas()
  const empresas = empresasQuery.data ?? []
  const kpisQuery = useDashboardKpis('all')
  const kpis = kpisQuery.data
  const COLORS = ['#1F2A44','#10B981','#3B82F6','#8B5CF6','#F59E0B']

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Documentos · EngMarq</h1>
          <p className="sub">Visão consolidada · documentos mestres das {empresas.length} empresas-cliente</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14} /> Exportar consolidado</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>Empresas monitoradas</span><span className="kpi-ic violet"><FileText size={16} /></span></div>
          <div className="kpi-value">{kpis?.totalEmpresas ?? '—'}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Documentos monitorados</span><span className="kpi-ic blue"><FileText size={16} /></span></div>
          <div className="kpi-value">{kpis?.totalDocumentos ?? '—'}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencendo</span><span className="kpi-ic orange"><Clock size={16} /></span></div>
          <div className="kpi-value">{kpis?.docsVencendo ?? '—'}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencidos</span><span className="kpi-ic red"><AlertTriangle size={16} /></span></div>
          <div className="kpi-value" style={{ color: (kpis?.docsVencidos ?? 0) > 0 ? 'var(--red-500)' : undefined }}>
            {kpis?.docsVencidos ?? '—'}
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="ctitle">Empresas — status documental</div>
          <div className="csub">Clique numa empresa para ver os documentos</div>
        </div>
        <div style={{ overflow: 'auto' }}>
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
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--ink-500)' }}>Nenhuma empresa cadastrada ainda.</td></tr>
              )}
              {empresas.map((e, i) => (
                <tr
                  key={e.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelect({ id: e.id, nome: e.razao_social })}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="ava" style={{ background: COLORS[i % COLORS.length], borderRadius: 8, width: 32, height: 32, fontSize: 12, flexShrink: 0 }}>
                        {e.razao_social.slice(0, 1)}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{e.razao_social}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{e.cnpj}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.setor ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{[e.cidade, e.uf].filter(Boolean).join(' / ') || '—'}</td>
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
// NovoDocumentoModal
// ---------------------------------------------------------------------------
const novoDocSchema = z.object({
  tipo_id:    z.string().min(1, 'Selecione o tipo de documento'),
  titulo:     z.string().min(2, 'Informe o título'),
  numero:     z.string(),
  emissao:    z.string(),
  vencimento: z.string(),
  observacoes: z.string(),
})
type NovoDocForm = z.infer<typeof novoDocSchema>

function NovoDocumentoModal({ onClose, empresaId }: { onClose: () => void; empresaId: string }) {
  const tiposQuery = useDocumentoTipos()
  const criar = useCriarDocumento()
  const [validade, setValidade] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<NovoDocForm>({
    resolver: zodResolver(novoDocSchema),
    defaultValues: { tipo_id: '', titulo: '', numero: '', emissao: '', vencimento: '', observacoes: '' },
  })

  const watchedVencimento = watch('vencimento')

  async function onSubmit(v: NovoDocForm) {
    try {
      await criar.mutateAsync({
        empresa_id:  empresaId,
        tipo_id:     v.tipo_id,
        titulo:      v.titulo,
        numero:      v.numero || null,
        emissao:     v.emissao || null,
        vencimento:  v.vencimento || null,
        observacoes: v.observacoes || null,
      })
      onClose()
    } catch { /* toast já disparado */ }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Novo documento</h2>
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>Campo "arquivo" disponível em breve · status calculado automaticamente pela validade</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mp-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <DocField label="Tipo de documento" full>
                  <select className="mp-input" {...register('tipo_id')} disabled={tiposQuery.isLoading}>
                    <option value="">Selecione…</option>
                    {(tiposQuery.data ?? []).map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                  {errors.tipo_id && <span style={{ color:'var(--red-600, #dc2626)', fontSize:11.5, display:'block', marginTop:3 }}>{errors.tipo_id.message}</span>}
                </DocField>
                <DocField label="Título" full>
                  <input className="mp-input" placeholder="Ex.: PGR 2026 — unidade matriz" {...register('titulo')} />
                  {errors.titulo && <span style={{ color:'var(--red-600, #dc2626)', fontSize:11.5, display:'block', marginTop:3 }}>{errors.titulo.message}</span>}
                </DocField>
                <DocField label="Número / versão">
                  <input className="mp-input" placeholder="v3" {...register('numero')} />
                </DocField>
                <DocField label="Responsável técnico">
                  <input className="mp-input" placeholder="Nome do responsável" disabled style={{ opacity:0.6 }} />
                </DocField>
                <DocField label="Data de emissão">
                  <input className="mp-input" type="date" {...register('emissao')} />
                </DocField>
                <DocField label="Data de validade">
                  <input
                    className="mp-input" type="date"
                    {...register('vencimento', { onChange: e => setValidade(e.target.value) })}
                  />
                </DocField>
                <DocField label="Observações" full>
                  <input className="mp-input" placeholder="Opcional" {...register('observacoes')} />
                </DocField>
              </div>
              <StatusPreview validade={watchedVencimento || validade} />
              <div className="dropzone" style={{ opacity:0.5, cursor:'not-allowed', pointerEvents:'none' }}>
                <div className="dropzone-ic"><FileText size={20} /></div>
                <div className="dropzone-title">Upload de arquivo</div>
                <div className="dropzone-sub">Disponível em breve</div>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="tbtn" onClick={onClose}>Cancelar</button>
              <button type="submit" className="tbtn primary" disabled={criar.isPending}>
                {criar.isPending ? <Loader2 size={13} className="btn-spinner" /> : <CheckCircle2 size={13} />}
                {criar.isPending ? 'Salvando...' : 'Cadastrar documento'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function DocumentosEmpresa({ empresaIdProp, empresaNome, onBack }: {
  empresaIdProp?: string | null
  empresaNome?: string
  onBack?: () => void
}) {
  const { empresaId: empresaIdPerfil } = useCurrentProfile()
  const empresaId = empresaIdProp ?? empresaIdPerfil
  const docQuery = useDocumentos(empresaId)
  const deletar  = useDeletarDocumento()

  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const docsBanco = docQuery.data ?? []

  const doDelete = async (id: string) => {
    if (!empresaId) return
    try {
      await deletar.mutateAsync({ id, empresaId })
    } catch { /* toast */ }
    setConfirmDelId(null)
  }

  // Adaptar documentos do banco para o shape que a UI usa
  const allRows = useMemo<DocRow[]>(() => {
    return docsBanco.map(d => {
      const dbStatus = d.status as DbDocStatus
      // Converte status do banco (vigente/vencendo/vencido) para o shape local
      const stKey: DocStatus = dbStatus === 'vencido' ? 'crit' : dbStatus === 'vencendo' ? 'warn' : 'ok'
      const stLabel = dbStatus === 'vencido' ? 'Vencido' : dbStatus === 'vencendo' ? 'Vencendo' : 'Em dia'
      const st: StatusResult = { key: stKey, label: stLabel, rel: '' }
      const tipoNome = d.tipo?.nome?.toLowerCase() ?? ''
      const cat =
        tipoNome.includes('pgr') ? 'pgr' :
        tipoNome.includes('pcmso') ? 'pcmso' :
        tipoNome.includes('ltcat') ? 'ltcat' :
        tipoNome.includes('laudo') ? 'laudos' :
        tipoNome.includes('inventário') || tipoNome.includes('invent') ? 'inventario' :
        tipoNome.includes('aso') ? 'cert' :
        'laudos'

      const empresaDoc: EmpresaDoc & { kind: 'empresa'; st: StatusResult } = {
        id: d.id, cat,
        nome: d.titulo,
        versao: d.numero ?? '—',
        emissao: d.emissao ?? '',
        validade: d.vencimento ?? '',
        resp: d.observacoes ?? '—',
        size: '—',
        kind: 'empresa',
        st,
      }
      return empresaDoc
    })
  }, [docsBanco])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    allRows.forEach(r => { c[r.cat] = (c[r.cat] || 0) + 1 })
    c.all = allRows.length
    return c
  }, [allRows])

  const kpis = useMemo(() => {
    const total = allRows.length
    const ok = allRows.filter(r => r.st.key === 'ok').length
    const warn = allRows.filter(r => r.st.key === 'warn').length
    const crit = allRows.filter(r => r.st.key === 'crit').length
    return { total, ok, warn, crit, pct: Math.round((ok / total) * 100) }
  }, [allRows])

  const rows = useMemo(() => {
    return allRows
      .filter(r => cat === 'all' || r.cat === cat)
      .filter(r => {
        if (!q.trim()) return true
        const hay = `${r.kind === 'empresa' ? r.nome : r.item} ${r.kind === 'colab' ? r.colab : ''} ${CAT_LABEL[r.cat]}`.toLowerCase()
        return hay.includes(q.toLowerCase())
      })
      .sort((a, b) => a.validade < b.validade ? -1 : 1)
  }, [allRows, cat, q])

  const attention = allRows
    .filter(r => r.st.key !== 'ok')
    .sort((a, b) => a.validade < b.validade ? -1 : 1)

  const isColabCat = !EMPRESA_CATS.includes(cat) && cat !== 'all'

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
            <h1>Documentos SST{empresaNome ? ` · ${empresaNome}` : ''}</h1>
            <p className="sub">Documentos mestres e registros por colaborador · status automático por validade</p>
          </div>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14} /> Exportar lista</button>
          <button className="tbtn" onClick={() => setDateOpen(true)}><Calendar size={14} /> Registrar datas</button>
          <button className="tbtn primary" onClick={() => setNovoOpen(true)}><Plus size={14} /> Novo documento</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>Documentos monitorados</span><span className="kpi-ic violet"><FileText size={16} /></span></div>
          <div className="kpi-value">{kpis.total}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>{docsBanco.length} documentos cadastrados</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Em dia</span><span className="kpi-ic green"><CheckCircle2 size={16} /></span></div>
          <div className="kpi-value">{kpis.pct}%</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>{kpis.ok} de {kpis.total} dentro da validade</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencendo em 30 dias</span><span className="kpi-ic orange"><Clock size={16} /></span></div>
          <div className="kpi-value">{kpis.warn}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>renovação recomendada</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencidos</span><span className="kpi-ic red"><AlertTriangle size={16} /></span></div>
          <div className="kpi-value" style={{ color: kpis.crit ? 'var(--red-500)' : 'var(--ink-900)' }}>{kpis.crit}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>requer ação imediata</div>
        </div>
      </div>

      {attention.length > 0 && (
        <div className="doc-alert">
          <div className="doc-alert-ic"><AlertTriangle size={18} /></div>
          <div style={{ flex: 1 }}>
            <div className="doc-alert-title">{attention.length} documento{attention.length > 1 ? 's' : ''} precisam de atenção</div>
            <div className="doc-alert-row">
              {attention.slice(0, 4).map(r => (
                <button key={r.id} className={`doc-alert-chip ${r.st.key}`} onClick={() => setCat(r.cat)}>
                  <strong>{r.kind === 'empresa' ? CAT_LABEL[r.cat] : r.item.split(' · ')[0]}</strong>
                  <span>{r.st.label} {r.st.rel}</span>
                </button>
              ))}
              {attention.length > 4 && <span className="doc-alert-more">+{attention.length - 4}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="doc-layout">
        <aside className="doc-rail glass">
          <button className={`doc-cat all ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>
            <span className="doc-cat-left"><LayoutGrid size={16} /> Todos os documentos</span>
            <span className="doc-cat-count">{counts.all}</span>
          </button>
          {CAT_GROUPS.map(g => (
            <div key={g.group} className="doc-cat-group">
              <div className="doc-cat-head">
                <span>{g.group}</span>
                <span className="doc-cat-note">{g.note}</span>
              </div>
              {g.items.map(it => (
                <button key={it.id} className={`doc-cat ${cat === it.id ? 'active' : ''}`} onClick={() => setCat(it.id)}>
                  <span className="doc-cat-left"><it.icon size={16} /> {it.label}</span>
                  <span className="doc-cat-count">{counts[it.id] || 0}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="doc-tbl-head">
            <div>
              <div className="ctitle">{cat === 'all' ? 'Todos os documentos' : CAT_LABEL[cat] + (isColabCat ? 's' : '')}</div>
              <div className="csub">
                {isColabCat
                  ? 'Registro por data · status calculado automaticamente pela validade'
                  : 'Documentos mestres da empresa · status calculado pela validade'}
              </div>
            </div>
            <div className="doc-search">
              <Search size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar documento…" />
            </div>
          </div>

          <div style={{ overflow: 'auto' }}>
            <table className="tbl doc-tbl">
              <thead>
                <tr>
                  <th>{isColabCat ? 'Registro' : 'Documento'}</th>
                  <th>{isColabCat ? 'Colaborador' : 'Tipo'}</th>
                  <th>{isColabCat ? 'Realizado em' : 'Emissão'}</th>
                  <th>Validade</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--ink-500)' }}>Nenhum documento encontrado.</td></tr>
                )}
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="doc-name">
                        <span className={`doc-ic ${r.kind === 'empresa' ? 'file' : 'date'}`}>
                          {r.kind === 'empresa'
                            ? <FileText size={15} />
                            : r.cat === 'cert' ? <GraduationCap size={15} /> : <HardHat size={15} />}
                        </span>
                        <div>
                          <div className="doc-name-main">
                            {r.kind === 'empresa' ? r.nome : r.item}
                            {r.kind === 'empresa' && r.versao && <span className="doc-ver">{r.versao}</span>}
                          </div>
                          <div className="doc-name-sub">
                            {r.kind === 'empresa'
                              ? `${r.resp} · ${r.size}`
                              : r.cat === 'epi' && r.ca ? `Ficha de EPI · CA ${r.ca}` : CAT_LABEL[r.cat]}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.kind === 'empresa'
                        ? <span className="doc-type-pill">{CAT_LABEL[r.cat]}</span>
                        : (
                          <div className="doc-colab">
                            <span className="doc-ava" style={{ background: r.cor }}>{initials(r.colab)}</span>
                            {r.colab}
                          </div>
                        )}
                    </td>
                    <td style={{ color: 'var(--ink-700)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtBR(r.kind === 'empresa' ? r.emissao : r.realizado)}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ fontWeight: 600, color: r.st.key === 'crit' ? 'var(--red-500)' : r.st.key === 'warn' ? 'var(--orange-600)' : 'var(--ink-900)' }}>
                        {fmtBR(r.validade)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{r.st.rel}</div>
                    </td>
                    <td><span className={`chip ${r.st.key}`}>{r.st.label}</span></td>
                    <td>
                      <div className="doc-actions">
                        {r.kind === 'empresa' ? (
                          <>
                            <button className="icon-btn sm" title="Visualizar"><Eye size={15} /></button>
                            <button className="icon-btn sm" title="Baixar"><Download size={15} /></button>
                            <button className={`tbtn ghost sm${r.st.key !== 'ok' ? ' accent' : ''}`} onClick={() => setNovoOpen(true)}>
                              {r.st.key !== 'ok' ? 'Renovar' : 'Nova versão'}
                            </button>
                          </>
                        ) : (
                          <button className={`tbtn ghost sm${r.st.key !== 'ok' ? ' accent' : ''}`} onClick={() => setDateOpen(true)}>
                            <Calendar size={13} /> {r.st.key !== 'ok' ? 'Atualizar data' : 'Editar datas'}
                          </button>
                        )}
                        <button className="icon-btn sm danger" title="Excluir" onClick={() => setConfirmDelId(r.id)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {novoOpen && empresaId && <NovoDocumentoModal onClose={() => setNovoOpen(false)} empresaId={empresaId} />}
      {dateOpen && empresaId && <DateEntryModal onClose={() => setDateOpen(false)} empresaId={empresaId} />}
      {confirmDelId && (
        <div className="modal-backdrop" onClick={() => setConfirmDelId(null)}>
          <div className="modal" style={{ maxWidth: 430 }} onClick={e => e.stopPropagation()}>
            <div className="modal-body" style={{ paddingTop: 26 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div className="del-ic"><Trash2 size={20} /></div>
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 18, fontFamily: 'var(--font-display)' }}>Excluir documento?</h2>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.5 }}>Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <div className="modal-foot">
                <button className="tbtn" onClick={() => setConfirmDelId(null)}>Cancelar</button>
                <button className="tbtn danger" disabled={deletar.isPending} onClick={() => void doDelete(confirmDelId)}>
                  {deletar.isPending ? <Loader2 size={13} className="btn-spinner" /> : <Trash2 size={13} />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default function DocumentosPage() {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <DocumentosAdmin /> : <DocumentosEmpresa />
}
