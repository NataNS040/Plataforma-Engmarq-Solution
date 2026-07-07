import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Shield, Heart, FileText, LayoutGrid, GraduationCap, HardHat,
  Download, Calendar, Plus, CheckCircle2, Clock, AlertTriangle,
  Search, Eye, Trash2, X, Loader2, Pencil,
} from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { useDocumentos, useDocumentoTipos, useCriarDocumento, useDeletarDocumento } from '@/hooks/queries/useDocumentos'
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

interface AdminDocCol { id: string; label: string }
interface AdminDocEntry {
  empresa: string; setor: string; n: number
  docs: Record<string, string | null>
}
interface AdminCellSel { empresa: string; col: AdminDocCol }

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
function emissaoFrom(validadeISO: string | null): string | null {
  if (!validadeISO) return null
  const [y, m, dd] = validadeISO.split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
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
const COLAB_NAMES = ['Marina S. Oliveira', 'Carlos M. Soares', 'Pedro H. Almeida', 'Renata Camargo', 'João V. Mendes', 'Juliana Prado', 'Tiago Ferreira']
const NR_OPTS = ['NR-35 · Trabalho em altura', 'NR-33 · Espaço confinado', 'NR-10 · Segurança elétrica', 'NR-11 · Empilhadeira', 'NR-12 · Máquinas', 'NR-06 · EPI']
const EPI_OPTS = ['Capacete de segurança', 'Protetor auricular', 'Cinto talabarte duplo', 'Luvas de proteção', 'Botina de segurança', 'Óculos de proteção']

// ---------------------------------------------------------------------------
// Admin data
// ---------------------------------------------------------------------------
const ADMIN_DOC_COLS: AdminDocCol[] = [
  { id: 'pgr', label: 'PGR' }, { id: 'pcmso', label: 'PCMSO' }, { id: 'ltcat', label: 'LTCAT' },
  { id: 'insal', label: 'Insalub.' }, { id: 'ergo', label: 'Ergonôm.' }, { id: 'inv', label: 'Invent.' },
]
const ADMIN_DOC_DATA: AdminDocEntry[] = [
  { empresa: 'Logix Industrial',  setor: 'Logística',    n: 247, docs: { pgr: '2027-01-15', pcmso: '2027-02-01', ltcat: '2026-06-20', insal: '2026-05-18', ergo: '2026-12-10', inv: '2027-01-15' } },
  { empresa: 'MetalSul Ltda',     setor: 'Indústria',    n: 412, docs: { pgr: '2026-06-12', pcmso: '2025-12-30', ltcat: '2026-08-01', insal: '2026-06-25', ergo: '2027-03-10', inv: '2026-06-12' } },
  { empresa: 'Construtora Vita',  setor: 'Const. Civil', n: 184, docs: { pgr: '2026-07-05', pcmso: '2026-09-12', ltcat: '2026-06-28', insal: null,         ergo: '2026-06-15', inv: '2026-07-05' } },
  { empresa: 'AgroNorte S.A.',    setor: 'Agro',         n: 321, docs: { pgr: '2027-04-20', pcmso: '2027-01-08', ltcat: '2026-11-30', insal: '2026-10-02', ergo: '2027-02-18', inv: '2027-04-20' } },
  { empresa: 'TransRápido',       setor: 'Transporte',   n: 156, docs: { pgr: '2025-11-20', pcmso: '2026-06-30', ltcat: null,         insal: null,         ergo: '2026-09-04', inv: '2025-11-20' } },
  { empresa: 'Química Beta',      setor: 'Químico',      n: 203, docs: { pgr: '2026-12-01', pcmso: '2026-07-15', ltcat: '2027-01-22', insal: '2026-08-19', ergo: '2026-06-08', inv: '2026-12-01' } },
  { empresa: 'Frigorífico Sul',   setor: 'Alimentos',    n: 389, docs: { pgr: '2026-06-09', pcmso: '2026-05-28', ltcat: '2026-10-11', insal: '2026-07-30', ergo: '2027-05-15', inv: '2026-06-09' } },
  { empresa: 'Têxtil Aurora',     setor: 'Têxtil',       n: 98,  docs: { pgr: '2027-03-03', pcmso: '2027-02-20', ltcat: '2026-09-09', insal: null,         ergo: '2027-01-25', inv: '2027-03-03' } },
]
const ADMIN_DOC_COLORS: Record<string, { bg: string; border: string }> = {
  ok:   { bg: '#10B981', border: '#0E9F6E' },
  warn: { bg: '#F59E0B', border: '#D97706' },
  crit: { bg: '#EF4444', border: '#DC2626' },
  na:   { bg: '#E2E8F0', border: '#CBD5E1' },
}
const ADMIN_DOC_META: Record<string, { nome: string; resp: string; ver: string }> = {
  pgr:   { nome: 'PGR — Gerenciamento de Riscos',   resp: 'Eng. Marcelo Tannous', ver: 'v3' },
  pcmso: { nome: 'PCMSO — Controle Médico',          resp: 'Dra. Helena Vasquez',  ver: 'v2' },
  ltcat: { nome: 'LTCAT — Cond. Ambientais',         resp: 'Eng. Ana Becker',      ver: 'v1' },
  insal: { nome: 'Laudo de Insalubridade',           resp: 'Eng. Ana Becker',      ver: 'v2' },
  ergo:  { nome: 'Laudo Ergonômico (AET)',           resp: 'Fisio. Rui Campos',    ver: 'v1' },
  inv:   { nome: 'Inventário de Riscos',             resp: 'Eng. Marcelo Tannous', ver: 'v3' },
}

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
function DateEntryModal({ onClose }: { onClose: () => void }) {
  const [tipo, setTipo] = useState<'cert' | 'epi'>('cert')
  const [realizado, setRealizado] = useState('')
  const [validade, setValidade] = useState('')
  const [epiItems, setEpiItems] = useState<EpiItem[]>([{ equip: '', ca: '', entrega: '', validade: '' }])

  const suggestCert = () => { if (realizado) setValidade(addYears(realizado, 2)) }
  const updItem = (i: number, patch: Partial<EpiItem>) =>
    setEpiItems(items => items.map((it, j) => j === i ? { ...it, ...patch } : it))
  const addItem = () => setEpiItems(items => [...items, { equip: '', ca: '', entrega: '', validade: '' }])
  const removeItem = (i: number) => setEpiItems(items => items.length === 1 ? items : items.filter((_, j) => j !== i))

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
              <select className="mp-input">
                <option value="">Selecione…</option>
                {COLAB_NAMES.map(n => <option key={n}>{n}</option>)}
              </select>
            </DocField>
            {tipo === 'cert' ? (
              <>
                <DocField label="Norma / treinamento">
                  <select className="mp-input">
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
            <button className="tbtn primary" onClick={onClose}>
              <CheckCircle2 size={13} />
              {tipo === 'epi' ? `Salvar ficha (${epiItems.length} ${epiItems.length === 1 ? 'item' : 'itens'})` : 'Salvar registro'}
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
type AdminStatusCell = { key: DocStatus | 'na'; label: string; rel: string }

function DocumentosAdmin() {
  const [sel, setSel] = useState<AdminCellSel | null>(null)

  const flat = useMemo(() => {
    const out: { empresa: string; col: AdminDocCol; validade: string | null; st: AdminStatusCell }[] = []
    ADMIN_DOC_DATA.forEach(e => ADMIN_DOC_COLS.forEach(c => {
      const v = e.docs[c.id] ?? null
      out.push({ empresa: e.empresa, col: c, validade: v, st: v ? statusFrom(v) : { key: 'na', label: 'N/A', rel: '' } })
    }))
    return out
  }, [])

  const valid = flat.filter(f => f.st.key !== 'na')
  const okN = valid.filter(f => f.st.key === 'ok').length
  const warnN = valid.filter(f => f.st.key === 'warn').length
  const critN = valid.filter(f => f.st.key === 'crit').length
  const pct = valid.length ? Math.round((okN / valid.length) * 100) : 0

  const attention = flat.filter(f => f.st.key === 'crit' || f.st.key === 'warn')
    .sort((a, b) => (a.validade ?? '') < (b.validade ?? '') ? -1 : 1)

  const empScore = (e: AdminDocEntry) => {
    const cells = ADMIN_DOC_COLS.map(c => e.docs[c.id]).filter(Boolean).map(v => statusFrom(v!).key)
    const ok = cells.filter(k => k === 'ok').length
    return cells.length ? Math.round((ok / cells.length) * 100) : 0
  }

  const selEntry = sel ? ADMIN_DOC_DATA.find(x => x.empresa === sel.empresa) : null
  const selValidade = selEntry ? (selEntry.docs[sel!.col.id] ?? null) : null
  const selSt = selValidade ? statusFrom(selValidade) : { key: 'na', label: 'N/A', rel: '' }
  const selMeta = sel ? (ADMIN_DOC_META[sel.col.id] ?? { nome: sel.col.label, resp: '—', ver: '' }) : null

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Documentos · EngMarq</h1>
          <p className="sub">Visão consolidada · documentos mestres das 24 empresas-cliente · status automático por validade</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14} /> Exportar consolidado</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>Documentos monitorados</span><span className="kpi-ic violet"><FileText size={16} /></span></div>
          <div className="kpi-value">{valid.length}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>{ADMIN_DOC_DATA.length} empresas · {ADMIN_DOC_COLS.length} tipos</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Em dia</span><span className="kpi-ic green"><CheckCircle2 size={16} /></span></div>
          <div className="kpi-value">{pct}%</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>{okN} de {valid.length} dentro da validade</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencendo em 30 dias</span><span className="kpi-ic orange"><Clock size={16} /></span></div>
          <div className="kpi-value">{warnN}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>renovação recomendada</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencidos</span><span className="kpi-ic red"><AlertTriangle size={16} /></span></div>
          <div className="kpi-value" style={{ color: critN ? 'var(--red-500)' : 'var(--ink-900)' }}>{critN}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-500)' }}>em {new Set(flat.filter(f => f.st.key === 'crit').map(f => f.empresa)).size} empresas</div>
        </div>
      </div>

      {attention.length > 0 && (
        <div className="doc-alert">
          <div className="doc-alert-ic"><AlertTriangle size={18} /></div>
          <div style={{ flex: 1 }}>
            <div className="doc-alert-title">{attention.length} documentos precisam de atenção em várias empresas</div>
            <div className="doc-alert-row">
              {attention.slice(0, 5).map((f, i) => (
                <button key={i} className={`doc-alert-chip ${f.st.key}`} onClick={() => setSel({ empresa: f.empresa, col: f.col })}>
                  <strong>{f.empresa.split(' ')[0]} · {f.col.label}</strong>
                  <span>{f.st.label} {f.st.rel}</span>
                </button>
              ))}
              {attention.length > 5 && <span className="doc-alert-more">+{attention.length - 5}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="row-2" style={{ gridTemplateColumns: '1fr 300px' }}>
        <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="ctitle">Matriz empresa × documento</div>
              <div className="csub">Clique numa célula para ver o detalhe</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['ok', 'warn', 'crit', 'na'] as const).map(k => (
                <span key={k} className="legend-pill">
                  <span className="sw" style={{ background: ADMIN_DOC_COLORS[k].bg }} />
                  {k === 'ok' ? 'Em dia' : k === 'warn' ? 'Vencendo' : k === 'crit' ? 'Vencido' : 'N/A'}
                </span>
              ))}
            </div>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="tbl" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1, minWidth: 210 }}>Empresa</th>
                  {ADMIN_DOC_COLS.map(c => <th key={c.id} style={{ textAlign: 'center', minWidth: 64 }}>{c.label}</th>)}
                  <th style={{ textAlign: 'right', minWidth: 70 }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_DOC_DATA.map((e, ri) => {
                  const score = empScore(e)
                  return (
                    <tr key={ri}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                        <div className="aso-name">{e.empresa}</div>
                        <div className="aso-role">{e.setor} · {e.n} colab.</div>
                      </td>
                      {ADMIN_DOC_COLS.map(c => {
                        const v = e.docs[c.id] ?? null
                        const st = v ? statusFrom(v) : { key: 'na', label: 'N/A', rel: '' }
                        const isSel = sel?.empresa === e.empresa && sel?.col.id === c.id
                        const colors = ADMIN_DOC_COLORS[st.key] ?? ADMIN_DOC_COLORS.na
                        return (
                          <td key={c.id} style={{ textAlign: 'center', padding: 8 }}>
                            <button
                              onClick={() => setSel({ empresa: e.empresa, col: c })}
                              title={`${e.empresa} · ${c.label} · ${st.key === 'na' ? 'N/A' : fmtBR(v)}`}
                              style={{
                                width: 28, height: 28, borderRadius: 8,
                                background: colors.bg,
                                border: `2px solid ${isSel ? '#0F172A' : colors.border}`,
                                cursor: 'pointer', display: 'grid', placeItems: 'center',
                                color: '#FFF', fontSize: 12, fontWeight: 700,
                                boxShadow: isSel ? '0 0 0 3px rgba(15,23,42,0.15)' : 'none',
                              }}
                            >
                              {st.key === 'ok' ? '✓' : st.key === 'warn' ? '!' : st.key === 'crit' ? '✕' : '—'}
                            </button>
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                          color: score >= 85 ? 'var(--green-600)' : score >= 70 ? 'var(--orange-600)' : 'var(--red-500)' }}>{score}%</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass" style={{ alignSelf: 'start', position: 'sticky', top: 88 }}>
          {sel && selEntry && selMeta ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="aso-name" style={{ fontSize: 15 }}>{sel.empresa}</div>
                  <div className="aso-role">{selEntry.setor} · {selEntry.n} colaboradores</div>
                </div>
                <button className="icon-btn sm" onClick={() => setSel(null)}><X size={14} /></button>
              </div>
              <div className="status-preview" style={{ marginBottom: 14 }}>
                <div className="status-preview-label">
                  {selMeta.nome} {selMeta.ver && <span className="doc-ver" style={{ marginLeft: 4 }}>{selMeta.ver}</span>}
                </div>
                {selSt.key === 'na' ? (
                  <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Não aplicável a esta empresa.</div>
                ) : (
                  <>
                    <div className="status-preview-body" style={{ marginBottom: 10 }}>
                      <span className={`chip ${selSt.key}`} style={{ fontSize: 12 }}>{selSt.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{selSt.rel}</span>
                    </div>
                    <div className="docmeta-grid">
                      <div><span className="dm-lbl">Emissão</span><span className="dm-val">{fmtBR(emissaoFrom(selValidade))}</span></div>
                      <div><span className="dm-lbl">Validade</span>
                        <span className="dm-val" style={{ color: selSt.key === 'crit' ? 'var(--red-500)' : selSt.key === 'warn' ? 'var(--orange-600)' : 'var(--ink-900)' }}>
                          {fmtBR(selValidade)}
                        </span>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}><span className="dm-lbl">Responsável técnico</span><span className="dm-val">{selMeta.resp}</span></div>
                    </div>
                  </>
                )}
              </div>
              <div className="aso-block-head">Documentos da empresa</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                {ADMIN_DOC_COLS.map(c => {
                  const cv = selEntry.docs[c.id] ?? null
                  const cst = cv ? statusFrom(cv) : { key: 'na', label: 'N/A', rel: '' }
                  const isCur = c.id === sel.col.id
                  return (
                    <button key={c.id} onClick={() => setSel({ empresa: sel.empresa, col: c })}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        padding: '8px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                        background: isCur ? 'var(--orange-50)' : 'var(--bg)',
                        border: `1px solid ${isCur ? 'var(--orange-500)' : 'var(--border)'}` }}>
                      <span style={{ fontSize: 12, fontWeight: isCur ? 700 : 500, color: 'var(--ink-900)' }}>{c.label}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {cv && <span style={{ fontSize: 10.5, color: 'var(--ink-500)', fontVariantNumeric: 'tabular-nums' }}>{fmtBR(cv)}</span>}
                        <span className={`chip ${cst.key}`} style={{ fontSize: 10 }}>{cst.label}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="bar-inline" style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-500)', minWidth: 92 }}>Conformidade</span>
                <div className="track">
                  <div className={`fill ${empScore(selEntry) < 70 ? 'crit' : empScore(selEntry) < 85 ? 'warn' : ''}`} style={{ width: `${empScore(selEntry)}%` }} />
                </div>
                <span className="num">{empScore(selEntry)}%</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="tbtn primary" style={{ justifyContent: 'center' }}><Eye size={13} /> Abrir empresa</button>
                {selSt.key !== 'na' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="tbtn" style={{ flex: 1, justifyContent: 'center' }}><Download size={13} /> Baixar</button>
                    <button className={`tbtn${selSt.key !== 'ok' ? ' primary' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
                      {selSt.key !== 'ok' ? <><Clock size={13} /> Renovar</> : <><Pencil size={13} /> Nova versão</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="ctitle" style={{ marginBottom: 4 }}>Conformidade documental</div>
              <div className="csub" style={{ marginBottom: 14 }}>Empresas com mais pendências</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...ADMIN_DOC_DATA].sort((a, b) => empScore(a) - empScore(b)).slice(0, 6).map((e, i) => {
                  const s = empScore(e)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="aso-name" style={{ fontSize: 12.5 }}>{e.empresa}</div>
                        <div className="aso-role" style={{ fontSize: 10.5 }}>{e.setor}</div>
                      </div>
                      <span style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums',
                        color: s >= 85 ? 'var(--green-600)' : s >= 70 ? 'var(--orange-600)' : 'var(--red-500)' }}>{s}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DocumentosEmpresa — plugada no Supabase
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
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>Campo “arquivo” disponível em breve · status calculado automaticamente pela validade</div>
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

function DocumentosEmpresa() {
  const { empresaId } = useCurrentProfile()
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
        <div>
          <h1>Documentos SST</h1>
          <p className="sub">Logix Industrial · documentos mestres e registros por colaborador · status automático por validade</p>
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
      {dateOpen && <DateEntryModal onClose={() => setDateOpen(false)} />}
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
