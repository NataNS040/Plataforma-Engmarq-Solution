import { useState } from "react"
import { useAuth } from "@/modules/auth/AuthProvider"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts"
import {
  Users, GraduationCap, FileText, Heart,
  Calendar, Download, Plus, TrendingUp, TrendingDown, ArrowRight,
} from "lucide-react"

/* ---- Dados mock (virão do Supabase futuramente) ---- */

const complianceMonthly = [
  { l: "Mar", v: 76 }, { l: "Abr", v: 78 }, { l: "Mai", v: 81 },
  { l: "Jun", v: 83 }, { l: "Jul", v: 85 }, { l: "Ago", v: 84 },
  { l: "Set", v: 87 }, { l: "Out", v: 88 }, { l: "Nov", v: 88 },
  { l: "Dez", v: 89 }, { l: "Jan", v: 89 }, { l: "Fev", v: 89.5 },
]

const nrDetail = [
  { code: "NR-35", titulo: "Trabalho em altura",  req: 47, ok: 35, warn: 8, crit: 4 },
  { code: "NR-33", titulo: "Espaço confinado",    req: 28, ok: 16, warn: 6, crit: 6 },
  { code: "NR-10", titulo: "Segurança elétrica",  req: 22, ok: 18, warn: 3, crit: 1 },
  { code: "NR-11", titulo: "Empilhadeira",         req: 18, ok: 16, warn: 2, crit: 0 },
  { code: "NR-12", titulo: "Máquinas e equip.",    req: 12, ok: 9,  warn: 2, crit: 1 },
  { code: "NR-06", titulo: "EPI",                  req: 8,  ok: 7,  warn: 1, crit: 0 },
]

type TimelineKind = "crit" | "warn" | "ok"

const timeline: { when: string; body: string; meta: string; kind: TimelineKind }[] = [
  { when: "Amanhã",   body: "ASO ocupacional — Carlos M. Soares (Operador empilhadeira)", meta: "NR-7 PCMSO · médico Dr. Lima",          kind: "crit" },
  { when: "3 dias",   body: "Treinamento NR-35 vence para 8 colaboradores",               meta: "Trabalho em altura · reciclagem 2 anos", kind: "crit" },
  { when: "5 dias",   body: "ASO admissional pendente — 3 novos contratados",             meta: "Pendente desde 18/02",                    kind: "warn" },
  { when: "8 dias",   body: "PGR anual — atualização programada",                         meta: "Documento mestre",                        kind: "warn" },
  { when: "12 dias",  body: "Reciclagem NR-33 · Equipe manutenção",                      meta: "Espaço confinado · 6 pessoas",            kind: "ok"   },
  { when: "15 dias",  body: "Reciclagem NR-10 · Eletricistas",                           meta: "Segurança elétrica · 4 pessoas",          kind: "ok"   },
]

const donutData = [
  { value: 62, fill: "#10B981", label: "Em dia" },
  { value: 26, fill: "#F59E0B", label: "Vence em 30 dias" },
  { value: 12, fill: "#EF4444", label: "Vencido" },
]

const COMPLIANCE_VALUE = 89.5
const COMPLIANCE_TARGET = 95

/* ---- Helpers ---- */

function currentDateLabel() {
  const d = new Date()
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]
  const dias  = ["dom","seg","ter","qua","qui","sex","sáb"]
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const company = profile?.role === "admin" ? "EngMarq Vision" : "Logix Industrial"
  const [range, setRange] = useState("12m")

  return (
    <div className="content">

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1>Dashboard · {company}</h1>
          <p className="sub">Operações Diadema · 247 colaboradores · CNPJ 34.124.001/0001-12</p>
        </div>
        <div className="toolbar">
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "7px 12px", borderRadius: 8,
            background: "var(--surface)", border: "1px solid var(--border)",
            fontSize: 12.5, fontWeight: 600, color: "var(--ink-700)", textTransform: "capitalize",
          }}>
            <Calendar size={14} style={{ color: "var(--orange-600)" }} />
            {currentDateLabel()}
          </span>
          <button className="tbtn"><Download size={14} /> Exportar relatório</button>
          <button className="tbtn primary"><Plus size={14} /> Novo colaborador</button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label">
            <span>Colaboradores ativos</span>
            <span className="kpi-ic blue"><Users size={15} /></span>
          </div>
          <div className="kpi-value">247</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-delta up"><TrendingUp size={11} /> +8 este mês</span>
            <span className="kpi-foot">3 admissões</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Treinamentos válidos</span>
            <span className="kpi-ic orange"><GraduationCap size={15} /></span>
          </div>
          <div className="kpi-value">89%</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-delta up"><TrendingUp size={11} /> +3 p.p.</span>
            <span className="kpi-foot">meta 95%</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>ASOs em dia</span>
            <span className="kpi-ic green"><Heart size={15} /></span>
          </div>
          <div className="kpi-value">94%</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-delta down"><TrendingDown size={11} /> -1 p.p.</span>
            <span className="kpi-foot">14 vencendo</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Documentos vencendo</span>
            <span className="kpi-ic red"><FileText size={15} /></span>
          </div>
          <div className="kpi-value">12</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-delta down"><TrendingDown size={11} /> 3 novos</span>
            <span className="kpi-foot">próximos 30d</span>
          </div>
        </div>
      </div>

      {/* ── Row 2: BarChart + Gauge ── */}
      <div className="row-2">

        {/* Compliance evolution */}
        <div className="glass">
          <div className="chart-head">
            <div>
              <div className="ctitle">Evolução do compliance</div>
              <div className="csub">Score consolidado, mês a mês</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="legend-pill">
                <span className="sw" style={{ background: "#F59E0B" }} />
                Compliance mensal
              </span>
              <div className="seg">
                {(["7d", "30d", "90d", "12m"] as const).map(p => (
                  <button key={p} className={range === p ? "on" : ""} onClick={() => setRange(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={complianceMonthly} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8F0" vertical={false} />
              <XAxis
                dataKey="l"
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[60, 100]}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #E5E8F0",
                  fontSize: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
                formatter={(v: number) => [`${v}%`, "Compliance"]}
              />
              <ReferenceLine
                y={COMPLIANCE_TARGET}
                stroke="#10B981"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "Meta 95%", position: "right", fontSize: 10, fill: "#10B981" }}
              />
              <Bar dataKey="v" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Compliance gauge */}
        <div className="glass">
          <div className="chart-head">
            <div>
              <div className="ctitle">Compliance da empresa</div>
              <div className="csub">Score atual · meta {COMPLIANCE_TARGET}%</div>
            </div>
          </div>
          <div className="gauge-wrap">
            <div style={{ position: "relative", width: 180, height: 180 }}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={[
                      { value: COMPLIANCE_VALUE },
                      { value: 100 - COMPLIANCE_VALUE },
                    ]}
                    cx="50%"
                    cy="50%"
                    startAngle={225}
                    endAngle={-45}
                    innerRadius={58}
                    outerRadius={76}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="#F59E0B" />
                    <Cell fill="#F4F6FB" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  fontFamily: "Plus Jakarta Sans", fontWeight: 800, fontSize: 30,
                  color: "var(--ink-900)", lineHeight: 1, fontVariantNumeric: "tabular-nums",
                }}>
                  {COMPLIANCE_VALUE}%
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4 }}>
                  compliance
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, fontSize: 11.5, color: "var(--ink-500)", alignItems: "center" }}>
              <span className="kpi-delta up" style={{ marginTop: 0 }}>
                <TrendingUp size={11} /> +3 p.p.
              </span>
              vs. jan
            </div>
            <div className="gauge-cap">
              Resolva os <strong>12 vencimentos</strong> dos próximos 30 dias para atingir 94%.
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: NR breakdown + Donut ── */}
      <div className="row-2">

        {/* NR breakdown */}
        <div className="glass">
          <div className="chart-head">
            <div>
              <div className="ctitle">Treinamentos por NR</div>
              <div className="csub">Detalhamento por norma · em dia · vencendo · vencido</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="legend-pill"><span className="sw" style={{ background: "#10B981" }} />Em dia</span>
              <span className="legend-pill"><span className="sw" style={{ background: "#F59E0B" }} />Vencendo</span>
              <span className="legend-pill"><span className="sw" style={{ background: "#EF4444" }} />Vencido</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {nrDetail.map((nr) => {
              const pct = Math.round((nr.ok / nr.req) * 100)
              return (
                <div
                  key={nr.code}
                  style={{ display: "grid", gridTemplateColumns: "140px 1fr 44px", gap: 14, alignItems: "center" }}
                >
                  <div>
                    <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>
                      {nr.code}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nr.titulo}
                    </div>
                  </div>
                  <div>
                    <div style={{ height: 12, background: "var(--bg)", borderRadius: 6, overflow: "hidden", display: "flex" }}>
                      <div style={{ width: `${(nr.ok   / nr.req) * 100}%`, background: "#10B981" }} title={`${nr.ok} em dia`} />
                      <div style={{ width: `${(nr.warn / nr.req) * 100}%`, background: "#F59E0B" }} title={`${nr.warn} vencendo`} />
                      <div style={{ width: `${(nr.crit / nr.req) * 100}%`, background: "#EF4444" }} title={`${nr.crit} vencido`} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 10.5, color: "var(--ink-500)" }}>
                      <span><strong style={{ color: "#059669" }}>{nr.ok}</strong> em dia</span>
                      <span><strong style={{ color: "#D97706" }}>{nr.warn}</strong> vencendo</span>
                      <span><strong style={{ color: "#EF4444" }}>{nr.crit}</strong> vencido</span>
                      <span style={{ marginLeft: "auto" }}>{nr.req} obrigatórios</span>
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 13,
                    textAlign: "right", fontVariantNumeric: "tabular-nums",
                    color: pct >= 85 ? "#059669" : pct >= 70 ? "#D97706" : "#EF4444",
                  }}>
                    {pct}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Donut: status dos colaboradores */}
        <div className="glass">
          <div className="chart-head">
            <div>
              <div className="ctitle">Status dos colaboradores</div>
              <div className="csub">Distribuição de conformidade</div>
            </div>
          </div>
          <div className="donut-wrap">
            <div style={{ position: "relative", flexShrink: 0 }}>
              <ResponsiveContainer width={170} height={170}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    strokeWidth={2}
                    stroke="var(--surface)"
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 800, fontSize: 22, color: "var(--ink-900)", lineHeight: 1 }}>
                  89%
                </span>
                <span style={{ fontSize: 10, color: "var(--ink-400)", marginTop: 3 }}>em dia</span>
              </div>
            </div>
            <div className="donut-legend">
              {donutData.map((d, i) => (
                <div key={i} className="lg">
                  <div className="left">
                    <span className="sw" style={{ background: d.fill }} />
                    {d.label}
                  </div>
                  <span className="val">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline de vencimentos ── */}
      <div className="glass">
        <div className="chart-head">
          <div>
            <div className="ctitle">Próximos vencimentos</div>
            <div className="csub">Itens da agenda SST das próximas 2 semanas · clique em resolver para ir direto ao item</div>
          </div>
        </div>
        <div className="tl-list">
          {timeline.map((t, i) => (
            <div key={i} className={`tl-item ${t.kind}`}>
              <span className="when">{t.when}</span>
              <span className="dot" />
              <div className="body">
                {t.body}
                <span className="meta">{t.meta}</span>
              </div>
              <button className="tbtn primary">
                Resolver <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
