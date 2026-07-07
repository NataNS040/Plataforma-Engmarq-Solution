import { useState, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Search, Download, Plus, X, CheckCircle, AlertTriangle, Clock,
  Briefcase, MapPin, Calendar, Edit, ChevronRight, Loader2,
} from "lucide-react"
import { useCurrentProfile } from "@/hooks/useCurrentProfile"
import { useColaboradores, useCriarColaborador } from "@/hooks/queries/useColaboradores"
import { useSetores, useFuncoes, useAmbientes } from "@/hooks/queries/useCatalogos"
import type { ColaboradorComCatalogos } from "@/services/colaboradoresService"

/* ============================================================
   Types
   ============================================================ */

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
  colab: ColaboradorComCatalogos
  onClose: () => void
}

function ProfileModal({ colab: c, onClose }: ProfileModalProps) {
  const [editing, setEditing] = useState(false)
  const [nrs, setNrs] = useState<NrEntry[]>(INITIAL_NRS)
  const [draft, setDraft] = useState<NrEntry[]>(INITIAL_NRS)

  const initials = c.nome.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
  const cor = (() => {
    const COLORS = ['#3B82F6','#F59E0B','#10B981','#8B5CF6','#EF4444','#06B6D4','#1F2A44','#F472B6','#22C55E','#A855F7']
    let h = 0; for (let i = 0; i < c.nome.length; i++) h = c.nome.charCodeAt(i) + ((h << 5) - h)
    return COLORS[Math.abs(h) % COLORS.length]
  })()

  const startEdit  = () => { setDraft(nrs.map(x => ({ ...x }))); setEditing(true) }
  const cancelEdit = () => setEditing(false)
  const saveEdit   = () => { setNrs(draft.map(x => ({ ...x }))); setEditing(false) }

  const toggleAplica = (i: number) =>
    setDraft(d => d.map((x, j) => j === i ? { ...x, aplica: !x.aplica } : x))
  const pickStatus = (i: number, status: NrStatus) =>
    setDraft(d => d.map((x, j) => j === i ? { ...x, status } : x))

  const visiveis = nrs.filter(n => n.aplica)

  const documentos = [
    { l: "ASO ocupacional",    status: "crit" as const, v: "Vence em 6 dias"  },
    { l: "Ficha de EPI",       status: "ok"   as const, v: "Atualizada"       },
    { l: "Exame audiométrico", status: "ok"   as const, v: "01/2026"          },
    { l: "PCMSO individual",   status: "warn" as const, v: "Revisar em 28d"   },
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
            <div className="avb" style={{ background: cor }}>{initials}</div>
            <div>
              <h3>{c.nome}</h3>
              <div className="meta">
                <span><Briefcase size={12} /> {c.funcao?.nome ?? '—'}</span>
                <span><MapPin size={12} /> {c.setor?.nome ?? '—'}</span>
                <span><Calendar size={12} /> Admissão {c.data_admissao ? new Date(c.data_admissao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span>
              </div>
            </div>
            <div className="right-stat">
              <div className="v">—</div>
              <div className="l">Score SST · em breve</div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Treinamentos</div>
              <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 20 }}>
                — <span style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 500 }}>/ obrig.</span>
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Documentos</div>
              <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 20 }}>
                — <span style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 500 }}>arquivos</span>
              </div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>CPF</div>
              <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 14 }}>{c.cpf}</div>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Matrícula</div>
              <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 14 }}>{c.matricula ?? '—'}</div>
            </div>
          </div>

          {/* Dados + Saúde ocupacional */}
          <div className="prof-grid" style={{ marginTop: 16 }}>
            <div className="prof-section">
              <h4>Dados pessoais</h4>
              <div className="field-grid">
                <div><div className="f-lbl">CPF</div><div className="f-val">{c.cpf}</div></div>
                <div><div className="f-lbl">Matrícula</div><div className="f-val">{c.matricula ?? '—'}</div></div>
                <div><div className="f-lbl">Admissão</div><div className="f-val">{c.data_admissao ? new Date(c.data_admissao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</div></div>
                <div><div className="f-lbl">Setor</div><div className="f-val">{c.setor?.nome ?? '—'}</div></div>
                <div><div className="f-lbl">Função</div><div className="f-val">{c.funcao?.nome ?? '—'}</div></div>
                <div><div className="f-lbl">Ambiente</div><div className="f-val">{c.ambiente?.nome ?? '—'}</div></div>
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
   AddColabModal — schema
   ============================================================ */
const addColabSchema = z.object({
  nome:          z.string().min(2, 'Informe o nome completo'),
  cpf:           z.string().min(11, 'CPF inválido').max(14, 'CPF inválido'),
  matricula:     z.string(),
  funcao_id:     z.string().min(1, 'Selecione o cargo/função'),
  setor_id:      z.string().min(1, 'Selecione o setor'),
  ambiente_id:   z.string(),
  data_admissao: z.string().min(1, 'Informe a data de admissão'),
})
type AddColabForm = z.infer<typeof addColabSchema>

function AddColabModal({ onClose, empresaId }: { onClose: () => void; empresaId: string }) {
  const [tab, setTab] = useState<"individual" | "massa">("individual")

  const criar     = useCriarColaborador()
  const setores   = useSetores(empresaId)
  const funcoes   = useFuncoes(empresaId)
  const ambientes = useAmbientes(empresaId)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddColabForm>({
    resolver: zodResolver(addColabSchema),
    defaultValues: {
      nome: '', cpf: '', matricula: '',
      funcao_id: '', setor_id: '', ambiente_id: '',
      data_admissao: '',
    },
  })

  async function onSubmit(values: AddColabForm) {
    try {
      await criar.mutateAsync({
        empresa_id:    empresaId,
        nome:          values.nome,
        cpf:           values.cpf,
        matricula:     values.matricula || null,
        funcao_id:     values.funcao_id,
        setor_id:      values.setor_id,
        ambiente_id:   values.ambiente_id || null,
        data_admissao: values.data_admissao,
      })
      onClose()
    } catch { /* toast já disparado */ }
  }

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
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="mp-field" style={{ gridColumn: "1 / -1" }}>
                  <label>Nome completo</label>
                  <input className="mp-input" placeholder="Ex.: Tiago Ferreira da Silva" {...register('nome')} />
                  {errors.nome && <FieldErrorSmall msg={errors.nome.message!} />}
                </div>
                <div className="mp-field">
                  <label>CPF</label>
                  <input className="mp-input" placeholder="000.000.000-00" {...register('cpf')} />
                  {errors.cpf && <FieldErrorSmall msg={errors.cpf.message!} />}
                </div>
                <div className="mp-field">
                  <label>Matrícula</label>
                  <input className="mp-input" placeholder="14xxxx (opcional)" {...register('matricula')} />
                </div>
                <div className="mp-field">
                  <label>Cargo / Função</label>
                  <select className="mp-input" {...register('funcao_id')} disabled={funcoes.isLoading}>
                    <option value="">Selecione…</option>
                    {(funcoes.data ?? []).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                  {errors.funcao_id && <FieldErrorSmall msg={errors.funcao_id.message!} />}
                  {funcoes.data?.length === 0 && (
                    <div style={{ fontSize:11, color:'var(--ink-500)', marginTop:3 }}>
                      Cadastre funções em Configurações → Catálogos.
                    </div>
                  )}
                </div>
                <div className="mp-field">
                  <label>Setor</label>
                  <select className="mp-input" {...register('setor_id')} disabled={setores.isLoading}>
                    <option value="">Selecione…</option>
                    {(setores.data ?? []).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                  {errors.setor_id && <FieldErrorSmall msg={errors.setor_id.message!} />}
                </div>
                <div className="mp-field">
                  <label>Ambiente (opcional)</label>
                  <select className="mp-input" {...register('ambiente_id')} disabled={ambientes.isLoading}>
                    <option value="">— nenhum —</option>
                    {(ambientes.data ?? []).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
                <div className="mp-field">
                  <label>Data de admissão</label>
                  <input className="mp-input" type="date" {...register('data_admissao')} />
                  {errors.data_admissao && <FieldErrorSmall msg={errors.data_admissao.message!} />}
                </div>
              </div>

              <div style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: 12, borderRadius: 10, marginTop: 14,
                background: "var(--orange-50)", border: "1px solid rgba(245,158,11,0.25)",
              }}>
                <AlertTriangle size={16} style={{ color: "var(--orange-600)", marginTop: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.45 }}>
                  As NRs aplicáveis são definidas após o cadastro, em <strong>Editar colaborador → Treinamentos NR</strong>, conforme o cargo e os riscos da função.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <button type="button" className="tbtn" onClick={onClose}>Cancelar</button>
                <button type="submit" className="tbtn primary" disabled={criar.isPending}>
                  {criar.isPending ? <Loader2 size={13} className="btn-spinner" /> : <CheckCircle size={13} />}
                  {criar.isPending ? 'Salvando...' : 'Cadastrar colaborador'}
                </button>
              </div>
            </form>
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
        </div>
      </div>
    </div>
  )
}

function FieldErrorSmall({ msg }: { msg: string }) {
  return (
    <span role="alert" style={{ color:'var(--red-600, #dc2626)', fontSize:11.5, marginTop:4, display:'block' }}>
      {msg}
    </span>
  )
}

/* ============================================================
   ColaboradoresPage
   ============================================================ */

export default function ColaboradoresPage() {
  const { empresaId } = useCurrentProfile()

  const colabsQuery = useColaboradores(empresaId)
  const colabs = colabsQuery.data ?? []

  // Derivar setores únicos dos dados reais
  const setoresDisponiveis = useMemo(() => {
    const nomes = new Set(colabs.map(c => c.setor?.nome).filter(Boolean) as string[])
    return ['Todos', ...Array.from(nomes).sort()]
  }, [colabs])

  const [setor, setSetor]           = useState("Todos")
  const [statusFilter, setStatus]   = useState<string>("all")
  const [view, setView]             = useState<"table" | "grid">("table")
  const [query, setQuery]           = useState("")
  const [adding, setAdding]         = useState(false)
  const [openProfile, setOpenProfile] = useState<ColaboradorComCatalogos | null>(null)

  // Derivação de status baseada em treinamentos/documentos (Fase 4.3)
  // Por ora: todos ficam 'ok' até a Fase 4.3 cruzar com treinamentos
  function getStatus(_c: ColaboradorComCatalogos): "ok" | "warn" | "crit" {
    return 'ok'
  }

  function getInitials(nome: string) {
    return nome.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  }

  const AVATAR_COLORS = [
    '#3B82F6','#F59E0B','#10B981','#8B5CF6','#EF4444',
    '#06B6D4','#1F2A44','#F472B6','#22C55E','#A855F7',
  ]
  function avatarColor(nome: string) {
    let h = 0
    for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
  }

  function fmtDate(iso: string | null | undefined) {
    if (!iso) return '—'
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('pt-BR')
  }

  const filtered = useMemo(() => colabs.filter(c => {
    if (setor !== "Todos" && c.setor?.nome !== setor) return false
    const st = getStatus(c)
    if (statusFilter !== "all" && st !== statusFilter) return false
    if (query && !c.nome.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [colabs, setor, statusFilter, query])

  const okCount   = colabs.filter(c => getStatus(c) === 'ok').length
  const warnCount = colabs.filter(c => getStatus(c) === 'warn').length
  const critCount = colabs.filter(c => getStatus(c) === 'crit').length

  const STATUS_FILTERS = [
    { id: "all",  label: "Todos",    count: colabs.length, color: undefined },
    { id: "ok",   label: "Em dia",   count: okCount,       color: "var(--green-500)"  },
    { id: "warn", label: "Vencendo", count: warnCount,     color: "var(--orange-500)" },
    { id: "crit", label: "Vencido",  count: critCount,     color: "var(--red-500)"    },
  ] as const

  return (
    <div className="content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Colaboradores</h1>
          <p className="sub">{colabs.length} ativos</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14} /> Exportar CSV</button>
          <button className="tbtn primary" onClick={() => setAdding(true)} disabled={!empresaId}>
            <Plus size={14} /> Adicionar colaborador
          </button>
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
          {setoresDisponiveis.map(s => (
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
      {colabsQuery.isLoading ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13 }}>
          <Loader2 size={20} className="btn-spinner" style={{ display:'inline-block', marginRight:8 }} />
          Carregando colaboradores…
        </div>
      ) : colabsQuery.isError ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--red-500)', fontSize:13 }}>
          <AlertTriangle size={20} style={{ display:'inline-block', marginRight:8 }} />
          Erro ao carregar colaboradores.
          <button className="tbtn ghost" style={{ marginLeft:8 }} onClick={() => colabsQuery.refetch()}>Tentar novamente</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--ink-400)', fontSize:13 }}>
          {colabs.length === 0
            ? 'Nenhum colaborador cadastrado ainda.'
            : 'Nenhum colaborador encontrado com esses filtros.'}
        </div>
      ) : view === "table" ? (
        <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Setor · Cargo</th>
                <th>Admissão</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const st = getStatus(c)
                return (
                <tr key={c.id} onClick={() => setOpenProfile(c)} style={{ cursor: "pointer" }}>
                  <td>
                    <div className="cell-person">
                      <div className="ava" style={{ background: avatarColor(c.nome) }}>{getInitials(c.nome)}</div>
                      <div>
                        <div className="name">{c.nome}</div>
                        <div className="role">{c.cpf}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{c.setor?.nome ?? '—'}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>{c.funcao?.nome ?? '—'}</div>
                  </td>
                  <td style={{ color: "var(--ink-700)" }}>{fmtDate(c.data_admissao)}</td>
                  <td>
                    <span className={`chip ${st}`}>
                      {st === "ok" ? <CheckCircle size={11} /> : st === "warn" ? <Clock size={11} /> : <AlertTriangle size={11} />}
                      {st === "ok" ? "Em dia" : st === "warn" ? "Vencendo" : "Vencido"}
                    </span>
                  </td>
                  <td><button className="tbtn ghost"><ChevronRight size={14} /></button></td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filtered.map(c => {
            const st = getStatus(c)
            return (
            <button key={c.id} className="glass" onClick={() => setOpenProfile(c)} style={{ textAlign: "left", padding: 16, cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                <div className="ava" style={{ background: avatarColor(c.nome), width: 44, height: 44, fontSize: 14 }}>{getInitials(c.nome)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.nome}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{c.funcao?.nome ?? '—'}</div>
                </div>
                <span className={`chip ${st}`} style={{ fontSize: 10.5 }}>
                  {st === "ok" ? "OK" : st === "warn" ? "30d" : "!"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11.5, color: "var(--ink-500)" }}>
                <div>Setor<br /><span style={{ color: "var(--ink-900)", fontWeight: 500 }}>{c.setor?.nome ?? '—'}</span></div>
                <div>Admissão<br /><span style={{ color: "var(--ink-900)", fontWeight: 500 }}>{fmtDate(c.data_admissao)}</span></div>
              </div>
            </button>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--ink-500)", fontSize: 12.5 }}>
        <span>Mostrando {filtered.length} de {colabs.length} colaboradores</span>
      </div>

      {/* Modais */}
      {adding && empresaId && <AddColabModal onClose={() => setAdding(false)} empresaId={empresaId} />}
      {openProfile && <ProfileModal colab={openProfile} onClose={() => setOpenProfile(null)} />}

    </div>
  )
}
