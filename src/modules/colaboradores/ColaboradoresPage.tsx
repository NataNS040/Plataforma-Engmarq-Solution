import { useState, useMemo } from "react"
import {
  Search, Download, Plus, X, CheckCircle, AlertTriangle, Clock,
  Briefcase, MapPin, Calendar, Edit, ChevronRight,
} from "lucide-react"

/* ============================================================
   Types
   ============================================================ */

type ColabStatus = "ok" | "warn" | "crit"
type RiscoNivel  = "Baixo" | "Médio" | "Alto"

interface Colab {
  nome: string
  cargo: string
  setor: string
  admissao: string
  aso: string
  status: ColabStatus
  score: number
  treinamentos: number
  doc: number
  foto: string
  cor: string
  risco: RiscoNivel
}

/* ============================================================
   Mock data
   ============================================================ */

const COLABS: Colab[] = [
  { nome: "Marina S. Oliveira",    cargo: "Coord. RH",           setor: "Administrativo", admissao: "12/03/2021", aso: "12/08/2026", status: "ok",   score: 100, treinamentos: 4, doc: 8,  foto: "MO", cor: "#3B82F6", risco: "Baixo" },
  { nome: "Carlos M. Soares",      cargo: "Op. Empilhadeira",    setor: "Logística",      admissao: "08/01/2019", aso: "26/02/2026", status: "crit", score: 62,  treinamentos: 6, doc: 7,  foto: "CS", cor: "#F59E0B", risco: "Alto"  },
  { nome: "João Pedro Alves",      cargo: "Eletricista",         setor: "Manutenção",     admissao: "22/06/2020", aso: "14/03/2026", status: "warn", score: 78,  treinamentos: 5, doc: 6,  foto: "JA", cor: "#10B981", risco: "Médio" },
  { nome: "Letícia Ramos Cardoso", cargo: "Téc. Segurança",      setor: "SST",            admissao: "03/09/2022", aso: "01/11/2026", status: "ok",   score: 98,  treinamentos: 9, doc: 11, foto: "LC", cor: "#8B5CF6", risco: "Baixo" },
  { nome: "Roberto N. Lima",       cargo: "Op. Produção",        setor: "Produção",       admissao: "17/05/2018", aso: "04/03/2026", status: "warn", score: 81,  treinamentos: 4, doc: 5,  foto: "RL", cor: "#EF4444", risco: "Médio" },
  { nome: "Ana Carla Mendes",      cargo: "Analista Fiscal",     setor: "Administrativo", admissao: "11/02/2023", aso: "11/02/2027", status: "ok",   score: 95,  treinamentos: 3, doc: 7,  foto: "AM", cor: "#06B6D4", risco: "Baixo" },
  { nome: "Diego Vasconcelos",     cargo: "Op. Caldeira",        setor: "Manutenção",     admissao: "29/07/2017", aso: "01/03/2026", status: "crit", score: 58,  treinamentos: 4, doc: 5,  foto: "DV", cor: "#1F2A44", risco: "Alto"  },
  { nome: "Fernanda Lopes Pinto",  cargo: "Supervisora",         setor: "Produção",       admissao: "04/10/2020", aso: "20/09/2026", status: "ok",   score: 93,  treinamentos: 5, doc: 8,  foto: "FP", cor: "#F472B6", risco: "Baixo" },
  { nome: "Bruno H. Costa",        cargo: "Op. Soldador",        setor: "Produção",       admissao: "16/04/2021", aso: "10/04/2026", status: "warn", score: 77,  treinamentos: 5, doc: 6,  foto: "BC", cor: "#22C55E", risco: "Médio" },
  { nome: "Patrícia Almeida",      cargo: "Enfermeira do Trab.", setor: "SST",            admissao: "21/01/2019", aso: "21/01/2027", status: "ok",   score: 99,  treinamentos: 8, doc: 10, foto: "PA", cor: "#A855F7", risco: "Baixo" },
]

const SETORES = ["Todos", "Administrativo", "Produção", "Logística", "Manutenção", "SST"]

const STATUS_FILTERS = [
  { id: "all",  label: "Todos",    count: 247, color: undefined },
  { id: "ok",   label: "Em dia",   count: 178, color: "var(--green-500)"  },
  { id: "warn", label: "Vencendo", count: 57,  color: "var(--orange-500)" },
  { id: "crit", label: "Vencido",  count: 12,  color: "var(--red-500)"    },
] as const

const CARGOS = [
  "Op. Produção", "Op. Empilhadeira", "Op. Soldador", "Op. Caldeira",
  "Eletricista", "Téc. Segurança", "Enfermeira do Trab.", "Supervisora",
  "Coord. RH", "Analista Fiscal",
]

/* ============================================================
   NR data para o modal de perfil
   ============================================================ */

type NrStatus = "ok" | "warn" | "crit"

interface NrEntry {
  nr: string
  desc: string
  carga: string
  aplica: boolean
  status: NrStatus
  venc: string
}

const INITIAL_NRS: NrEntry[] = [
  { nr: "NR-35", desc: "Trabalho em altura",            carga: "8h",  aplica: true,  status: "warn", venc: "12/03/2026" },
  { nr: "NR-11", desc: "Operação de empilhadeira",      carga: "16h", aplica: true,  status: "ok",   venc: "22/07/2027" },
  { nr: "NR-12", desc: "Segurança em máquinas",          carga: "8h",  aplica: true,  status: "ok",   venc: "08/09/2026" },
  { nr: "NR-06", desc: "Equip. de proteção individual",  carga: "4h",  aplica: true,  status: "ok",   venc: "01/12/2026" },
  { nr: "NR-33", desc: "Espaço confinado",               carga: "16h", aplica: true,  status: "crit", venc: "Vencido há 18 dias" },
  { nr: "NR-10", desc: "Segurança em inst. elétricas",   carga: "40h", aplica: false, status: "ok",   venc: "—" },
  { nr: "NR-05", desc: "CIPA · Comissão interna",        carga: "20h", aplica: false, status: "ok",   venc: "—" },
  { nr: "NR-20", desc: "Inflamáveis e combustíveis",     carga: "16h", aplica: false, status: "ok",   venc: "—" },
]

const STATUS_LABEL: Record<NrStatus, string> = { ok: "Em dia", warn: "Vencendo", crit: "Vencido" }

/* ============================================================
   ProfileModal
   ============================================================ */

interface ProfileModalProps {
  colab: Colab
  onClose: () => void
}

function ProfileModal({ colab: c, onClose }: ProfileModalProps) {
  const [editing, setEditing] = useState(false)
  const [nrs, setNrs] = useState<NrEntry[]>(INITIAL_NRS)
  const [draft, setDraft] = useState<NrEntry[]>(INITIAL_NRS)

  const startEdit  = () => { setDraft(nrs.map(x => ({ ...x }))); setEditing(true) }
  const cancelEdit = () => setEditing(false)
  const saveEdit   = () => { setNrs(draft.map(x => ({ ...x }))); setEditing(false) }

  const toggleAplica = (i: number) =>
    setDraft(d => d.map((x, j) => j === i ? { ...x, aplica: !x.aplica } : x))
  const pickStatus = (i: number, status: NrStatus) =>
    setDraft(d => d.map((x, j) => j === i ? { ...x, status } : x))

  const visiveis = nrs.filter(n => n.aplica)

  const documentos = [
    { l: "ASO ocupacional",    status: "crit", v: "Vence em 6 dias"  },
    { l: "Ficha de EPI",       status: "ok",   v: "Atualizada"       },
    { l: "Exame audiométrico", status: "ok",   v: "01/2026"          },
    { l: "PCMSO individual",   status: "warn", v: "Revisar em 28d"   },
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editing ? "Editar colaborador · Treinamentos NR" : "Perfil do colaborador"}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {!editing && <button className="tbtn"><Download size={13} /> Exportar PDF</button>}
            {!editing
              ? <button className="tbtn primary" onClick={startEdit}><Edit size={13} /> Editar colaborador</button>
              : <>
                  <button className="tbtn" onClick={cancelEdit}>Cancelar</button>
                  <button className="tbtn primary" onClick={saveEdit}><CheckCircle size={13} /> Salvar</button>
                </>}
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="modal-body">
          {/* Hero */}
          <div className="prof-hero">
            <div className="avb" style={{ background: c.cor }}>{c.foto}</div>
            <div>
              <h3>{c.nome}</h3>
              <div className="meta">
                <span><Briefcase size={12} /> {c.cargo}</span>
                <span><MapPin size={12} /> {c.setor}</span>
                <span><Calendar size={12} /> Admissão {c.admissao}</span>
              </div>
            </div>
            <div className="right-stat">
              <div className="v">{c.score}</div>
              <div className="l">Score SST · risco {c.risco.toLowerCase()}</div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Treinamentos</div>
              <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 20 }}>
                {c.treinamentos} <span style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 500 }}>/ obrig.</span>
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Documentos</div>
              <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 20 }}>
                {c.doc} <span style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 500 }}>arquivos</span>
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Próximo ASO</div>
              <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 16, color: c.status === "crit" ? "var(--red-500)" : c.status === "warn" ? "var(--orange-600)" : "var(--ink-900)" }}>
                {c.aso}
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Status geral</div>
              <span className={`chip ${c.status}`} style={{ marginTop: 4 }}>
                {c.status === "ok" ? <CheckCircle size={11} /> : c.status === "warn" ? <Clock size={11} /> : <AlertTriangle size={11} />}
                {c.status === "ok" ? "Em dia" : c.status === "warn" ? "Vencendo" : "Pendência"}
              </span>
            </div>
          </div>

          {/* Dados + Saúde ocupacional */}
          <div className="prof-grid" style={{ marginTop: 16 }}>
            <div className="prof-section">
              <h4>Dados pessoais</h4>
              <div className="field-grid">
                <div><div className="f-lbl">CPF</div><div className="f-val">128.{450 + c.score}.{770 + c.treinamentos * 3}-0{c.doc}</div></div>
                <div><div className="f-lbl">Matrícula</div><div className="f-val">14{2100 + c.score}</div></div>
                <div><div className="f-lbl">Nascimento</div><div className="f-val">{c.admissao.replace(/\d{4}/, `198${c.score % 10}`)}</div></div>
                <div><div className="f-lbl">Setor</div><div className="f-val">{c.setor}</div></div>
                <div><div className="f-lbl">CIPA</div><div className="f-val">{c.setor === "SST" ? "Membro · 2025" : "—"}</div></div>
                <div><div className="f-lbl">Nível de risco</div><div className="f-val">{c.risco}</div></div>
              </div>
            </div>

            <div className="prof-section">
              <h4>Saúde ocupacional · PCMSO</h4>
              <div className="prof-list">
                {documentos.map((d, i) => (
                  <div key={i} className="prof-row">
                    <span className="lbl">{d.l}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="val" style={{ color: d.status === "crit" ? "var(--red-500)" : d.status === "warn" ? "var(--orange-600)" : "var(--ink-900)" }}>
                        {d.v}
                      </span>
                      <span className={`chip ${d.status}`} style={{ fontSize: 10.5 }}>
                        {d.status === "ok" ? "OK" : d.status === "warn" ? "Aten." : "!"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Treinamentos NR */}
          <div className="prof-section" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>
                Treinamentos NR
                {editing && <span style={{ fontWeight: 500, color: "var(--ink-500)", fontSize: 12, textTransform: "none", letterSpacing: 0 }}> · marque quais NRs se aplicam</span>}
              </h4>
              {!editing && <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{visiveis.length} NRs aplicáveis ao cargo</span>}
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    {editing && <th style={{ width: 90 }}>Aplica?</th>}
                    <th>NR</th>
                    <th>Descrição</th>
                    <th>Carga</th>
                    <th>{editing ? "Status" : "Validade"}</th>
                    {!editing && <th>Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {(editing ? draft : visiveis).map((t, i) => (
                    <tr key={i} style={editing && !t.aplica ? { opacity: 0.45 } : {}}>
                      {editing && (
                        <td>
                          <button
                            className={`nr-toggle ${t.aplica ? "on" : ""}`}
                            onClick={() => toggleAplica(i)}
                            role="switch"
                            aria-checked={t.aplica}
                          >
                            <span className="knob" />
                          </button>
                        </td>
                      )}
                      <td><strong style={{ fontFamily: "Plus Jakarta Sans" }}>{t.nr}</strong></td>
                      <td>{t.desc}</td>
                      <td style={{ color: "var(--ink-500)" }}>{t.carga}</td>
                      <td>
                        {editing && t.aplica ? (
                          <div className="seg" style={{ gap: 2 }}>
                            {(["ok","warn","crit"] as NrStatus[]).map(s => (
                              <button key={s} className={t.status === s ? "on" : ""} onClick={() => pickStatus(i, s)} style={{ padding: "3px 8px", fontSize: 11 }}>
                                {STATUS_LABEL[s]}
                              </button>
                            ))}
                          </div>
                        ) : editing && !t.aplica ? (
                          <span style={{ fontSize: 12, color: "var(--ink-500)" }}>Não obrigatório</span>
                        ) : (
                          <span style={{ color: t.status === "crit" ? "var(--red-500)" : t.status === "warn" ? "var(--orange-600)" : "var(--ink-700)", fontWeight: t.status !== "ok" ? 600 : 400 }}>
                            {t.venc}
                          </span>
                        )}
                      </td>
                      {!editing && (
                        <td><span className={`chip ${t.status}`}>{STATUS_LABEL[t.status]}</span></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   AddColabModal
   ============================================================ */

function AddColabModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"individual" | "massa">("individual")

  const csvPreview = [
    { nome: "Tiago Ferreira",  cpf: "401.220.118-03", cargo: "Op. Produção",   setor: "Produção",       ok: true  },
    { nome: "Juliana Prado",   cpf: "318.905.226-71", cargo: "Analista Fiscal", setor: "Administrativo", ok: true  },
    { nome: "Marcos Vinícius", cpf: "—",              cargo: "Op. Soldador",   setor: "Produção",       ok: false },
    { nome: "Renata Camargo",  cpf: "229.774.330-58", cargo: "Téc. Segurança", setor: "SST",            ok: true  },
  ]
  const validRows = csvPreview.filter(r => r.ok).length

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Adicionar colaborador</h2>
            <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 2 }}>Logix Industrial · cadastro de pessoas</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 24px 0" }}>
          <div className="seg" style={{ width: "100%" }}>
            <button className={tab === "individual" ? "on" : ""} style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setTab("individual")}>
              Individual
            </button>
            <button className={tab === "massa" ? "on" : ""} style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 6 }} onClick={() => setTab("massa")}>
              Em massa
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ paddingTop: 18, gap: 14 }}>
          {tab === "individual" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="mp-field" style={{ gridColumn: "1 / -1" }}>
                  <label>Nome completo</label>
                  <input className="mp-input" placeholder="Ex.: Tiago Ferreira da Silva" />
                </div>
                <div className="mp-field">
                  <label>CPF</label>
                  <input className="mp-input" placeholder="000.000.000-00" />
                </div>
                <div className="mp-field">
                  <label>Matrícula</label>
                  <input className="mp-input" placeholder="14xxxx" />
                </div>
                <div className="mp-field">
                  <label>Cargo</label>
                  <select className="mp-input">
                    <option value="">Selecione…</option>
                    {CARGOS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mp-field">
                  <label>Setor</label>
                  <select className="mp-input">
                    <option value="">Selecione…</option>
                    {SETORES.filter(s => s !== "Todos").map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="mp-field">
                  <label>Data de admissão</label>
                  <input className="mp-input" type="date" />
                </div>
                <div className="mp-field">
                  <label>Data de nascimento</label>
                  <input className="mp-input" type="date" />
                </div>
                <div className="mp-field" style={{ gridColumn: "1 / -1" }}>
                  <label>E-mail</label>
                  <input className="mp-input" type="email" placeholder="nome@logix.com.br" />
                </div>
              </div>

              <div style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: 12, borderRadius: 10,
                background: "var(--orange-50)", border: "1px solid rgba(245,158,11,0.25)",
              }}>
                <AlertTriangle size={16} style={{ color: "var(--orange-600)", marginTop: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.45 }}>
                  As NRs aplicáveis são definidas após o cadastro, em <strong>Editar colaborador → Treinamentos NR</strong>, conforme o cargo e os riscos da função.
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 12.5, color: "var(--ink-500)", maxWidth: 320 }}>
                  Importe vários colaboradores via planilha. Baixe o modelo, preencha e envie.
                </div>
                <button className="tbtn"><Download size={13} /> Baixar modelo CSV</button>
              </div>

              <div style={{
                border: "2px dashed var(--border-strong)", borderRadius: 14,
                padding: "32px 20px", textAlign: "center", background: "var(--bg)",
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", placeItems: "center", margin: "0 auto 12px", color: "var(--orange-600)" }}>
                  <Download size={20} />
                </div>
                <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Arraste a planilha aqui</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 14 }}>CSV ou XLSX · até 500 colaboradores por importação</div>
                <button className="tbtn primary" style={{ margin: "0 auto" }}><Plus size={13} /> Selecionar arquivo</button>
              </div>

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>Pré-visualização · colaboradores.csv</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                    <strong style={{ color: "var(--green-600)" }}>{validRows} válidos</strong> · {csvPreview.length - validRows} com erro
                  </span>
                </div>
                <table className="tbl">
                  <thead><tr><th>Nome</th><th>CPF</th><th>Cargo · Setor</th><th>Status</th></tr></thead>
                  <tbody>
                    {csvPreview.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{r.nome}</td>
                        <td style={{ color: r.ok ? "var(--ink-700)" : "var(--red-500)", fontWeight: r.ok ? 400 : 600 }}>{r.cpf}</td>
                        <td style={{ fontSize: 12 }}>{r.cargo}<span style={{ color: "var(--ink-500)" }}> · {r.setor}</span></td>
                        <td>
                          <span className={`chip ${r.ok ? "ok" : "crit"}`}>
                            {r.ok ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                            {r.ok ? "Pronto" : "CPF ausente"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button className="tbtn" onClick={onClose}>Cancelar</button>
            <button className="tbtn primary" onClick={onClose}>
              <CheckCircle size={13} />
              {tab === "individual" ? "Cadastrar colaborador" : `Importar ${validRows} colaboradores`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   ColaboradoresPage
   ============================================================ */

export default function ColaboradoresPage() {
  const [setor, setSetor]           = useState("Todos")
  const [statusFilter, setStatus]   = useState<string>("all")
  const [view, setView]             = useState<"table" | "grid">("table")
  const [query, setQuery]           = useState("")
  const [adding, setAdding]         = useState(false)
  const [openProfile, setOpenProfile] = useState<Colab | null>(null)

  const filtered = useMemo(() => COLABS.filter(c => {
    if (setor !== "Todos" && c.setor !== setor) return false
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    if (query && !c.nome.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [setor, statusFilter, query])

  return (
    <div className="content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Colaboradores</h1>
          <p className="sub">247 ativos · 3 admissões neste mês · 1 afastamento</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14} /> Exportar CSV</button>
          <button className="tbtn primary" onClick={() => setAdding(true)}><Plus size={14} /> Adicionar colaborador</button>
        </div>
      </div>

      {/* Status chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {STATUS_FILTERS.map(s => (
          <button
            key={s.id}
            onClick={() => setStatus(s.id)}
            className="glass"
            style={{
              textAlign: "left", padding: 16, cursor: "pointer",
              borderColor: statusFilter === s.id ? "var(--navy-700)" : "var(--border)",
              boxShadow: statusFilter === s.id ? "0 0 0 2px var(--navy-700), var(--glass-shadow)" : "var(--glass-shadow)",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-500)", fontWeight: 500 }}>{s.label}</span>
              {s.color && <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />}
            </div>
            <div style={{ fontFamily: "Plus Jakarta Sans", fontSize: 26, fontWeight: 700, color: "var(--ink-900)", letterSpacing: "-0.02em" }}>
              {s.count}
            </div>
          </button>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="glass" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 240px", padding: "0 12px", height: 36, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
          <Search size={14} style={{ color: "var(--ink-400)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nome, CPF, matrícula…"
            style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: 13, fontFamily: "var(--font-body)" }}
          />
        </div>

        <div className="seg">
          {SETORES.map(s => (
            <button key={s} className={setor === s ? "on" : ""} onClick={() => setSetor(s)}>{s}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div className="seg">
          <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Tabela</button>
          <button className={view === "grid"  ? "on" : ""} onClick={() => setView("grid")}>Cards</button>
        </div>
      </div>

      {/* Lista / Grid */}
      {view === "table" ? (
        <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Setor · Cargo</th>
                <th>Admissão</th>
                <th>Próximo ASO</th>
                <th>Score SST</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={i} onClick={() => setOpenProfile(c)} style={{ cursor: "pointer" }}>
                  <td>
                    <div className="cell-person">
                      <div className="ava" style={{ background: c.cor }}>{c.foto}</div>
                      <div>
                        <div className="name">{c.nome}</div>
                        <div className="role">Matrícula 14{2100 + i * 7}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.setor}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>{c.cargo}</div>
                  </td>
                  <td style={{ color: "var(--ink-700)" }}>{c.admissao}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: c.status === "crit" ? "var(--red-500)" : c.status === "warn" ? "var(--orange-600)" : "var(--ink-900)" }}>
                      {c.aso}
                    </span>
                  </td>
                  <td>
                    <div className="bar-inline">
                      <div className="track">
                        <div className={`fill ${c.score < 70 ? "crit" : c.score < 85 ? "warn" : ""}`} style={{ width: `${c.score}%` }} />
                      </div>
                      <span className="num">{c.score}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${c.status}`}>
                      {c.status === "ok"   ? <CheckCircle size={11} /> : c.status === "warn" ? <Clock size={11} /> : <AlertTriangle size={11} />}
                      {c.status === "ok"   ? "Em dia" : c.status === "warn" ? "Vencendo" : "Vencido"}
                    </span>
                  </td>
                  <td><button className="tbtn ghost"><ChevronRight size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filtered.map((c, i) => (
            <button key={i} className="glass" onClick={() => setOpenProfile(c)} style={{ textAlign: "left", padding: 16, cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                <div className="ava" style={{ background: c.cor, width: 44, height: 44, fontSize: 14 }}>{c.foto}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.nome}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{c.cargo}</div>
                </div>
                <span className={`chip ${c.status}`} style={{ fontSize: 10.5 }}>
                  {c.status === "ok" ? "OK" : c.status === "warn" ? "30d" : "!"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11.5, color: "var(--ink-500)" }}>
                <div>Setor<br /><span style={{ color: "var(--ink-900)", fontWeight: 500 }}>{c.setor}</span></div>
                <div>ASO<br /><span style={{ color: "var(--ink-900)", fontWeight: 500 }}>{c.aso}</span></div>
              </div>
              <div className="bar-inline" style={{ marginTop: 12 }}>
                <div className="track">
                  <div className={`fill ${c.score < 70 ? "crit" : c.score < 85 ? "warn" : ""}`} style={{ width: `${c.score}%` }} />
                </div>
                <span className="num">{c.score}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Paginação */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--ink-500)", fontSize: 12.5 }}>
        <span>Mostrando 1–{filtered.length} de 247 colaboradores</span>
        <div className="toolbar">
          <button className="tbtn">Anterior</button>
          <button className="tbtn active">1</button>
          <button className="tbtn">2</button>
          <button className="tbtn">3</button>
          <span style={{ color: "var(--ink-400)" }}>…</span>
          <button className="tbtn">25</button>
          <button className="tbtn">Próximo</button>
        </div>
      </div>

      {/* Modais */}
      {adding && <AddColabModal onClose={() => setAdding(false)} />}
      {openProfile && <ProfileModal colab={openProfile} onClose={() => setOpenProfile(null)} />}

    </div>
  )
}
