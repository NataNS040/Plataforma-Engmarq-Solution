import { useState, useMemo } from 'react'
import {
  CheckCircle2, Clock, AlertTriangle, Calendar, Download, Plus,
  Eye, Trash2, X, Search, Stethoscope, Filter, MapPin,
} from 'lucide-react'
import { useAuth } from '@/modules/auth/AuthProvider'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayMid() {
  const t = new Date(2026, 5, 6); t.setHours(0, 0, 0, 0); return t
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

interface ColobInfo { cor: string; cargo: string; setor: string }
const COLABS_MAP: Record<string, ColobInfo> = {
  'Carlos M. Soares':   { cor: '#2563EB', cargo: 'Op. Empilhadeira', setor: 'Logística' },
  'Marina S. Oliveira': { cor: '#DB2777', cargo: 'Coord. RH',        setor: 'Administrativo' },
  'Pedro H. Almeida':   { cor: '#7C3AED', cargo: 'Soldador',         setor: 'Produção' },
  'Renata Camargo':     { cor: '#0891B2', cargo: 'Téc. Segurança',   setor: 'SST' },
  'João V. Mendes':     { cor: '#059669', cargo: 'Eletricista',      setor: 'Manutenção' },
  'Juliana Prado':      { cor: '#D97706', cargo: 'Analista Fiscal',  setor: 'Administrativo' },
  'Tiago Ferreira':     { cor: '#475569', cargo: 'Op. Produção',     setor: 'Produção' },
  'Beatriz Nunes':      { cor: '#BE185D', cargo: 'Enfermeira Trab.', setor: 'SST' },
}
const byName = (n: string): ColobInfo => COLABS_MAP[n] ?? { cor: '#94A3B8', cargo: '—', setor: '—' }
const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const TIPOS = ['Admissional', 'Periódico', 'Mudança de risco', 'Retorno ao trabalho', 'Demissional']
const RESULTADOS = ['Apto', 'Apto com restrição', 'Inapto']
const RES_KEY: Record<string, AsoStatusKey> = { 'Apto': 'ok', 'Apto com restrição': 'warn', 'Inapto': 'crit' }

interface AsoSeed { id: string; colab: string; tipo: string; realizado: string; validade: string; resultado: string }
const ASO_SEED: AsoSeed[] = [
  { id:'a1', colab:'Carlos M. Soares',   tipo:'Periódico',           realizado:'2025-06-12', validade:'2026-06-12', resultado:'Apto com restrição' },
  { id:'a2', colab:'Pedro H. Almeida',   tipo:'Periódico',           realizado:'2024-05-20', validade:'2026-05-20', resultado:'Apto' },
  { id:'a3', colab:'João V. Mendes',     tipo:'Mudança de risco',    realizado:'2025-11-08', validade:'2026-11-08', resultado:'Apto' },
  { id:'a4', colab:'Renata Camargo',     tipo:'Periódico',           realizado:'2025-12-01', validade:'2026-12-01', resultado:'Apto' },
  { id:'a5', colab:'Marina S. Oliveira', tipo:'Periódico',           realizado:'2024-04-18', validade:'2026-04-18', resultado:'Apto' },
  { id:'a6', colab:'Tiago Ferreira',     tipo:'Admissional',         realizado:'2026-02-10', validade:'2027-02-10', resultado:'Apto' },
  { id:'a7', colab:'Juliana Prado',      tipo:'Periódico',           realizado:'2025-06-25', validade:'2026-06-25', resultado:'Apto' },
  { id:'a8', colab:'Beatriz Nunes',      tipo:'Retorno ao trabalho', realizado:'2025-09-30', validade:'2026-09-30', resultado:'Apto' },
  { id:'a9', colab:'Carlos M. Soares',   tipo:'Mudança de risco',    realizado:'2024-03-12', validade:'2026-05-30', resultado:'Inapto' },
]

const COMPLEMENTARES = [
  { exame: 'Audiometria',        risco: 'Ruído ocupacional',    previstos: 84, realizados: 76 },
  { exame: 'Hemograma completo', risco: 'Agentes químicos',     previstos: 52, realizados: 49 },
  { exame: 'Espirometria',       risco: 'Poeiras / fumos',      previstos: 38, realizados: 30 },
  { exame: 'Acuidade visual',    risco: 'Operação de máquinas', previstos: 61, realizados: 58 },
  { exame: 'Eletrocardiograma',  risco: 'Trabalho em altura',   previstos: 47, realizados: 41 },
  { exame: 'Raio-X de tórax',    risco: 'Sílica / asbesto',     previstos: 22, realizados: 18 },
]

interface AgendaItem { id: string; data: string; hora: string; colab: string; tipo: string }
const AGENDA_SEED: AgendaItem[] = [
  { id:'g1', data:'2026-06-09', hora:'08:30', colab:'Carlos M. Soares',   tipo:'Periódico' },
  { id:'g2', data:'2026-06-09', hora:'09:15', colab:'Pedro H. Almeida',   tipo:'Periódico' },
  { id:'g3', data:'2026-06-12', hora:'10:00', colab:'Juliana Prado',      tipo:'Periódico' },
  { id:'g4', data:'2026-06-18', hora:'08:00', colab:'Carlos M. Soares',   tipo:'Mudança de risco' },
  { id:'g5', data:'2026-06-23', hora:'14:30', colab:'Marina S. Oliveira', tipo:'Periódico' },
  { id:'g6', data:'2026-06-30', hora:'11:00', colab:'Equipe manutenção (4)', tipo:'Periódico' },
]

const PCMSO_EXEC = { previstos: 247, realizados: 218 }
const PCMSO_DOC = { nome: 'PCMSO — Programa de Controle Médico', versao: 'v2', emissao: '2026-01-15', validade: '2027-01-15', resp: 'Dra. Helena Vasquez' }

interface AdminEmp {
  empresa: string; setor: string; n: number; asoOk: number; warn: number; crit: number
  pcmso: string; medico: string; clinica: string; agend: number
  comp: { e: string; p: number; r: number }[]
  criticos: { nome: string; cargo: string; tipo: string; validade: string }[]
}
const ADMIN_EMP: AdminEmp[] = [
  { empresa:'Logix Industrial',  setor:'Logística',    n:247, asoOk:94, warn:14, crit:3,  pcmso:'2027-02-01', medico:'Dr. Aurélio Lima',    clinica:'Clínica OcupaMed · Diadema',    agend:6,
    comp:[{e:'Acuidade visual',p:61,r:58},{e:'Audiometria',p:84,r:76},{e:'Eletrocardiograma',p:47,r:41}],
    criticos:[{nome:'Carlos M. Soares',cargo:'Op. Empilhadeira',tipo:'Mudança de risco',validade:'2026-05-30'},{nome:'Diego Vasconcelos',cargo:'Op. Caldeira',tipo:'Periódico',validade:'2026-06-15'}]},
  { empresa:'MetalSul Ltda',     setor:'Indústria',    n:412, asoOk:81, warn:38, crit:12, pcmso:'2025-12-30', medico:'Dra. Helena Vasquez', clinica:'CEMOT · Santo André',           agend:11,
    comp:[{e:'Audiometria',p:188,r:151},{e:'Espirometria',p:96,r:70},{e:'Hemograma completo',p:142,r:130}],
    criticos:[{nome:'Anderson Brito',cargo:'Soldador',tipo:'Periódico',validade:'2026-04-22'},{nome:'Marcos Vinícius',cargo:'Op. Prensa',tipo:'Periódico',validade:'2026-05-10'}]},
  { empresa:'Construtora Vita',  setor:'Const. Civil', n:184, asoOk:88, warn:17, crit:4,  pcmso:'2026-09-12', medico:'Dr. Aurélio Lima',    clinica:'OcupaMed · São Paulo',          agend:4,
    comp:[{e:'Eletrocardiograma',p:71,r:63},{e:'Acuidade visual',p:54,r:50},{e:'Audiometria',p:62,r:55}],
    criticos:[{nome:'Joel Andrade',cargo:'Pedreiro',tipo:'Periódico',validade:'2026-05-28'},{nome:'Sérgio Pinto',cargo:'Op. Guindaste',tipo:'Periódico',validade:'2026-06-12'}]},
  { empresa:'AgroNorte S.A.',    setor:'Agro',         n:321, asoOk:91, warn:22, crit:5,  pcmso:'2027-01-08', medico:'Dra. Beatriz Nunes',  clinica:'AgroSaúde · Ribeirão Preto',    agend:7,
    comp:[{e:'Hemograma completo',p:132,r:118},{e:'Espirometria',p:88,r:71},{e:'Acuidade visual',p:74,r:70}],
    criticos:[{nome:'Valdir Souza',cargo:'Aplicador',tipo:'Mudança de risco',validade:'2026-05-20'},{nome:'Equipe campo (3)',cargo:'Lavoura',tipo:'Periódico',validade:'2026-06-18'}]},
  { empresa:'TransRápido',       setor:'Transporte',   n:156, asoOk:76, warn:19, crit:9,  pcmso:'2026-06-30', medico:'Dr. Aurélio Lima',    clinica:'OcupaMed · Guarulhos',          agend:5,
    comp:[{e:'Acuidade visual',p:78,r:60},{e:'Eletrocardiograma',p:52,r:40},{e:'Audiometria',p:49,r:39}],
    criticos:[{nome:'Antônio Reis',cargo:'Motorista',tipo:'Periódico',validade:'2026-04-30'},{nome:'Cleber Maia',cargo:'Motorista',tipo:'Periódico',validade:'2026-05-08'}]},
  { empresa:'Química Beta',      setor:'Químico',      n:203, asoOk:85, warn:21, crit:6,  pcmso:'2026-07-15', medico:'Dra. Helena Vasquez', clinica:'CEMOT · Cubatão',               agend:6,
    comp:[{e:'Hemograma completo',p:96,r:84},{e:'Espirometria',p:72,r:58},{e:'Audiometria',p:64,r:55}],
    criticos:[{nome:'Rafael Toledo',cargo:'Op. Reator',tipo:'Mudança de risco',validade:'2026-05-15'},{nome:'Equipe envase (3)',cargo:'Envase',tipo:'Periódico',validade:'2026-06-20'}]},
  { empresa:'Frigorífico Sul',   setor:'Alimentos',    n:389, asoOk:79, warn:41, crit:14, pcmso:'2026-05-28', medico:'Dra. Beatriz Nunes',  clinica:'SaúdeTrab · Chapecó',           agend:9,
    comp:[{e:'Hemograma completo',p:156,r:132},{e:'Audiometria',p:144,r:118},{e:'Acuidade visual',p:98,r:90}],
    criticos:[{nome:'Ivone Maciel',cargo:'Op. Câmara fria',tipo:'Periódico',validade:'2026-04-18'},{nome:'Equipe desossa (6)',cargo:'Desossa',tipo:'Mudança de risco',validade:'2026-05-05'}]},
  { empresa:'Têxtil Aurora',     setor:'Têxtil',       n:98,  asoOk:96, warn:4,  crit:0,  pcmso:'2027-02-20', medico:'Dra. Helena Vasquez', clinica:'CEMOT · Americana',             agend:2,
    comp:[{e:'Espirometria',p:42,r:41},{e:'Audiometria',p:56,r:54},{e:'Acuidade visual',p:38,r:37}],
    criticos:[{nome:'Lúcia Fontes',cargo:'Tecelã',tipo:'Periódico',validade:'2026-08-12'}]},
]

// ---------------------------------------------------------------------------
// Donut chart (CSS conic-gradient)
// ---------------------------------------------------------------------------
interface DonutData { l: string; v: number; c: string }
function Donut({ size, thickness, centerValue, centerLabel, data }: {
  size: number; thickness: number; centerValue: string; centerLabel: string; data: DonutData[]
}) {
  const total = data.reduce((s, d) => s + d.v, 0)
  let cum = 0
  const stops = data.map(d => {
    const start = Math.round(cum * 100)
    cum += d.v / total
    const end = Math.round(cum * 100)
    return `${d.c} ${start}% ${end}%`
  }).join(', ')
  const inner = size - thickness * 2
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <div style={{ width:size, height:size, borderRadius:'50%', background:`conic-gradient(from -90deg, ${stops})` }}/>
      <div style={{
        position:'absolute', top:thickness, left:thickness,
        width:inner, height:inner, borderRadius:'50%',
        background:'var(--surface)',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
      }}>
        <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:Math.round(size*0.13), color:'var(--ink-900)', lineHeight:1 }}>{centerValue}</span>
        <span style={{ fontSize:Math.round(size*0.075), color:'var(--ink-500)' }}>{centerLabel}</span>
      </div>
    </div>
  )
}

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
function NewAsoModal({ onClose, onSave }: { onClose: () => void; onSave: (a: AsoSeed) => void }) {
  const [colab, setColab] = useState('')
  const [tipo, setTipo] = useState('')
  const [resultado, setResultado] = useState('')
  const [realizado, setRealizado] = useState('')
  const [validade, setValidade] = useState('')

  const suggest = () => { if (realizado) setValidade(addYears(realizado, 1)) }
  const canSave = colab && tipo && resultado && realizado && validade

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
              <select className="mp-input" value={colab} onChange={e => setColab(e.target.value)}>
                <option value="">Selecione…</option>
                {Object.keys(COLABS_MAP).map(n => <option key={n}>{n}</option>)}
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
          </div>
          <div className="modal-foot">
            <button className="tbtn" onClick={onClose}>Cancelar</button>
            <button
              className="tbtn primary"
              disabled={!canSave}
              style={!canSave ? { opacity:0.5, pointerEvents:'none' } : undefined}
              onClick={() => onSave({ id:'a'+Date.now(), colab, tipo, realizado, validade, resultado })}
            >
              <CheckCircle2 size={13}/> Salvar ASO
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
                {Object.keys(COLABS_MAP).map(n => <option key={n}>{n}</option>)}
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
              onClick={onClose}
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
// AgendaCalendar
// ---------------------------------------------------------------------------
function AgendaCalendar({ agenda, onNew }: { agenda: AgendaItem[]; onNew: () => void }) {
  const year = 2026, month = 5 // junho
  const today = 6
  const startDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const byDay: Record<number, AgendaItem[]> = {}
  agenda.forEach(g => {
    const d = Number(g.data.split('-')[2]);
    (byDay[d] = byDay[d] ?? []).push(g)
  })

  const firstWithEvent = Math.min(...Object.keys(byDay).map(Number))
  const [sel, setSel] = useState(firstWithEvent)

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const dows = ['D','S','T','Q','Q','S','S']
  const selEvents = byDay[sel] ?? []

  return (
    <div>
      <div className="cal">
        <div className="cal-dow">
          {dows.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (d === null) return <span key={i} className="cal-cell empty"/>
            const events = byDay[d]
            const isToday = d === today
            const isSel = d === sel
            return (
              <button
                key={i}
                className={`cal-cell${events ? ' has' : ''}${isToday ? ' today' : ''}${isSel ? ' sel' : ''}`}
                onClick={() => setSel(d)}
                disabled={!events}
              >
                {d}
                {events && <span className="cal-dot">{events.length > 1 ? events.length : ''}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="cal-events">
        <div className="cal-events-head">
          {selEvents.length
            ? `${String(sel).padStart(2,'0')} jun · ${selEvents.length} exame${selEvents.length > 1 ? 's' : ''}`
            : 'Selecione um dia com exame'}
        </div>
        {selEvents.map(g => {
          const c = byName(g.colab)
          return (
            <div key={g.id} className="cal-event">
              <span className="cal-event-time">{g.hora}</span>
              <span className="ava" style={{ background:c.cor, width:24, height:24, fontSize:9 }}>{initials(g.colab)}</span>
              <div className="cal-event-body">
                <div className="cal-event-colab">{g.colab}</div>
                <div className="cal-event-tipo">{g.tipo}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExamesEmpresa
// ---------------------------------------------------------------------------
function ExamesEmpresa() {
  const [asos, setAsos] = useState(ASO_SEED)
  const [agenda] = useState(AGENDA_SEED)
  const [fTipo, setFTipo] = useState('Todos')
  const [fStatus, setFStatus] = useState('all')
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [schedOpen, setSchedOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<AsoSeed | null>(null)
  const [prefill, setPrefill] = useState<string | null>(null)

  const rows = useMemo(() => asos.map(a => ({ ...a, ...byName(a.colab), st: asoStatus(a.validade) })), [asos])
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

  const doDelete = (row: AsoSeed) => { setAsos(s => s.filter(x => x.id !== row.id)); setConfirmDel(null) }
  const openSchedFor = (nome: string) => { setPrefill(nome); setSchedOpen(true) }

  const pcmsoAno = (PCMSO_DOC.emissao ?? '').slice(0, 4) || '2026'
  const pcmsoStatus = asoStatus(PCMSO_DOC.validade)
  const pcmsoPct = Math.round((PCMSO_EXEC.realizados / PCMSO_EXEC.previstos) * 100)

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>ASOs e PCMSO</h1>
          <p className="sub">Logix Industrial · atestados de saúde ocupacional · status automático por validade</p>
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
          <div className="kpi-label"><span>Exames agendados</span><span className="kpi-ic violet"><Calendar size={16}/></span></div>
          <div className="kpi-value">{agenda.length}</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>próximos · junho/2026</div>
        </div>
      </div>

      {/* PCMSO */}
      <div className="glass pcmso">
        <div className="pcmso-doc">
          <div className="pcmso-ic"><Stethoscope size={22}/></div>
          <div style={{ flex:1 }}>
            <div className="pcmso-eyebrow">Programa anual · PCMSO · cadastrado em Documentos</div>
            <div className="pcmso-title">PCMSO {pcmsoAno} <span className="pcmso-ver">{PCMSO_DOC.versao}</span></div>
            <div className="pcmso-vig">Vigência {brDate(PCMSO_DOC.emissao)} — {brDate(PCMSO_DOC.validade)} · resp. {PCMSO_DOC.resp}</div>
          </div>
          <div className="pcmso-doc-side">
            <span className={`chip ${pcmsoStatus.key}`}>{pcmsoStatus.label}</span>
            <button className="tbtn"><Download size={13}/> Baixar PCMSO</button>
          </div>
        </div>

        <div className="pcmso-grid">
          <div className="pcmso-block">
            <div className="pcmso-block-head">Exames previstos × realizados</div>
            <div className="pcmso-donut-row">
              <div className="pcmso-donut">
                <Donut
                  size={150} thickness={22}
                  centerValue={`${pcmsoPct}%`} centerLabel="realizados"
                  data={[
                    { l:'Realizados', v:PCMSO_EXEC.realizados, c:'#10B981' },
                    { l:'Pendentes',  v:PCMSO_EXEC.previstos - PCMSO_EXEC.realizados, c:'#E2E8F0' },
                  ]}
                />
              </div>
              <div className="pcmso-donut-side">
                <div className="pdl-item">
                  <span className="dotc green"/>
                  <div><strong>{PCMSO_EXEC.realizados}</strong><span>realizados</span></div>
                </div>
                <div className="pdl-item">
                  <span className="dotc neutral"/>
                  <div><strong>{PCMSO_EXEC.previstos - PCMSO_EXEC.realizados}</strong><span>pendentes</span></div>
                </div>
                <div className="pdl-total">{PCMSO_EXEC.previstos} exames previstos no ano</div>
              </div>
            </div>
          </div>

          <div className="pcmso-block">
            <div className="pcmso-block-head">Exames complementares por risco</div>
            <div className="comp-list">
              {COMPLEMENTARES.map((c, i) => {
                const pct = Math.round((c.realizados / c.previstos) * 100)
                const col = pct >= 90 ? 'var(--green-500)' : pct >= 75 ? 'var(--orange-500)' : 'var(--red-500)'
                return (
                  <div key={i} className="comp-row">
                    <div className="comp-info">
                      <span className="comp-name">{c.exame}</span>
                      <span className="comp-risco">{c.risco}</span>
                    </div>
                    <div className="comp-track"><div style={{ width:`${pct}%`, background:col }}/></div>
                    <div className="comp-num">{c.realizados}<span>/{c.previstos}</span></div>
                  </div>
                )
              })}
            </div>
          </div>
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
                  <th>Realização</th>
                  <th>Validade</th>
                  <th>Resultado</th>
                  <th>Status</th>
                  <th style={{ textAlign:'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'var(--ink-500)' }}>Nenhum ASO encontrado com esses filtros.</td></tr>
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
              <div className="csub">Junho 2026</div>
            </div>
            <button className="icon-btn sm" onClick={() => { setPrefill(null); setSchedOpen(true) }} title="Agendar"><Plus size={15}/></button>
          </div>
          <AgendaCalendar agenda={agenda} onNew={() => { setPrefill(null); setSchedOpen(true) }}/>
        </div>
      </div>

      {newOpen && <NewAsoModal onClose={() => setNewOpen(false)} onSave={a => { setAsos(s => [a, ...s]); setNewOpen(false) }}/>}
      {schedOpen && <ScheduleModal prefill={prefill} onClose={() => setSchedOpen(false)}/>}
      {confirmDel && <ConfirmDelete row={confirmDel} onCancel={() => setConfirmDel(null)} onConfirm={() => doDelete(confirmDel)}/>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExamesAdmin
// ---------------------------------------------------------------------------
function ExamesAdmin() {
  const [sortBy, setSortBy] = useState<'risco'|'porte'>('risco')
  const [sel, setSel] = useState<string | null>(null)

  const rows = ADMIN_EMP.map(e => ({ ...e, pcmsoSt: asoStatus(e.pcmso) }))
  const totalColab = rows.reduce((s, e) => s + e.n, 0)
  const totalCrit  = rows.reduce((s, e) => s + e.crit, 0)
  const totalWarn  = rows.reduce((s, e) => s + e.warn, 0)
  const totalOkAbs = Math.round(rows.reduce((s, e) => s + e.n * e.asoOk / 100, 0))
  const avgOk = Math.round(rows.reduce((s, e) => s + e.asoOk, 0) / rows.length)
  const pcmsoVenc = rows.filter(e => e.pcmsoSt.key !== 'ok').length

  const sorted = [...rows].sort((a, b) => sortBy === 'risco' ? (a.asoOk - b.asoOk) : (b.n - a.n))
  const attention = rows.filter(e => e.crit > 0 || e.pcmsoSt.key === 'crit').sort((a, b) => b.crit - a.crit)

  const compTotals: Record<string, { e: string; p: number; r: number }> = {}
  rows.forEach(e => e.comp.forEach(c => {
    const t = compTotals[c.e] ?? (compTotals[c.e] = { e:c.e, p:0, r:0 })
    t.p += c.p; t.r += c.r
  }))
  const compConsolidado = Object.values(compTotals).sort((a, b) => (a.r/a.p) - (b.r/b.p))

  const selData = sel ? rows.find(e => e.empresa === sel) : null

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Exames médicos · PCMSO · EngMarq</h1>
          <p className="sub">Saúde ocupacional consolidada · 24 empresas-cliente · clique numa empresa para o perfil completo</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Filter size={14}/> Filtros</button>
          <button className="tbtn primary"><Download size={14}/> Exportar consolidado</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>ASOs em dia (médio)</span><span className="kpi-ic green"><CheckCircle2 size={16}/></span></div>
          <div className="kpi-value">{avgOk}%</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>{totalColab.toLocaleString('pt-BR')} colaboradores · {totalOkAbs.toLocaleString('pt-BR')} em dia</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>ASOs vencendo</span><span className="kpi-ic orange"><Clock size={16}/></span></div>
          <div className="kpi-value">{totalWarn}</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>próximos 30 dias</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>ASOs vencidos</span><span className="kpi-ic red"><AlertTriangle size={16}/></span></div>
          <div className="kpi-value" style={{ color:'var(--red-500)' }}>{totalCrit}</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>em {rows.filter(e => e.crit > 0).length} empresas</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>PCMSO a renovar</span><span className="kpi-ic violet"><Stethoscope size={16}/></span></div>
          <div className="kpi-value">{pcmsoVenc}</div>
          <div style={{ marginTop:8, fontSize:12, color:'var(--ink-500)' }}>de {rows.length} programas</div>
        </div>
      </div>

      {attention.length > 0 && (
        <div className="doc-alert">
          <div className="doc-alert-ic"><AlertTriangle size={18}/></div>
          <div style={{ flex:1 }}>
            <div className="doc-alert-title">{attention.length} empresas com saúde ocupacional crítica</div>
            <div className="doc-alert-row">
              {attention.slice(0, 5).map((e, i) => (
                <button key={i} className="doc-alert-chip crit" onClick={() => setSel(e.empresa)}>
                  <strong>{e.empresa.split(' ')[0]}</strong>
                  <span>{e.crit} ASOs vencidos{e.pcmsoSt.key === 'crit' ? ' · PCMSO' : ''}</span>
                </button>
              ))}
              {attention.length > 5 && <span className="doc-alert-more">+{attention.length - 5}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="row-2" style={{ gridTemplateColumns:'1fr 320px' }}>
        {/* Tabela */}
        <div className="glass" style={{ padding:0, overflow:'hidden', alignSelf:'start' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div>
              <div className="ctitle">Empresas — saúde ocupacional</div>
              <div className="csub">ASOs e PCMSO por empresa · status automático por validade</div>
            </div>
            <div className="seg">
              <button className={sortBy === 'risco' ? 'on' : ''} onClick={() => setSortBy('risco')}>Por risco</button>
              <button className={sortBy === 'porte' ? 'on' : ''} onClick={() => setSortBy('porte')}>Por porte</button>
            </div>
          </div>
          <div style={{ overflow:'auto' }}>
            <table className="tbl aso-tbl" style={{ minWidth:640 }}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th style={{ minWidth:150 }}>ASOs em dia</th>
                  <th style={{ textAlign:'center' }}>Venc.</th>
                  <th style={{ textAlign:'center' }}>Vencidos</th>
                  <th>PCMSO</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, i) => {
                  const col    = e.asoOk >= 90 ? 'var(--green-600)' : e.asoOk >= 80 ? 'var(--orange-600)' : 'var(--red-500)'
                  const barCol = e.asoOk >= 90 ? 'var(--green-500)' : e.asoOk >= 80 ? 'var(--orange-500)' : 'var(--red-500)'
                  const isSel = sel === e.empresa
                  return (
                    <tr key={i} onClick={() => setSel(e.empresa)} style={{ cursor:'pointer', background: isSel ? 'var(--orange-50)' : undefined }}>
                      <td>
                        <div className="aso-name">{e.empresa}</div>
                        <div className="aso-role">{e.setor} · {e.n} colab.</div>
                      </td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ flex:1, height:8, borderRadius:999, background:'var(--bg-tint-1)', overflow:'hidden', minWidth:60 }}>
                            <div style={{ width:`${e.asoOk}%`, height:'100%', background:barCol, borderRadius:999 }}/>
                          </div>
                          <span style={{ fontFamily:'Plus Jakarta Sans', fontWeight:700, fontSize:13, color:col, fontVariantNumeric:'tabular-nums', minWidth:38, textAlign:'right' }}>{e.asoOk}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign:'center', fontVariantNumeric:'tabular-nums', color: e.warn ? 'var(--orange-600)' : 'var(--ink-400)', fontWeight:600 }}>{e.warn}</td>
                      <td style={{ textAlign:'center', fontVariantNumeric:'tabular-nums', color: e.crit ? 'var(--red-500)' : 'var(--ink-400)', fontWeight:700 }}>{e.crit}</td>
                      <td>
                        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                          <span className={`chip ${e.pcmsoSt.key}`} style={{ width:'fit-content' }}>{e.pcmsoSt.label}</span>
                          <span style={{ fontSize:10.5, color:'var(--ink-500)' }}>vence {brDate(e.pcmso)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Painel lateral */}
        <div className="glass" style={{ alignSelf:'start', position:'sticky', top:88 }}>
          {selData ? (
            <div>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                <div>
                  <div className="aso-name" style={{ fontSize:15 }}>{selData.empresa}</div>
                  <div className="aso-role">{selData.setor} · {selData.n} colaboradores</div>
                </div>
                <button className="icon-btn sm" onClick={() => setSel(null)}><X size={14}/></button>
              </div>

              <div className="status-preview" style={{ marginBottom:12 }}>
                <div className="status-preview-label">Equipe EngMarq</div>
                <div style={{ display:'flex', flexDirection:'column', gap:4, fontSize:12, color:'var(--ink-700)' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:7 }}><Stethoscope size={13} style={{ color:'var(--orange-600)' }}/> {selData.medico}</span>
                  <span style={{ display:'flex', alignItems:'center', gap:7 }}><MapPin size={13} style={{ color:'var(--ink-400)' }}/> {selData.clinica}</span>
                </div>
              </div>

              <div className="aso-block-head">Situação dos ASOs</div>
              {(() => {
                const okAbs = Math.round(selData.n * selData.asoOk / 100)
                const total = okAbs + selData.warn + selData.crit
                return (
                  <>
                    <div style={{ height:12, borderRadius:6, overflow:'hidden', display:'flex', background:'var(--bg-tint-1)', marginBottom:10 }}>
                      {okAbs > 0 && <div style={{ width:`${(okAbs/total)*100}%`, background:'#10B981' }}/>}
                      {selData.warn > 0 && <div style={{ width:`${(selData.warn/total)*100}%`, background:'#F59E0B' }}/>}
                      {selData.crit > 0 && <div style={{ width:`${(selData.crit/total)*100}%`, background:'#EF4444' }}/>}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
                      <div className="aso-stat-row"><span className="dotc green"/>Em dia<b>{okAbs}</b></div>
                      <div className="aso-stat-row"><span className="dotc" style={{ background:'#F59E0B' }}/>Vencendo<b style={{ color: selData.warn ? 'var(--orange-600)' : undefined }}>{selData.warn}</b></div>
                      <div className="aso-stat-row"><span className="dotc" style={{ background:'#EF4444' }}/>Vencidos<b style={{ color: selData.crit ? 'var(--red-500)' : undefined }}>{selData.crit}</b></div>
                    </div>
                  </>
                )
              })()}

              <div className="aso-block-head">Programa PCMSO</div>
              <div className="status-preview" style={{ marginBottom:14 }}>
                <div className="status-preview-body" style={{ justifyContent:'space-between' }}>
                  <span className={`chip ${selData.pcmsoSt.key}`}>{selData.pcmsoSt.label}</span>
                  <span style={{ fontSize:12, color:'var(--ink-500)' }}>vence {brDate(selData.pcmso)}</span>
                </div>
              </div>

              <div className="aso-block-head">Exames complementares</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                {selData.comp.map((c, i) => {
                  const pct = Math.round((c.r/c.p)*100)
                  const cc = pct >= 90 ? 'var(--green-500)' : pct >= 75 ? 'var(--orange-500)' : 'var(--red-500)'
                  return (
                    <div key={i} className="comp-row">
                      <div className="comp-info"><span className="comp-name" style={{ fontSize:12 }}>{c.e}</span></div>
                      <div className="comp-track"><div style={{ width:`${pct}%`, background:cc }}/></div>
                      <div className="comp-num">{c.r}<span>/{c.p}</span></div>
                    </div>
                  )
                })}
              </div>

              <div className="aso-block-head">Colaboradores em atenção</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:14 }}>
                {selData.criticos.map((c, i) => {
                  const st = asoStatus(c.validade)
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 9px', borderRadius:9, background:'var(--surface-2)', border:'1px solid var(--border)' }}>
                      <span className="ava" style={{ background: byName(c.nome).cor ?? '#94A3B8', width:26, height:26, fontSize:9, flexShrink:0 }}>{initials(c.nome)}</span>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--ink-900)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nome}</div>
                        <div style={{ fontSize:10.5, color:'var(--ink-500)' }}>{c.cargo} · {c.tipo}</div>
                      </div>
                      <span className={`chip ${st.key}`} style={{ fontSize:10 }}>{st.label}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <button className="tbtn primary" style={{ justifyContent:'center' }}><Eye size={13}/> Abrir empresa</button>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="tbtn" style={{ flex:1, justifyContent:'center' }}><Calendar size={13}/> Agendar</button>
                  <button className="tbtn" style={{ flex:1, justifyContent:'center' }}><Download size={13}/> PCMSO</button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="ctitle" style={{ marginBottom:2 }}>Saúde ocupacional</div>
              <div className="csub" style={{ marginBottom:14 }}>Consolidado · 24 empresas</div>

              <div style={{ display:'grid', placeItems:'center', marginBottom:8 }}>
                <Donut
                  size={150} thickness={22}
                  centerValue={`${avgOk}%`} centerLabel="em dia"
                  data={[
                    { l:'Em dia',   v:totalOkAbs, c:'#10B981' },
                    { l:'Vencendo', v:totalWarn,  c:'#F59E0B' },
                    { l:'Vencidos', v:totalCrit,  c:'#EF4444' },
                  ]}
                />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
                <div className="aso-stat-row"><span className="dotc green"/>Em dia<b>{totalOkAbs.toLocaleString('pt-BR')}</b></div>
                <div className="aso-stat-row"><span className="dotc" style={{ background:'#F59E0B' }}/>Vencendo<b style={{ color:'var(--orange-600)' }}>{totalWarn}</b></div>
                <div className="aso-stat-row"><span className="dotc" style={{ background:'#EF4444' }}/>Vencidos<b style={{ color:'var(--red-500)' }}>{totalCrit}</b></div>
              </div>

              <div className="aso-block-head">Complementares · consolidado</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                {compConsolidado.map((c, i) => {
                  const pct = Math.round((c.r/c.p)*100)
                  const cc = pct >= 90 ? 'var(--green-500)' : pct >= 75 ? 'var(--orange-500)' : 'var(--red-500)'
                  return (
                    <div key={i} className="comp-row">
                      <div className="comp-info"><span className="comp-name" style={{ fontSize:12 }}>{c.e}</span></div>
                      <div className="comp-track"><div style={{ width:`${pct}%`, background:cc }}/></div>
                      <div className="comp-num">{pct}%</div>
                    </div>
                  )
                })}
              </div>

              <div className="aso-block-head">PCMSO · próximas renovações</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[...rows].sort((a,b) => (a.pcmso < b.pcmso ? -1 : 1)).slice(0,5).map((e, i) => (
                  <button key={i} onClick={() => setSel(e.empresa)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'8px 10px', borderRadius:9, background:'var(--surface-2)', border:'1px solid var(--border)', cursor:'pointer', textAlign:'left' }}>
                    <div style={{ minWidth:0 }}>
                      <div className="aso-name" style={{ fontSize:12 }}>{e.empresa}</div>
                      <div className="aso-role" style={{ fontSize:10.5 }}>vence {brDate(e.pcmso)}</div>
                    </div>
                    <span className={`chip ${e.pcmsoSt.key}`} style={{ fontSize:10 }}>{e.pcmsoSt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
