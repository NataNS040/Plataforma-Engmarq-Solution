import { useState, useMemo, useEffect } from "react"
import { GraduationCap, CheckCircle, Clock, AlertTriangle, X, Download, ChevronRight, Plus } from "lucide-react"
import { useCurrentProfile } from "@/hooks/useCurrentProfile"
import { useColaboradores } from "@/hooks/queries/useColaboradores"
import { useTreinamentos, useTreinamentoTipos, useRegistrarTreinamento } from "@/hooks/queries/useTreinamentos"

/* ============================================================
   Types
   ============================================================ */

type CellStatus = "ok" | "warn" | "crit" | "na"

interface NrInfo {
  nr: string
  titulo: string
  carga: string
  validade: string
  color: string
}

interface ColabRow {
  nome: string
  setor: string
  foto: string
  cor: string
}

/* ============================================================
   Constants
   ============================================================ */

const CELL_COLORS: Record<CellStatus, { bg: string; border: string }> = {
  ok:   { bg: "#10B981", border: "rgba(16,185,129,0.18)" },
  warn: { bg: "#F59E0B", border: "rgba(245,158,11,0.18)"  },
  crit: { bg: "#EF4444", border: "rgba(239,68,68,0.18)"   },
  na:   { bg: "#CBD5E1", border: "rgba(203,213,225,0.30)" },
}

const CELL_SYMBOL: Record<CellStatus, string> = { ok: "✓", warn: "!", crit: "✕", na: "—" }



/* ============================================================
   CellDetail — painel lateral com detalhe da célula
   ============================================================ */

interface CellRef {
  rowIdx: number
  colIdx: number
  colab: ColabRow
  nr: string
  status: CellStatus
  realizacao?: string | null
  vencimento?: string | null
}

function CellDetail({ cell, nrCatalog, onClose }: { cell: CellRef; nrCatalog: NrInfo[]; onClose: () => void }) {
  const info = nrCatalog.find(n => n.nr === cell.nr) ?? nrCatalog[0]
  const st   = cell.status
  const col  = CELL_COLORS[st ?? 'na'].bg
  const labels: Record<CellStatus, string> = { ok: "Em dia", warn: "Vencendo", crit: "Vencido", na: "Não aplicável" }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="ctitle">Detalhes</div>
        <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}><X size={13} /></button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div className="ava" style={{ background: cell.colab.cor, width: 40, height: 40, fontSize: 13 }}>{cell.colab.foto}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{cell.colab.nome}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{cell.colab.setor}</div>
        </div>
      </div>

      <div style={{ padding: 14, borderRadius: 12, background: `${col}15`, border: `1px solid ${col}40`, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em" }}>{info.nr}</div>
          <span className={`chip ${st === "na" ? "neutral" : st}`} style={{ fontSize: 11 }}>{labels[st]}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-700)", marginBottom: 10, fontWeight: 500 }}>{info.titulo}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11.5 }}>
          <div>
            <div style={{ color: "var(--ink-500)" }}>Carga horária</div>
            <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{info.carga}</div>
          </div>
          <div>
            <div style={{ color: "var(--ink-500)" }}>Validade</div>
            <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>{info.validade}</div>
          </div>
        </div>
      </div>

      {st !== "na" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <div className="prof-row" style={{ padding: "8px 0" }}>
            <span className="lbl">Última conclusão</span>
            <span className="val">{cell.realizacao ? new Date(cell.realizacao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span>
          </div>
          <div className="prof-row" style={{ padding: "8px 0" }}>
            <span className="lbl">Vencimento</span>
            <span className="val" style={{ color: st === "crit" ? "var(--red-500)" : st === "warn" ? "var(--orange-600)" : "var(--ink-900)" }}>
              {cell.vencimento ? new Date(cell.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button className="tbtn primary" style={{ justifyContent: "center" }}>
          Ver perfil do colaborador <ChevronRight size={13} />
        </button>
        {st !== "na" && (
          <button className="tbtn ghost" style={{ justifyContent: "center" }}>
            <Download size={13} /> Baixar certificado
          </button>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   NRRanking — painel lateral quando nada selecionado
   ============================================================ */

interface NrStat extends NrInfo {
  ok: number; warn: number; crit: number; na: number; valid: number; pct: number
}

function NRRanking({ stats, activeNr, onPick }: { stats: NrStat[]; activeNr: string | null; onPick: (nr: string | null) => void }) {
  const ordered = [...stats].sort((a, b) => a.pct - b.pct)
  const worst   = ordered[0]

  return (
    <div style={{ padding: 16 }}>
      <div className="ctitle" style={{ marginBottom: 4 }}>Acompanhamento por NR</div>
      <div className="csub" style={{ marginBottom: 14 }}>Ordenado da menor conformidade</div>

      {worst && worst.crit > 0 && (
        <div style={{
          background: "linear-gradient(135deg, var(--red-50) 0%, transparent 100%)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 12, padding: 14, marginBottom: 14,
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={16} style={{ color: "var(--red-500)", marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, fontFamily: "Plus Jakarta Sans" }}>Atenção prioritária</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-700)", lineHeight: 1.4 }}>
                <strong>{worst.nr} · {worst.titulo}</strong> está em {worst.pct}% — {worst.crit} colaborador{worst.crit > 1 ? "es" : ""} com treinamento vencido.
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ordered.map(n => {
          const active = activeNr === n.nr
          const col = n.pct >= 85 ? "var(--green-600)" : n.pct >= 70 ? "var(--orange-600)" : "var(--red-500)"
          return (
            <button key={n.nr} className={`nr-rank-row ${active ? "active" : ""}`} onClick={() => onPick(active ? null : n.nr)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                  <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 12.5 }}>{n.nr}</span>
                  <span style={{ fontSize: 10.5, color: "var(--ink-500)", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.titulo}</span>
                </span>
                <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 13, color: col, fontVariantNumeric: "tabular-nums" }}>{n.pct}%</span>
              </div>
              <div className="nr-chip-bar">
                <div style={{ width: `${(n.ok   / (n.valid || 1)) * 100}%`, background: CELL_COLORS.ok.bg   }} />
                <div style={{ width: `${(n.warn / (n.valid || 1)) * 100}%`, background: CELL_COLORS.warn.bg }} />
                <div style={{ width: `${(n.crit / (n.valid || 1)) * 100}%`, background: CELL_COLORS.crit.bg }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
   AddTreinamentoModal
   ============================================================ */

import type { TreinamentoTipo } from "@/types/database"

interface AddTreinamentoModalProps {
  colab: { id: string; nome: string; cor: string; foto: string }
  tipos: TreinamentoTipo[]
  empresaId: string
  onClose: () => void
}

function AddTreinamentoModal({ colab, tipos, empresaId, onClose }: AddTreinamentoModalProps) {
  const registrar = useRegistrarTreinamento()
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "")
  const [dataRealizacao, setDataRealizacao] = useState("")
  const [dataVencimento, setDataVencimento] = useState("")
  const [cargaHoraria, setCargaHoraria] = useState("")
  const [instrutor, setInstrutor] = useState("")

  useEffect(() => {
    const tipo = tipos.find(t => t.id === tipoId)
    if (tipo?.validade_meses && dataRealizacao) {
      const d = new Date(dataRealizacao + "T00:00:00")
      d.setMonth(d.getMonth() + tipo.validade_meses)
      setDataVencimento(d.toISOString().slice(0, 10))
    } else {
      setDataVencimento("")
    }
  }, [tipoId, dataRealizacao, tipos])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tipoId || !dataRealizacao) return
    await registrar.mutateAsync({
      empresa_id:          empresaId,
      colaborador_id:      colab.id,
      treinamento_tipo_id: tipoId,
      data_realizacao:     dataRealizacao,
      data_vencimento:     dataVencimento || null,
      carga_horaria:       cargaHoraria ? Number(cargaHoraria) : null,
      instrutor:           instrutor || null,
    })
    onClose()
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: 460, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 16 }}>Registrar Treinamento</div>
          <button className="icon-btn" onClick={onClose} style={{ width: 28, height: 28 }}><X size={13} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 12px", background: "var(--bg)", borderRadius: 10 }}>
          <div className="ava" style={{ background: colab.cor, width: 36, height: 36, fontSize: 12 }}>{colab.foto}</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{colab.nome}</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 6 }}>NR / Treinamento *</label>
            <select
              value={tipoId}
              onChange={e => setTipoId(e.target.value)}
              required
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, color: "var(--ink-900)" }}
            >
              {tipos.map(t => (
                <option key={t.id} value={t.id}>{t.nr_referencia ? `${t.nr_referencia} — ` : ""}{t.nome}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 6 }}>Data de realização *</label>
              <input
                type="date"
                value={dataRealizacao}
                onChange={e => setDataRealizacao(e.target.value)}
                required
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, color: "var(--ink-900)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 6 }}>
                Vencimento {tipos.find(t => t.id === tipoId)?.validade_meses ? "(auto)" : ""}
              </label>
              <input
                type="date"
                value={dataVencimento}
                onChange={e => setDataVencimento(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, color: "var(--ink-900)" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 6 }}>Carga horária (h)</label>
              <input
                type="number"
                value={cargaHoraria}
                onChange={e => setCargaHoraria(e.target.value)}
                min={1}
                placeholder="Ex: 8"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, color: "var(--ink-900)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-600)", display: "block", marginBottom: 6 }}>Instrutor</label>
              <input
                type="text"
                value={instrutor}
                onChange={e => setInstrutor(e.target.value)}
                placeholder="Nome do instrutor"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, color: "var(--ink-900)" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="tbtn ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="tbtn primary" disabled={registrar.isPending} style={{ justifyContent: "center" }}>
              {registrar.isPending ? "Salvando…" : "Registrar treinamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ============================================================
   TreinamentosPage
   ============================================================ */

export default function TreinamentosPage() {
  const { empresaId } = useCurrentProfile()

  const colabsQuery = useColaboradores(empresaId)
  const treinamentosQuery = useTreinamentos(empresaId)
  const tiposQuery = useTreinamentoTipos()

  const colabs   = colabsQuery.data ?? []
  const treinamentos = treinamentosQuery.data ?? []
  const nrTipos  = tiposQuery.data ?? []

  // Montar NR_CATALOG dinâmico
  const NR_CATALOG: NrInfo[] = useMemo(() => nrTipos.map(t => ({
    nr:       t.nr_referencia ?? t.nome,
    titulo:   t.nome,
    carga:    t.validade_meses ? `${t.validade_meses * 30}h` : '—',
    validade: t.validade_meses ? `${t.validade_meses} meses` : '—',
    color:    '#3B82F6',
    tipoId:   t.id,
  })), [nrTipos])

  // Montar COLABS_MATRIX dinâmico
  const COLABS_MATRIX: ColabRow[] = useMemo(() => {
    const AVATAR_COLORS = ['#3B82F6','#F59E0B','#10B981','#8B5CF6','#EF4444','#06B6D4','#1F2A44','#F472B6','#22C55E','#A855F7']
    function avatarColor(nome: string) {
      let h = 0; for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h)
      return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
    }
    return colabs.map(c => ({
      nome:  c.nome,
      setor: c.setor?.nome ?? '—',
      foto:  c.nome.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase(),
      cor:   avatarColor(c.nome),
      id:    c.id,
    }))
  }, [colabs])

  // Lookup treinamentos reais por (colaboradorId, treinamentoTipoId)
  const treinMap = useMemo(() => {
    const m = new Map<string, typeof treinamentos[number]>()
    treinamentos.forEach(t => {
      m.set(`${t.colaborador_id}:${t.treinamento_tipo_id}`, t)
    })
    return m
  }, [treinamentos])

  // Derivar status de célula com dados reais
  function cellStatusReal(colab: ColabRow & { id?: string }, nr: NrInfo & { tipoId?: string }): CellStatus {
    const colabId = (colab as { id?: string }).id
    const tipoId  = (nr as { tipoId?: string }).tipoId
    if (!colabId || !tipoId) return 'na'
    const t = treinMap.get(`${colabId}:${tipoId}`)
    if (!t) return 'na'
    const dbStatus = t.status
    if (dbStatus === 'vencido')  return 'crit'
    if (dbStatus === 'vencendo') return 'warn'
    if (dbStatus === 'em_dia')   return 'ok'
    return 'na'
  }

  const setores = useMemo(() => {
    const s = new Set(COLABS_MATRIX.map(c => c.setor))
    return ['Todos', ...Array.from(s).sort()]
  }, [COLABS_MATRIX])

  const [setorFilter, setSetorFilter] = useState("Todos")
  const [selectedCell, setSelectedCell] = useState<CellRef | null>(null)
  const [activeNr, setActiveNr] = useState<string | null>(null)
  const [addingForColab, setAddingForColab] = useState<{ id: string; nome: string; cor: string; foto: string } | null>(null)

  const nrStats = useMemo(() => {
    return NR_CATALOG.map((info) => {
      let ok = 0, warn = 0, crit = 0, na = 0
      COLABS_MATRIX.forEach(c => {
        const st = cellStatusReal(c as ColabRow & { id?: string }, info as NrInfo & { tipoId?: string })
        if (st === "ok") ok++; else if (st === "warn") warn++; else if (st === "crit") crit++; else na++
      })
      const valid = ok + warn + crit
      const pct = valid ? Math.round((ok / valid) * 100) : 100
      return { ...info, ok, warn, crit, na, valid, pct }
    })
  }, [NR_CATALOG, COLABS_MATRIX, treinMap])

  const visibleRows = useMemo(
    () => COLABS_MATRIX.map((c, ri) => ({ c, ri })).filter(({ c }) => setorFilter === "Todos" || c.setor === setorFilter),
    [setorFilter, COLABS_MATRIX]
  )

  const okCount   = nrStats.reduce((s, n) => s + n.ok, 0)
  const warnCount = nrStats.reduce((s, n) => s + n.warn, 0)
  const critCount = nrStats.reduce((s, n) => s + n.crit, 0)
  const totalCells = okCount + warnCount + critCount
  const pctGeral = totalCells ? Math.round((okCount / totalCells) * 100) : 0

  return (
    <div className="content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Matriz de Treinamentos NR</h1>
          <p className="sub">{colabs.length} colaboradores · {NR_CATALOG.length} NRs monitoradas</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14} /> Exportar matriz (CSV)</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>NRs ativas na empresa</span><span className="kpi-ic violet"><GraduationCap size={16} /></span></div>
          <div className="kpi-value">{NR_CATALOG.length}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Colaboradores em dia</span><span className="kpi-ic green"><CheckCircle size={16} /></span></div>
          <div className="kpi-value">{pctGeral}%</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencendo em 30 dias</span><span className="kpi-ic orange"><Clock size={16} /></span></div>
          <div className="kpi-value">{warnCount}</div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Treinamentos vencidos</span><span className="kpi-ic red"><AlertTriangle size={16} /></span></div>
          <div className="kpi-value" style={{ color: critCount > 0 ? "var(--red-500)" : undefined }}>{critCount}</div>
        </div>
      </div>

      {/* NR health strip */}
      <div className="glass" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="ctitle">Conformidade por NR</div>
            <div className="csub">Clique numa norma para destacá-la na matriz</div>
          </div>
          <div className="seg">
            {setores.map(s => (
              <button key={s} className={setorFilter === s ? "on" : ""} onClick={() => setSetorFilter(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="nr-strip">
          {nrStats.map(n => {
            const active = activeNr === n.nr
            const col = n.pct >= 85 ? "var(--green-600)" : n.pct >= 70 ? "var(--orange-600)" : "var(--red-500)"
            return (
              <button key={n.nr} className={`nr-chip ${active ? "active" : ""}`} onClick={() => setActiveNr(active ? null : n.nr)}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 13 }}>{n.nr}</span>
                  <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 13, color: col, fontVariantNumeric: "tabular-nums" }}>{n.pct}%</span>
                </div>
                <div className="nr-chip-bar">
                  <div style={{ width: `${(n.ok   / (n.valid || 1)) * 100}%`, background: CELL_COLORS.ok.bg   }} />
                  <div style={{ width: `${(n.warn / (n.valid || 1)) * 100}%`, background: CELL_COLORS.warn.bg }} />
                  <div style={{ width: `${(n.crit / (n.valid || 1)) * 100}%`, background: CELL_COLORS.crit.bg }} />
                </div>
                {n.crit > 0 && <div className="nr-chip-alert">{n.crit} vencido{n.crit > 1 ? "s" : ""}</div>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Matriz + painel lateral */}
      <div className="row-2" style={{ gridTemplateColumns: "1fr 300px", alignItems: "start" }}>

        {/* Matriz */}
        <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="ctitle">Matriz colaborador × NR</div>
              <div className="csub">Clique numa célula para ver o detalhe do treinamento</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="legend-pill"><span className="sw" style={{ background: CELL_COLORS.ok.bg   }} /> Em dia</span>
              <span className="legend-pill"><span className="sw" style={{ background: CELL_COLORS.warn.bg }} /> Vencendo</span>
              <span className="legend-pill"><span className="sw" style={{ background: CELL_COLORS.crit.bg }} /> Vencido</span>
              <span className="legend-pill"><span className="sw" style={{ background: CELL_COLORS.na.bg   }} /> N/A</span>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "var(--bg)", zIndex: 1, minWidth: 240 }}>Colaborador</th>
                  {NR_CATALOG.map(({ nr }) => (
                    <th
                      key={nr}
                      className={activeNr === nr ? "col-active" : ""}
                      style={{ textAlign: "center", minWidth: 60, cursor: "pointer" }}
                      onClick={() => setActiveNr(activeNr === nr ? null : nr)}
                    >
                      {nr}
                    </th>
                  ))}
                  <th style={{ textAlign: "right", minWidth: 80 }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ c, ri }) => {
                  const cells = NR_CATALOG.map(nr => cellStatusReal(c as ColabRow & { id?: string }, nr as NrInfo & { tipoId?: string }))
                  const valid   = cells.filter(x => x !== "na").length
                  const okCount = cells.filter(x => x === "ok").length
                  const score   = Math.round((okCount / (valid || 1)) * 100)

                  return (
                    <tr key={ri}>
                      <td style={{ position: "sticky", left: 0, background: "var(--surface)", zIndex: 1 }}>
                        <div className="cell-person" style={{ justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div className="ava" style={{ background: c.cor, width: 30, height: 30, fontSize: 11 }}>{c.foto}</div>
                            <div>
                              <div className="name" style={{ fontSize: 12.5 }}>{c.nome}</div>
                              <div className="role" style={{ fontSize: 10.5 }}>{c.setor}</div>
                            </div>
                          </div>
                          <button
                            className="tbtn ghost"
                            style={{ padding: "2px 8px", fontSize: 11, height: 24, gap: 4, marginLeft: 6, flexShrink: 0 }}
                            title="Registrar treinamento"
                            onClick={e => { e.stopPropagation(); setAddingForColab({ id: (c as ColabRow & { id?: string }).id!, nome: c.nome, cor: c.cor, foto: c.foto }) }}
                          >
                            <Plus size={11} /> Registrar
                          </button>
                        </div>
                      </td>
                      {NR_CATALOG.map((nrInfo, ci) => {
                        const nr   = nrInfo.nr
                        const st   = cells[ci]
                        const isSel = selectedCell?.rowIdx === ri && selectedCell?.colIdx === ci
                        const dimmed = activeNr !== null && activeNr !== nr
                        return (
                          <td
                            key={ci}
                            className={activeNr === nr ? "col-active" : ""}
                            style={{ textAlign: "center", padding: 8, opacity: dimmed ? 0.32 : 1, transition: "opacity .15s" }}
                          >
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                const trein = treinMap.get(`${(c as ColabRow & {id?: string}).id}:${(nrInfo as NrInfo & {tipoId?: string}).tipoId}`)
                                setSelectedCell({ rowIdx: ri, colIdx: ci, nr, colab: c, status: st, realizacao: trein?.data_realizacao ?? null, vencimento: trein?.data_vencimento ?? null })
                              }}
                              title={`${c.nome} · ${nr} · ${st}`}
                              style={{
                                width: 28, height: 28, borderRadius: 8,
                                background: CELL_COLORS[st].bg,
                                border: `2px solid ${isSel ? "#0F172A" : CELL_COLORS[st].border}`,
                                cursor: "pointer",
                                display: "grid", placeItems: "center",
                                color: "#FFF",
                                fontSize: 12, fontWeight: 700,
                                transition: "transform 0.1s",
                                boxShadow: isSel ? "0 0 0 3px rgba(15,23,42,0.15)" : "none",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.12)")}
                              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                            >
                              {CELL_SYMBOL[st]}
                            </button>
                          </td>
                        )
                      })}
                      <td style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: score >= 85 ? "var(--green-600)" : score >= 70 ? "var(--orange-600)" : "var(--red-500)" }}>
                          {score}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ position: "sticky", left: 0, background: "var(--bg)", zIndex: 1, fontWeight: 600, fontSize: 11.5, color: "var(--ink-500)" }}>
                    Conformidade por NR
                  </td>
                  {nrStats.map(n => (
                    <td
                      key={n.nr}
                      className={activeNr === n.nr ? "col-active" : ""}
                      style={{ textAlign: "center", fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums", color: n.pct >= 85 ? "var(--green-600)" : n.pct >= 70 ? "var(--orange-600)" : "var(--red-500)" }}
                    >
                      {n.pct}%
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Painel lateral */}
        <div className="glass" style={{ position: "sticky", top: 80 }}>
          {selectedCell ? (
            <CellDetail cell={selectedCell} nrCatalog={NR_CATALOG} onClose={() => setSelectedCell(null)} />
          ) : (
            <NRRanking stats={nrStats} activeNr={activeNr} onPick={setActiveNr} />
          )}
        </div>
      </div>

      {addingForColab && empresaId && (
        <AddTreinamentoModal
          colab={addingForColab}
          tipos={nrTipos}
          empresaId={empresaId}
          onClose={() => setAddingForColab(null)}
        />
      )}

    </div>
  )
}
