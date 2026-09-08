import { useState, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Search, Download, Plus, X, CheckCircle, AlertTriangle, Clock,
  Briefcase, MapPin, Calendar, Edit, ChevronRight, Loader2, Trash2,
} from "lucide-react"
import { useAuth } from "@/modules/auth/AuthProvider"
import { useCurrentProfile } from "@/hooks/useCurrentProfile"
import { useColaboradores, useCriarColaborador, useAtualizarColaborador } from "@/hooks/queries/useColaboradores"
import { useSetores, useFuncoes, useAmbientes } from "@/hooks/queries/useCatalogos"
import { useEmpresas } from "@/hooks/queries/useEmpresas"
import { useDashboardKpis } from "@/hooks/queries/useDashboard"
import { useMatrizTreinamentos, useTreinamentosDoColaborador, useTreinamentoTipos, useDeletarTreinamento } from "@/hooks/queries/useTreinamentos"
import { useExamesDoColaborador } from "@/hooks/queries/useExames"
import { useDocumentosDoColaborador } from "@/hooks/queries/useDocumentos"
import { AddTreinamentoModal } from "@/modules/treinamentos/TreinamentosPage"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { criarColaborador } from "@/services/colaboradoresService"
import type { ColaboradorComCatalogos } from "@/services/colaboradoresService"
import { criarSetor, criarFuncao, criarAmbiente } from "@/services/catalogosService"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { qk } from "@/lib/queryKeys"
import { getAvatarColor, getChartColor, getInitials } from "@/lib/theme"
import { comingSoon } from "@/lib/comingSoon"
import { downloadCsvRows, exportToCsv } from "@/lib/csvExport"
import type { DocStatus, TreinamentoStatus } from "@/types/database"

/* ============================================================
   ProfileModal
   ============================================================ */

const DOC_CHIP: Record<DocStatus, { cls: string; label: string }> = {
  vigente:  { cls: "ok",   label: "Vigente"  },
  vencendo: { cls: "warn", label: "Vencendo" },
  vencido:  { cls: "crit", label: "Vencido"  },
}

const TREINO_CHIP: Record<TreinamentoStatus, { cls: string; label: string }> = {
  em_dia:   { cls: "ok",      label: "Em dia"   },
  vencendo: { cls: "warn",    label: "Vencendo" },
  vencido:  { cls: "crit",    label: "Vencido"  },
  pendente: { cls: "neutral", label: "Pendente" },
}

interface ProfileModalProps {
  colab: ColaboradorComCatalogos
  onClose: () => void
}

function ProfileModal({ colab: c, onClose }: ProfileModalProps) {
  const [editing, setEditing] = useState(false)
  const [addingTreino, setAddingTreino] = useState(false)

  const initials = getInitials(c.nome)
  const cor = getAvatarColor(c.nome)

  // Dados reais — Treinamentos NR (matriz da função × registros do
  // colaborador) e Saúde ocupacional (ASOs), no lugar do state local
  // fake que existia antes (nunca persistia nada).
  const matrizQuery   = useMatrizTreinamentos(c.empresa_id)
  const treinosQuery  = useTreinamentosDoColaborador(c.id)
  const examesQuery   = useExamesDoColaborador(c.id)
  const documentosQuery = useDocumentosDoColaborador(c.id)
  const tiposQuery    = useTreinamentoTipos()
  const setoresQuery   = useSetores(c.empresa_id)
  const funcoesQuery   = useFuncoes(c.empresa_id)
  const ambientesQuery = useAmbientes(c.empresa_id)

  const matriz  = matrizQuery.data ?? []
  const treinos = treinosQuery.data ?? []
  const exames  = examesQuery.data ?? []
  const tipos   = tiposQuery.data ?? []
  const fichasEpi = (documentosQuery.data ?? []).filter(d => d.tipo?.nome === 'Ficha de EPI')

  // NRs obrigatórias pra função deste colaborador, cruzadas com o
  // registro mais recente de cada uma — mais quaisquer treinamentos que o
  // colaborador já tenha registrado mas que não constem na matriz da função
  // (ex.: matriz incompleta, ou registro anterior a uma mudança de cargo);
  // sem isso, esses registros ficavam invisíveis no perfil (e, portanto,
  // impossíveis de excluir por lá).
  const nrRows = useMemo(() => {
    const daMatriz = matriz
      .filter(m => m.funcao_id === c.funcao?.id && m.treinamento_tipo)
      .map(m => {
        const ultimo = treinos
          .filter(t => t.treinamento_tipo_id === m.treinamento_tipo_id)
          .sort((a, b) => (a.data_realizacao < b.data_realizacao ? 1 : -1))[0] ?? null
        return { tipo: m.treinamento_tipo!, obrigatorio: m.obrigatorio, ultimo }
      })
    const cobertos = new Set(daMatriz.map(r => r.tipo.id))
    const extras = new Map<string, typeof treinos>()
    treinos.forEach(t => {
      if (cobertos.has(t.treinamento_tipo_id) || !t.treinamento_tipo) return
      const arr = extras.get(t.treinamento_tipo_id) ?? []
      arr.push(t)
      extras.set(t.treinamento_tipo_id, arr)
    })
    const registrosExtras = Array.from(extras.values()).map(regs => {
      const ultimo = regs.sort((a, b) => (a.data_realizacao < b.data_realizacao ? 1 : -1))[0]
      return { tipo: ultimo.treinamento_tipo!, obrigatorio: false, ultimo }
    })
    return [...daMatriz, ...registrosExtras]
  }, [matriz, treinos, c.funcao?.id])

  const obrigatorios = nrRows.filter(n => n.obrigatorio)
  const emDia = obrigatorios.filter(n => n.ultimo?.status === "em_dia").length

  const deletarTreino = useDeletarTreinamento()
  const [deletingTreino, setDeletingTreino] = useState<{ id: string; label: string } | null>(null)
  async function confirmDeleteTreino() {
    if (!deletingTreino) return
    await deletarTreino.mutateAsync({ id: deletingTreino.id, empresaId: c.empresa_id, colaboradorId: c.id })
    setDeletingTreino(null)
  }

  // Edição de dados pessoais (função/setor/ambiente/matrícula) — antes só
  // existia edição fake da lista de NRs, que nunca gravava nada.
  const atualizar = useAtualizarColaborador()
  const [fNome, setFNome]             = useState(c.nome)
  const [fMatricula, setFMatricula]   = useState(c.matricula ?? "")
  const [fFuncaoId, setFFuncaoId]     = useState(c.funcao?.id ?? "")
  const [fSetorId, setFSetorId]       = useState(c.setor?.id ?? "")
  const [fAmbienteId, setFAmbienteId] = useState(c.ambiente?.id ?? "")

  const startEdit = () => setEditing(true)
  const cancelEdit = () => {
    setFNome(c.nome)
    setFMatricula(c.matricula ?? "")
    setFFuncaoId(c.funcao?.id ?? "")
    setFSetorId(c.setor?.id ?? "")
    setFAmbienteId(c.ambiente?.id ?? "")
    setEditing(false)
  }
  async function saveEdit() {
    try {
      await atualizar.mutateAsync({
        id: c.id,
        empresaId: c.empresa_id,
        input: {
          nome: fNome,
          matricula: fMatricula || null,
          funcao_id: fFuncaoId,
          setor_id: fSetorId,
          ambiente_id: fAmbienteId || null,
        },
      })
      onClose()
    } catch { /* toast já disparado pelo hook */ }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <h2>{editing ? "Editar colaborador" : "Perfil do colaborador"}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {!editing && <button className="tbtn is-soon" title="Em breve" onClick={() => comingSoon('Exportar perfil em PDF')}><Download size={13} /> Exportar PDF</button>}
              {!editing
                ? <button className="tbtn primary" onClick={startEdit}><Edit size={13} /> Editar colaborador</button>
                : <>
                    <button className="tbtn" onClick={cancelEdit}>Cancelar</button>
                    <button className="tbtn primary" onClick={saveEdit} disabled={atualizar.isPending}>
                      {atualizar.isPending ? <Loader2 size={13} className="btn-spinner" /> : <CheckCircle size={13} />} Salvar
                    </button>
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
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>
                  {obrigatorios.length > 0 ? emDia : '—'} <span style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 500 }}>/ {obrigatorios.length} obrig.</span>
                </div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Documentos</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>
                  {exames.length + fichasEpi.length} <span style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 500 }}>arquivos</span>
                </div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>CPF</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{c.cpf}</div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginBottom: 4 }}>Matrícula</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{c.matricula ?? '—'}</div>
              </div>
            </div>

            {/* Dados + Saúde ocupacional */}
            <div className="prof-grid" style={{ marginTop: 16 }}>
              <div className="prof-section">
                <h4>Dados pessoais</h4>
                {!editing ? (
                  <div className="field-grid">
                    <div><div className="f-lbl">CPF</div><div className="f-val">{c.cpf}</div></div>
                    <div><div className="f-lbl">Matrícula</div><div className="f-val">{c.matricula ?? '—'}</div></div>
                    <div><div className="f-lbl">Admissão</div><div className="f-val">{c.data_admissao ? new Date(c.data_admissao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</div></div>
                    <div><div className="f-lbl">Setor</div><div className="f-val">{c.setor?.nome ?? '—'}</div></div>
                    <div><div className="f-lbl">Função</div><div className="f-val">{c.funcao?.nome ?? '—'}</div></div>
                    <div><div className="f-lbl">Ambiente</div><div className="f-val">{c.ambiente?.nome ?? '—'}</div></div>
                  </div>
                ) : (
                  <div className="mp-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="mp-field" style={{ gridColumn: "1 / -1" }}>
                      <label>Nome</label>
                      <input className="mp-input" value={fNome} onChange={e => setFNome(e.target.value)} />
                    </div>
                    <div className="mp-field">
                      <label>Matrícula</label>
                      <input className="mp-input" value={fMatricula} onChange={e => setFMatricula(e.target.value)} />
                    </div>
                    <div className="mp-field">
                      <label>Função</label>
                      <select className="mp-input" value={fFuncaoId} onChange={e => setFFuncaoId(e.target.value)} disabled={funcoesQuery.isLoading}>
                        <option value="">Selecione…</option>
                        {(funcoesQuery.data ?? []).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    </div>
                    <div className="mp-field">
                      <label>Setor</label>
                      <select className="mp-input" value={fSetorId} onChange={e => setFSetorId(e.target.value)} disabled={setoresQuery.isLoading}>
                        <option value="">Selecione…</option>
                        {(setoresQuery.data ?? []).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </div>
                    <div className="mp-field">
                      <label>Ambiente</label>
                      <select className="mp-input" value={fAmbienteId} onChange={e => setFAmbienteId(e.target.value)} disabled={ambientesQuery.isLoading}>
                        <option value="">—</option>
                        {(ambientesQuery.data ?? []).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="prof-section">
                <h4>Saúde ocupacional</h4>
                <div className="prof-list">
                  {examesQuery.isLoading ? (
                    <div style={{ padding: 16, textAlign: "center", color: "var(--ink-400)", fontSize: 12 }}>Carregando…</div>
                  ) : exames.length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", color: "var(--ink-400)", fontSize: 12 }}>Nenhum ASO registrado para este colaborador.</div>
                  ) : exames.map(d => {
                    const chip = DOC_CHIP[d.status]
                    return (
                      <div key={d.id} className="prof-row">
                        <span className="lbl">{d.titulo}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="val" style={{ color: chip.cls === "crit" ? "var(--red-500)" : chip.cls === "warn" ? "var(--orange-600)" : "var(--ink-900)" }}>
                            {d.vencimento ? new Date(d.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                          </span>
                          <span className={`chip ${chip.cls}`} style={{ fontSize: 10.5 }}>{chip.label}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Fichas de EPI */}
            <div className="prof-section" style={{ marginTop: 18 }}>
              <h4>Fichas de EPI</h4>
              <div className="prof-list">
                {documentosQuery.isLoading ? (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--ink-400)", fontSize: 12 }}>Carregando…</div>
                ) : fichasEpi.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", color: "var(--ink-400)", fontSize: 12 }}>Nenhuma ficha de EPI registrada para este colaborador.</div>
                ) : fichasEpi.map(d => {
                  const chip = DOC_CHIP[d.status]
                  return (
                    <div key={d.id} className="prof-row">
                      <span className="lbl">{d.titulo}{d.numero ? ` · CA ${d.numero}` : ''}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="val" style={{ color: chip.cls === "crit" ? "var(--red-500)" : chip.cls === "warn" ? "var(--orange-600)" : "var(--ink-900)" }}>
                          {d.vencimento ? new Date(d.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                        </span>
                        <span className={`chip ${chip.cls}`} style={{ fontSize: 10.5 }}>{chip.label}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Treinamentos NR */}
            <div className="prof-section" style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h4 style={{ margin: 0 }}>Treinamentos NR</h4>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{obrigatorios.length} NRs obrigatórias pra função</span>
                  <button className="tbtn sm" onClick={() => setAddingTreino(true)} disabled={tiposQuery.isLoading}><Plus size={12} /> Registrar</button>
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>NR</th>
                      <th>Descrição</th>
                      <th>Última realização</th>
                      <th>Vencimento</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrizQuery.isLoading || treinosQuery.isLoading ? (
                      <tr><td colSpan={6} style={{ textAlign:'center', padding:24, color:'var(--ink-400)', fontSize:12 }}>Carregando…</td></tr>
                    ) : nrRows.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign:'center', padding:24, color:'var(--ink-400)', fontSize:12 }}>
                        Nenhuma NR configurada na matriz para a função "{c.funcao?.nome ?? '—'}".
                      </td></tr>
                    ) : nrRows.map(({ tipo, ultimo }) => {
                      const chip = ultimo ? TREINO_CHIP[ultimo.status] : TREINO_CHIP.pendente
                      return (
                        <tr key={tipo.id}>
                          <td><strong style={{ fontFamily: "var(--font-display)" }}>{tipo.nr_referencia ?? tipo.nome}</strong></td>
                          <td>{tipo.nome}</td>
                          <td style={{ color: "var(--ink-500)" }}>{ultimo?.data_realizacao ? new Date(ultimo.data_realizacao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                          <td style={{ color: chip.cls === "crit" ? "var(--red-500)" : chip.cls === "warn" ? "var(--orange-600)" : "var(--ink-700)" }}>
                            {ultimo?.data_vencimento ? new Date(ultimo.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                          </td>
                          <td><span className={`chip ${chip.cls}`}>{chip.label}</span></td>
                          <td style={{ textAlign: "right" }}>
                            {ultimo && (
                              <button
                                className="icon-btn sm"
                                title="Excluir treinamento"
                                style={{ color: "var(--red-500)" }}
                                onClick={() => setDeletingTreino({ id: ultimo.id, label: `${tipo.nr_referencia ?? tipo.nome} · ${c.nome}` })}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {addingTreino && (
        <AddTreinamentoModal
          colab={{ id: c.id, nome: c.nome, cor, foto: initials }}
          tipos={tipos}
          empresaId={c.empresa_id}
          onClose={() => setAddingTreino(false)}
        />
      )}

      {deletingTreino && (
        <ConfirmDialog
          title="Excluir treinamento?"
          description={<>Isso remove o registro de <strong>{deletingTreino.label}</strong> permanentemente.</>}
          loading={deletarTreino.isPending}
          onCancel={() => setDeletingTreino(null)}
          onConfirm={confirmDeleteTreino}
        />
      )}
    </>
  )
}

/* ============================================================
   Em massa — helpers
   ============================================================ */

interface ParsedRow {
  nome: string
  cpf: string
  matricula: string
  funcao_nome: string
  setor_nome: string
  ambiente_nome: string
  data_admissao: string
  funcao_id: string | null
  setor_id: string | null
  ambiente_id: string | null
  will_create_funcao: boolean
  will_create_setor: boolean
  will_create_ambiente: boolean
  errors: string[]
}

function normalizeCpf(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '')
}

function parseAdmissaoDate(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Excel date serial
  const n = Number(s)
  if (!isNaN(n) && n > 1000) {
    const d = new Date((n - 25569) * 86400 * 1000)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

function downloadCsvTemplate() {
  downloadCsvRows('modelo_colaboradores.csv', [
    ['nome', 'cpf', 'matricula', 'funcao', 'setor', 'ambiente', 'data_admissao'],
    ['João Silva', '123.456.789-00', 'MAT001', 'Operador', 'Produção', 'Linha A', '2024-01-15'],
    ['Maria Souza', '987.654.321-00', '', 'Técnico de Segurança', 'Segurança', '', '01/06/2023'],
  ])
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

  // ── Em massa tab state ────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const qc = useQueryClient()

  const catalogsReady = !setores.isLoading && !funcoes.isLoading && !ambientes.isLoading

  function validateRows(raw: Record<string, string>[]): ParsedRow[] {
    const setoresMap = new Map((setores.data ?? []).map(s => [s.nome.toLowerCase().trim(), s.id]))
    const funcoesMap = new Map((funcoes.data ?? []).map(f => [f.nome.toLowerCase().trim(), f.id]))
    const ambientesMap = new Map((ambientes.data ?? []).map(a => [a.nome.toLowerCase().trim(), a.id]))
    return raw.map(r => {
      const nome = String(r.nome ?? '').trim()
      const cpf = normalizeCpf(r.cpf ?? '')
      const matricula = String(r.matricula ?? '').trim()
      const funcao_nome = String(r.funcao ?? r['cargo'] ?? r['função'] ?? '').trim()
      const setor_nome = String(r.setor ?? '').trim()
      const ambiente_nome = String(r.ambiente ?? '').trim()
      const data_admissao = parseAdmissaoDate(String(r.data_admissao ?? r['admissão'] ?? r['admissao'] ?? '')) ?? ''
      const funcao_id = funcoesMap.get(funcao_nome.toLowerCase()) ?? null
      const setor_id = setoresMap.get(setor_nome.toLowerCase()) ?? null
      const ambiente_id = ambiente_nome ? (ambientesMap.get(ambiente_nome.toLowerCase()) ?? null) : null
      const will_create_funcao = !funcao_id && funcao_nome.length > 0
      const will_create_setor  = !setor_id  && setor_nome.length  > 0
      const will_create_ambiente = !ambiente_id && ambiente_nome.length > 0
      const errors: string[] = []
      if (!nome || nome.length < 2) errors.push('Nome inválido')
      if (cpf.length !== 11) errors.push('CPF inválido')
      if (!funcao_nome) errors.push('Cargo/Função obrigatório')
      if (!setor_nome)  errors.push('Setor obrigatório')
      if (!data_admissao) errors.push('Data de admissão inválida')
      return { nome, cpf, matricula, funcao_nome, setor_nome, ambiente_nome, data_admissao, funcao_id, setor_id, ambiente_id, will_create_funcao, will_create_setor, will_create_ambiente, errors }
    })
  }

  async function processFile(file: File) {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', raw: false, cellDates: false })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
    const normalized = json.map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), String(v)]))
    ) as Record<string, string>[]
    setParsedRows(validateRows(normalized))
  }

  function handleFile(file: File | undefined) {
    if (!file) return
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { toast.error('Use um arquivo CSV ou XLSX.'); return }
    processFile(file)
  }

  async function handleImport() {
    const valid = parsedRows.filter(r => r.errors.length === 0)
    if (!valid.length) return
    setImporting(true)

    // Mutable caches — seeded with already-known catalog IDs, grown on the fly
    const setoresCache  = new Map((setores.data  ?? []).map(s => [s.nome.toLowerCase().trim(), s.id]))
    const funcoesCache  = new Map((funcoes.data  ?? []).map(f => [f.nome.toLowerCase().trim(), f.id]))
    const ambientesCache = new Map((ambientes.data ?? []).map(a => [a.nome.toLowerCase().trim(), a.id]))

    async function resolveSetor(nome: string): Promise<string> {
      const key = nome.toLowerCase().trim()
      if (setoresCache.has(key)) return setoresCache.get(key)!
      const created = await criarSetor({ empresa_id: empresaId, nome })
      setoresCache.set(key, created.id)
      return created.id
    }
    async function resolveFuncao(nome: string): Promise<string> {
      const key = nome.toLowerCase().trim()
      if (funcoesCache.has(key)) return funcoesCache.get(key)!
      const created = await criarFuncao({ empresa_id: empresaId, nome })
      funcoesCache.set(key, created.id)
      return created.id
    }
    async function resolveAmbiente(nome: string): Promise<string> {
      const key = nome.toLowerCase().trim()
      if (ambientesCache.has(key)) return ambientesCache.get(key)!
      const created = await criarAmbiente({ empresa_id: empresaId, nome })
      ambientesCache.set(key, created.id)
      return created.id
    }

    let ok = 0, fail = 0
    for (const row of valid) {
      try {
        const funcao_id   = await resolveFuncao(row.funcao_nome)
        const setor_id    = await resolveSetor(row.setor_nome)
        const ambiente_id = row.ambiente_nome ? await resolveAmbiente(row.ambiente_nome) : null
        await criarColaborador({
          empresa_id:    empresaId,
          nome:          row.nome,
          cpf:           row.cpf,
          matricula:     row.matricula || null,
          funcao_id,
          setor_id,
          ambiente_id,
          data_admissao: row.data_admissao,
        })
        ok++
      } catch { fail++ }
    }
    setImporting(false)
    await qc.invalidateQueries({ queryKey: qk.colaboradores.list(empresaId) })
    await qc.invalidateQueries({ queryKey: qk.setores.list(empresaId) })
    await qc.invalidateQueries({ queryKey: qk.funcoes.list(empresaId) })
    await qc.invalidateQueries({ queryKey: qk.ambientes.list(empresaId) })
    if (ok > 0) {
      toast.success(
        fail > 0
          ? `${ok} colaborador(es) importado(s) · ${fail} falharam.`
          : `${ok} colaborador(es) importado(s) com sucesso.`
      )
      onClose()
    } else {
      toast.error('Nenhum colaborador pôde ser importado. Verifique os erros na planilha.')
    }
  }

  const validRows  = parsedRows.filter(r => r.errors.length === 0).length
  const errorRows  = parsedRows.length - validRows
  const hasParsed  = parsedRows.length > 0

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
              {/* Toolbar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 12.5, color: "var(--ink-500)", maxWidth: 320 }}>
                  Importe vários colaboradores via planilha. Baixe o modelo, preencha e envie.
                </div>
                <button className="tbtn" type="button" onClick={downloadCsvTemplate}><Download size={13} /> Baixar modelo CSV</button>
              </div>

              {/* Drop zone — shown only before a file is loaded */}
              {!hasParsed && (
                <div
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--navy-700)' : 'var(--border-strong)'}`,
                    borderRadius: 14, padding: "32px 20px", textAlign: "center",
                    background: dragOver ? "rgba(30,41,59,0.04)" : "var(--bg)",
                    transition: "all 0.15s", cursor: "pointer",
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                >
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", placeItems: "center", margin: "0 auto 12px", color: "var(--color-accent)" }}>
                    <Download size={20} />
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Arraste a planilha aqui</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 14 }}>CSV ou XLSX · até 500 colaboradores por importação</div>
                  <button className="tbtn primary" style={{ margin: "0 auto" }} type="button"><Plus size={13} /> Selecionar arquivo</button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files?.[0])}
                  />
                </div>
              )}

              {/* Preview table */}
              {hasParsed && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>Pré-visualização · {parsedRows.length} linha{parsedRows.length !== 1 ? 's' : ''}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                        <strong style={{ color: "var(--green-600)" }}>{validRows} válidos</strong>
                        {errorRows > 0 && <> · <strong style={{ color: "var(--red-500)" }}>{errorRows} com erro</strong></>}
                      </span>
                      <button
                        className="tbtn"
                        style={{ fontSize: 11 }}
                        type="button"
                        onClick={() => { setParsedRows([]); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      >
                        <X size={11} /> Trocar arquivo
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr><th>Nome</th><th>CPF</th><th>Cargo · Setor</th><th>Admissão</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {parsedRows.map((row, i) => (
                          <tr key={i} style={row.errors.length > 0 ? { background: "rgba(220,38,38,0.04)" } : {}}>
                            <td>{row.nome || <span style={{ color: "var(--red-500)", fontStyle: "italic" }}>vazio</span>}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.cpf || '—'}</td>
                            <td>
                              <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                                {row.funcao_nome || '—'}
                                {row.will_create_funcao && <span style={{ fontSize: 9.5, background: "var(--color-accent-soft)", color: "var(--color-accent)", border: "1px solid rgba(23,111,255,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>novo</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--ink-500)", display: "flex", alignItems: "center", gap: 5 }}>
                                {row.setor_nome || '—'}
                                {row.will_create_setor && <span style={{ fontSize: 9.5, background: "var(--color-accent-soft)", color: "var(--color-accent)", border: "1px solid rgba(23,111,255,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>novo</span>}
                              </div>
                            </td>
                            <td style={{ fontSize: 12 }}>{row.data_admissao || '—'}</td>
                            <td>
                              {row.errors.length === 0
                                ? <span className="chip ok" style={{ fontSize: 10.5 }}><CheckCircle size={10} /> OK</span>
                                : <span title={row.errors.join('; ')} className="chip crit" style={{ fontSize: 10.5, cursor: "help" }}>
                                    <AlertTriangle size={10} /> {row.errors[0]}{row.errors.length > 1 ? ` +${row.errors.length - 1}` : ''}
                                  </span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import action bar */}
              {hasParsed && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <button className="tbtn" type="button" onClick={onClose}>Cancelar</button>
                  <button
                    className="tbtn primary"
                    type="button"
                    disabled={validRows === 0 || importing || !catalogsReady}
                    onClick={handleImport}
                  >
                    {importing
                      ? <><Loader2 size={13} className="btn-spinner" /> Importando…</>
                      : <><CheckCircle size={13} /> Importar {validRows} colaborador{validRows !== 1 ? 'es' : ''}</>
                    }
                  </button>
                </div>
              )}
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

function ColaboradoresEmpresa({ empresaIdProp, empresaNome, onBack }: {
  empresaIdProp?: string | null
  empresaNome?: string
  onBack?: () => void
}) {
  const { empresaId: empresaIdPerfil } = useCurrentProfile()
  const empresaId = empresaIdProp ?? empresaIdPerfil

  const colabsQuery = useColaboradores(empresaId)
  const colabs = colabsQuery.data ?? []

  // Derivar setores únicos dos dados reais
  const setoresDisponiveis = useMemo(() => {
    const nomes = new Set(colabs.map(c => c.setor?.nome).filter(Boolean) as string[])
    return ['Todos', ...Array.from(nomes).sort()]
  }, [colabs])

  const [searchParams] = useSearchParams()

  const [setor, setSetor]           = useState("Todos")
  const [statusFilter, setStatus]   = useState<string>("all")
  const [view, setView]             = useState<"table" | "grid">("table")
  const [query, setQuery]           = useState(() => searchParams.get("q") ?? "")
  // Abre já com o formulário de novo colaborador se veio de um atalho (ex.:
  // "Novo colaborador" no Dashboard, via navigate('/colaboradores?add=1')).
  const [adding, setAdding]         = useState(() => searchParams.get("add") === "1")
  const [openProfile, setOpenProfile] = useState<ColaboradorComCatalogos | null>(null)

  // Busca vinda do Header (?q=) — sincroniza se o usuário buscar de novo por lá
  // sem sair da página. Ajusta o state durante o render (não em efeito),
  // guardado pela comparação com o último valor visto.
  const [lastSyncedQ, setLastSyncedQ] = useState(searchParams.get("q"))
  const currentQ = searchParams.get("q")
  if (currentQ !== lastSyncedQ) {
    setLastSyncedQ(currentQ)
    if (currentQ) setQuery(currentQ)
  }

  // Derivação de status baseada em treinamentos/documentos (Fase 4.3)
  // Por ora: todos ficam 'ok' até a Fase 4.3 cruzar com treinamentos
  function getStatus(_c: ColaboradorComCatalogos): "ok" | "warn" | "crit" {
    return 'ok'
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
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {onBack && (
            <button className="icon-btn sm" title="Voltar" onClick={onBack} style={{ marginRight:4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}
          <div>
            <h1>Colaboradores{empresaNome ? ` · ${empresaNome}` : ''}</h1>
            <p className="sub">{colabs.length} ativos</p>
          </div>
        </div>
        <div className="toolbar">
          <button
            className="tbtn"
            onClick={() => exportToCsv('colaboradores.csv', [
              { header: 'Nome',      value: (c: ColaboradorComCatalogos) => c.nome },
              { header: 'CPF',       value: (c: ColaboradorComCatalogos) => c.cpf },
              { header: 'Matrícula', value: (c: ColaboradorComCatalogos) => c.matricula ?? '' },
              { header: 'Função',    value: (c: ColaboradorComCatalogos) => c.funcao?.nome ?? '' },
              { header: 'Setor',     value: (c: ColaboradorComCatalogos) => c.setor?.nome ?? '' },
              { header: 'Ambiente',  value: (c: ColaboradorComCatalogos) => c.ambiente?.nome ?? '' },
              { header: 'Admissão',  value: (c: ColaboradorComCatalogos) => c.data_admissao ?? '' },
            ], filtered)}
          ><Download size={14} /> Exportar CSV</button>
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
              boxShadow: statusFilter === s.id ? "0 0 0 2px var(--navy-700), var(--shadow-md)" : "var(--shadow-md)",
              transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-500)", fontWeight: 500 }}>{s.label}</span>
              {s.color && <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "var(--ink-900)", letterSpacing: "-0.02em" }}>
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
                      <div className="ava" style={{ background: getAvatarColor(c.nome) }}>{getInitials(c.nome)}</div>
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
                <div className="ava" style={{ background: getAvatarColor(c.nome), width: 44, height: 44, fontSize: 14 }}>{getInitials(c.nome)}</div>
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

/* ============================================================
   ColaboradoresAdmin — escolha de empresa-cliente antes de ver
   os colaboradores (admin acompanha várias empresas; sem isso,
   a página ficava presa à empresa do perfil do próprio admin,
   ou vazia).
   ============================================================ */

function ColaboradoresAdminList({ onSelect }: { onSelect: (e: { id: string; nome: string }) => void }) {
  const empresasQuery = useEmpresas()
  const empresas = empresasQuery.data ?? []
  const kpisQuery = useDashboardKpis('all')
  const kpis = kpisQuery.data

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Colaboradores</h1>
          <p className="sub">Selecione uma empresa-cliente para ver os colaboradores · {empresas.length} empresas</p>
        </div>
      </div>

      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>Empresas monitoradas</span><span className="kpi-ic blue"><Briefcase size={15}/></span></div>
          <div className="kpi-value">{kpis?.totalEmpresas ?? '—'}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Colaboradores ativos</span><span className="kpi-ic green"><CheckCircle size={15}/></span></div>
          <div className="kpi-value">{kpis ? kpis.totalColaboradores.toLocaleString('pt-BR') : '—'}</div>
        </div>
      </div>

      <div className="glass" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <div className="ctitle">Empresas-cliente</div>
          <div className="csub">Clique numa empresa para ver seus colaboradores</div>
        </div>
        <div style={{ overflow:'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Setor</th>
                <th>Cidade / UF</th>
                <th style={{ textAlign:'center' }}>Colaboradores</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {empresas.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign:'center', padding:40, color:'var(--ink-500)' }}>Nenhuma empresa cadastrada ainda.</td></tr>
              )}
              {empresas.map((e, i) => (
                <tr key={e.id} style={{ cursor:'pointer' }} onClick={() => onSelect({ id: e.id, nome: e.razao_social })}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span className="ava" style={{ background: getChartColor(i), borderRadius:8, width:32, height:32, fontSize:12, flexShrink:0 }}>
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
                  <td style={{ textAlign:'center', fontFamily:'var(--font-display)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{e.colaboradores_count}</td>
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

function ColaboradoresAdmin() {
  const [selectedEmpresa, setSelectedEmpresa] = useState<{ id: string; nome: string } | null>(null)

  if (selectedEmpresa) {
    return (
      <ColaboradoresEmpresa
        empresaIdProp={selectedEmpresa.id}
        empresaNome={selectedEmpresa.nome}
        onBack={() => setSelectedEmpresa(null)}
      />
    )
  }

  return <ColaboradoresAdminList onSelect={setSelectedEmpresa} />
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default function ColaboradoresPage() {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <ColaboradoresAdmin /> : <ColaboradoresEmpresa />
}
