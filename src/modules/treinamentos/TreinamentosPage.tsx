import { useState, useMemo } from "react"
import { GraduationCap, CheckCircle, Clock, AlertTriangle, TrendingUp, X, Download, ChevronRight } from "lucide-react"

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
   Mock data
   ============================================================ */

const NR_CATALOG: NrInfo[] = [
  { nr: "NR-35", titulo: "Trabalho em Altura",                  carga: "8h",  validade: "2 anos", color: "#F59E0B" },
  { nr: "NR-33", titulo: "Espaço Confinado",                    carga: "16h", validade: "1 ano",  color: "#EF4444" },
  { nr: "NR-10", titulo: "Segurança em Instalações Elétricas",  carga: "40h", validade: "2 anos", color: "#3B82F6" },
  { nr: "NR-11", titulo: "Operação de Empilhadeira",            carga: "16h", validade: "1 ano",  color: "#3B82F6" },
  { nr: "NR-12", titulo: "Segurança em Máquinas e Equipamentos",carga: "8h",  validade: "—",      color: "#10B981" },
  { nr: "NR-06", titulo: "Equip. de Proteção Individual",       carga: "4h",  validade: "—",      color: "#10B981" },
  { nr: "NR-05", titulo: "CIPA · Comissão Interna",             carga: "20h", validade: "1 ano",  color: "#8B5CF6" },
  { nr: "NR-20", titulo: "Inflamáveis e Combustíveis",          carga: "16h", validade: "2 anos", color: "#F59E0B" },
]

const COLABS_MATRIX: ColabRow[] = [
  { nome: "Marina S. Oliveira",    setor: "Administrativo", foto: "MO", cor: "#3B82F6" },
  { nome: "Carlos M. Soares",      setor: "Logística",      foto: "CS", cor: "#F59E0B" },
  { nome: "João Pedro Alves",      setor: "Manutenção",     foto: "JA", cor: "#10B981" },
  { nome: "Letícia Ramos Cardoso", setor: "SST",            foto: "LC", cor: "#8B5CF6" },
  { nome: "Roberto N. Lima",       setor: "Produção",       foto: "RL", cor: "#EF4444" },
  { nome: "Ana Carla Mendes",      setor: "Administrativo", foto: "AM", cor: "#06B6D4" },
  { nome: "Diego Vasconcelos",     setor: "Manutenção",     foto: "DV", cor: "#1F2A44" },
  { nome: "Fernanda Lopes Pinto",  setor: "Produção",       foto: "FP", cor: "#F472B6" },
  { nome: "Bruno H. Costa",        setor: "Produção",       foto: "BC", cor: "#22C55E" },
  { nome: "Patrícia Almeida",      setor: "SST",            foto: "PA", cor: "#A855F7" },
]

const SETORES_FILTER = ["Todos", "Administrativo", "Produção", "Logística", "Manutenção", "SST"]

const CELL_COLORS: Record<CellStatus, { bg: string; border: string }> = {
  ok:   { bg: "#10B981", border: "rgba(16,185,129,0.18)" },
  warn: { bg: "#F59E0B", border: "rgba(245,158,11,0.18)"  },
  crit: { bg: "#EF4444", border: "rgba(239,68,68,0.18)"   },
  na:   { bg: "#CBD5E1", border: "rgba(203,213,225,0.30)" },
}

const CELL_SYMBOL: Record<CellStatus, string> = { ok: "✓", warn: "!", crit: "✕", na: "—" }

/* deterministic cell status — seed based on row+col */
function cellStatus(rowIdx: number, colIdx: number): CellStatus {
  const seed = (rowIdx * 7 + colIdx * 3) % 17
  if (seed >= 14) return "crit"
  if (seed >= 11) return "warn"
  if (seed >= 8 && (rowIdx + colIdx) % 4 === 0) return "na"
  if (seed % 5 === 0 && colIdx > 4 && rowIdx % 3 === 0) return "na"
  return "ok"
}

/* per-NR aggregate stats */
function computeNrStats() {
  return NR_CATALOG.map((info, ci) => {
    let ok = 0, warn = 0, crit = 0, na = 0
    COLABS_MATRIX.forEach((_, ri) => {
      const st = cellStatus(ri, ci)
      if (st === "ok") ok++; else if (st === "warn") warn++; else if (st === "crit") crit++; else na++
    })
    const valid = ok + warn + crit
    const pct = valid ? Math.round((ok / valid) * 100) : 100
    return { ...info, ok, warn, crit, na, valid, pct }
  })
}

/* ============================================================
   CellDetail — painel lateral com detalhe da célula
   ============================================================ */

interface CellRef {
  rowIdx: number
  colIdx: number
  colab: ColabRow
  nr: string
}

function CellDetail({ cell, onClose }: { cell: CellRef; onClose: () => void }) {
  const info = NR_CATALOG.find(n => n.nr === cell.nr) ?? NR_CATALOG[0]
  const st   = cellStatus(cell.rowIdx, cell.colIdx)
  const col  = CELL_COLORS[st].bg
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
            <span className="val">{st === "crit" ? "12/01/2024" : "08/03/2024"}</span>
          </div>
          <div className="prof-row" style={{ padding: "8px 0" }}>
            <span className="lbl">Vencimento</span>
            <span className="val" style={{ color: st === "crit" ? "var(--red-500)" : st === "warn" ? "var(--orange-600)" : "var(--ink-900)" }}>
              {st === "crit" ? "Há 47 dias" : st === "warn" ? "12/03/2026" : "08/03/2027"}
            </span>
          </div>
          <div className="prof-row" style={{ padding: "8px 0" }}>
            <span className="lbl">Certificado</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--blue-500)", fontWeight: 600, fontSize: 12 }}>
              <Download size={12} /> CT-{(2024 + cell.rowIdx * 13 + cell.colIdx * 7) % 9999}
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
   TreinamentosPage
   ============================================================ */

export default function TreinamentosPage() {
  const [setorFilter, setSetorFilter] = useState("Todos")
  const [selectedCell, setSelectedCell] = useState<CellRef | null>(null)
  const [activeNr, setActiveNr]         = useState<string | null>(null)

  const nrStats = useMemo(computeNrStats, [])

  const visibleRows = useMemo(
    () => COLABS_MATRIX.map((c, ri) => ({ c, ri })).filter(({ c }) => setorFilter === "Todos" || c.setor === setorFilter),
    [setorFilter]
  )

  return (
    <div className="content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Matriz de Treinamentos NR</h1>
          <p className="sub">Logix Industrial · 247 colaboradores · 8 NRs ativas · acompanhamento por colaborador × NR</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Download size={14} /> Exportar matriz (CSV)</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label"><span>NRs ativas na empresa</span><span className="kpi-ic violet"><GraduationCap size={16} /></span></div>
          <div className="kpi-value">8</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-500)" }}>de 38 NRs aplicáveis · revisado em <strong style={{ color: "var(--ink-900)" }}>jan/2026</strong></div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Colaboradores em dia</span><span className="kpi-ic green"><CheckCircle size={16} /></span></div>
          <div className="kpi-value">89%</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center" }}>
            <span className="kpi-delta up"><TrendingUp size={11} /> +3 p.p.</span>
            <span className="kpi-foot">vs. janeiro</span>
          </div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Vencendo em 30 dias</span><span className="kpi-ic orange"><Clock size={16} /></span></div>
          <div className="kpi-value">47</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-500)" }}>colaboradores · maior: <strong style={{ color: "var(--ink-900)" }}>NR-35 (8)</strong></div>
        </div>
        <div className="glass kpi">
          <div className="kpi-label"><span>Treinamentos vencidos</span><span className="kpi-ic red"><AlertTriangle size={16} /></span></div>
          <div className="kpi-value" style={{ color: "var(--red-500)" }}>12</div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-500)" }}>requer ação imediata · 3 setores</div>
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
            {SETORES_FILTER.map(s => (
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
                  const cells = NR_CATALOG.map((_, ci) => cellStatus(ri, ci))
                  const valid   = cells.filter(x => x !== "na").length
                  const okCount = cells.filter(x => x === "ok").length
                  const score   = Math.round((okCount / (valid || 1)) * 100)

                  return (
                    <tr key={ri}>
                      <td style={{ position: "sticky", left: 0, background: "var(--surface)", zIndex: 1 }}>
                        <div className="cell-person">
                          <div className="ava" style={{ background: c.cor, width: 30, height: 30, fontSize: 11 }}>{c.foto}</div>
                          <div>
                            <div className="name" style={{ fontSize: 12.5 }}>{c.nome}</div>
                            <div className="role" style={{ fontSize: 10.5 }}>{c.setor}</div>
                          </div>
                        </div>
                      </td>
                      {NR_CATALOG.map(({ nr }, ci) => {
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
                              onClick={e => { e.stopPropagation(); setSelectedCell({ rowIdx: ri, colIdx: ci, nr, colab: c }) }}
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
            <CellDetail cell={selectedCell} onClose={() => setSelectedCell(null)} />
          ) : (
            <NRRanking stats={nrStats} activeNr={activeNr} onPick={setActiveNr} />
          )}
        </div>
      </div>

    </div>
  )
}
