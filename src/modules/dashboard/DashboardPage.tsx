import { useMemo } from "react"
import { useAuth } from "@/modules/auth/AuthProvider"
import { useCurrentProfile } from "@/hooks/useCurrentProfile"
import { useDashboardKpis, useDashboardAlertas } from "@/hooks/queries/useDashboard"
import { useEmpresas } from "@/hooks/queries/useEmpresas"
import { useTreinamentos, useTreinamentoTipos } from "@/hooks/queries/useTreinamentos"
import {
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts"
import {
  Users, GraduationCap, FileText, Heart, Building2, ShieldCheck,
  Calendar, Download, Plus, ArrowRight,
  Filter, AlertTriangle,
} from "lucide-react"

/* ============================================================
   Shared helpers
   ============================================================ */

function currentDateLabel() {
  const d = new Date()
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]
  const dias  = ["dom","seg","ter","qua","qui","sex","sáb"]
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

type TimelineKind = "crit" | "warn" | "ok"

const EMPRESA_COLORS = ["#1F2A44","#10B981","#3B82F6","#8B5CF6","#F59E0B"]

/* ============================================================
   ADMIN — dashboard cross-company
   ============================================================ */

function DashboardAdmin() {
  const kpisQuery = useDashboardKpis('all')
  const kpis = kpisQuery.data
  const alertasQuery = useDashboardAlertas('all', 5)
  const alertas = alertasQuery.data ?? []
  const empresasQuery = useEmpresas()
  const empresas = empresasQuery.data ?? []

  const compliancePct = kpis?.compliancePct ?? 0
  const donutData = kpis ? [
    { l: 'Docs em dia',         v: kpis.totalDocumentos - kpis.docsVencidos - kpis.docsVencendo,   c: '#10B981' },
    { l: 'Docs vencendo',       v: kpis.docsVencendo,                                               c: '#F59E0B' },
    { l: 'Docs vencidos',       v: kpis.docsVencidos,                                               c: '#EF4444' },
    { l: 'Trein. monitorados',  v: kpis.totalTreinamentos,                                          c: '#3B82F6' },
  ].filter(d => d.v > 0) : []

  return (
    <div className="content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Dashboard EngMarq</h1>
          <p className="sub">Visão consolidada de conformidade SST · {kpis?.totalEmpresas ?? '—'} empresas · {kpis?.totalColaboradores?.toLocaleString('pt-BR') ?? '—'} colaboradores</p>
        </div>
        <div className="toolbar">
          <button className="tbtn"><Calendar size={14} /> Fev 2026</button>
          <button className="tbtn"><Filter size={14} /> Filtros</button>
          <button className="tbtn"><Download size={14} /> Exportar</button>
          <button className="tbtn primary"><Plus size={14} /> Nova empresa</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label">
            <span>Empresas ativas</span>
            <span className="kpi-ic blue"><Building2 size={15} /></span>
          </div>
          <div className="kpi-value">{kpis?.totalEmpresas ?? '—'}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">cadastradas</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Colaboradores monitorados</span>
            <span className="kpi-ic violet"><Users size={15} /></span>
          </div>
          <div className="kpi-value">{kpis ? kpis.totalColaboradores.toLocaleString('pt-BR') : '—'}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">ativos</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Compliance médio</span>
            <span className="kpi-ic green"><ShieldCheck size={15} /></span>
          </div>
          <div className="kpi-value">{kpis ? `${kpis.compliancePct}%` : '—'}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">meta 95%</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Alertas críticos</span>
            <span className="kpi-ic red"><AlertTriangle size={15} /></span>
          </div>
          <div className="kpi-value" style={{ color: (kpis?.docsVencidos ?? 0) + (kpis?.treinamentosVencidos ?? 0) > 0 ? "var(--red-500)" : undefined }}>
            {kpis ? kpis.docsVencidos + kpis.treinamentosVencidos : '—'}
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">docs + trein. vencidos</span>
          </div>
        </div>
      </div>

      {/* Linha 2: Gauge + Donut */}
      <div className="row-2">

        {/* Gauge compliance geral */}
        <div className="glass">
          <div className="chart-head">
            <div>
              <div className="ctitle">Compliance geral</div>
              <div className="csub">Score consolidado · meta 95%</div>
            </div>
          </div>
          <div className="gauge-wrap">
            <div style={{ position: "relative", width: 180, height: 180 }}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={[{ value: compliancePct }, { value: Math.max(0, 100 - compliancePct) }]}
                    cx="50%" cy="50%"
                    startAngle={225} endAngle={-45}
                    innerRadius={58} outerRadius={76}
                    dataKey="value" strokeWidth={0}
                  >
                    <Cell fill="#F59E0B" />
                    <Cell fill="#F4F6FB" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 800, fontSize: 30, color: "var(--ink-900)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {kpis ? `${compliancePct}%` : '—'}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4 }}>compliance</span>
              </div>
            </div>
            <div className="gauge-cap">
              Meta de <strong>95%</strong> de conformidade. {compliancePct >= 95 ? 'Meta atingida!' : `Faltam ${95 - compliancePct} p.p. para a meta.`}
            </div>
          </div>
        </div>
      </div>

      {/* Linha 3: Donut + Timeline */}
      <div className="row-2">

        {/* Donut: distribuição de pendências */}
        <div className="glass">
          <div className="chart-head">
            <div>
              <div className="ctitle">Distribuição de pendências</div>
              <div className="csub">Por área de conformidade</div>
            </div>
          </div>
          <div className="donut-wrap">
            <div style={{ position: "relative", flexShrink: 0 }}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={donutData.length ? donutData : [{ l: '—', v: 1, c: '#E2E8F0' }]}
                    cx="50%" cy="50%"
                    innerRadius={52} outerRadius={72}
                    startAngle={90} endAngle={-270}
                    dataKey="v" strokeWidth={2} stroke="var(--surface)"
                  >
                    {(donutData.length ? donutData : [{ c: '#E2E8F0' }]).map((entry, idx) => <Cell key={idx} fill={entry.c} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 800, fontSize: 22, color: "var(--ink-900)", lineHeight: 1 }}>
                  {kpis ? kpis.docsVencidos + kpis.docsVencendo + kpis.treinamentosVencidos + kpis.treinamentosVencendo : '—'}
                </span>
                <span style={{ fontSize: 10, color: "var(--ink-400)", marginTop: 3 }}>pendências</span>
              </div>
            </div>
            <div className="donut-legend">
              {donutData.map((d, i) => (
                <div key={i} className="lg">
                  <div className="left"><span className="sw" style={{ background: d.c }} />{d.l}</div>
                  <span className="val">{d.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="glass">
          <div className="chart-head">
            <div>
              <div className="ctitle">Vencimentos próximos</div>
              <div className="csub">Itens críticos das próximas 2 semanas</div>
            </div>
          </div>
          <div className="tl-list">
            {alertas.length === 0 && (
              <div style={{ textAlign:'center', padding:24, color:'var(--ink-400)', fontSize:12 }}>Nenhum vencimento crítico nos próximos dias.</div>
            )}
            {alertas.map((t, i) => {
              const kind: TimelineKind = t.status === 'vencido' ? 'crit' : t.status === 'vencendo' ? 'warn' : 'ok'
              const when = t.dias_restantes === null ? 'Em breve' : t.dias_restantes < 0 ? `Há ${Math.abs(t.dias_restantes)}d` : t.dias_restantes === 0 ? 'Hoje' : `${t.dias_restantes}d`
              return (
                <div key={i} className={`tl-item ${kind}`}>
                  <span className="when">{when}</span>
                  <span className="dot" />
                  <div className="body">{t.titulo}<span className="meta">{t.nome_envolvido ?? t.tipo}</span></div>
                  <ArrowRight size={14} style={{ color: "var(--ink-400)" }} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tabela: empresas em risco */}
      <div className="glass" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="ctitle">Empresas que requerem atenção</div>
            <div className="csub">Ordenadas por score de risco · ações sugeridas</div>
          </div>
          <div className="toolbar">
            <div className="seg">
              <button className="on">Todas</button>
              <button>Crítico</button>
              <button>Atenção</button>
            </div>
            <button className="tbtn"><ArrowRight size={14} /> Ver todas</button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Setor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {empresas.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign:'center', padding:32, color:'var(--ink-400)', fontSize:12 }}>Nenhuma empresa cadastrada.</td></tr>
            )}
            {empresas.slice(0, 10).map((e, i) => (
              <tr key={e.id}>
                <td>
                  <div className="cell-person">
                    <div className="ava" style={{ background: EMPRESA_COLORS[i % 5], borderRadius: 8 }}>
                      {e.razao_social.slice(0, 1)}
                    </div>
                    <div>
                      <div className="name">{e.razao_social}</div>
                      <div className="role">{e.cnpj}</div>
                    </div>
                  </div>
                </td>
                <td>{e.setor ?? '—'}</td>
                <td><span className={`chip ${e.status === 'ativa' ? 'ok' : 'warn'}`}>{e.status}</span></td>
                <td><button className="tbtn ghost"><ArrowRight size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}

/* ============================================================
   EMPRESA — dashboard single-company
   ============================================================ */

const COMPLIANCE_TARGET = 95

function DashboardEmpresa() {
  const { empresaId } = useCurrentProfile()
  const kpisQuery = useDashboardKpis(empresaId)
  const kpis = kpisQuery.data
  const alertasQuery = useDashboardAlertas(empresaId, 6)
  const alertas = alertasQuery.data ?? []
  const treinosQuery = useTreinamentos(empresaId)
  const tiposQuery = useTreinamentoTipos()
  const treinos = treinosQuery.data ?? []
  const tipos = tiposQuery.data ?? []

  const compliancePct = kpis?.compliancePct ?? 0

  const nrDetail = useMemo(() => tipos.map(tipo => {
    const desse = treinos.filter(t => t.treinamento_tipo_id === tipo.id)
    const ok   = desse.filter(t => t.status === 'em_dia').length
    const warn = desse.filter(t => t.status === 'vencendo').length
    const crit = desse.filter(t => t.status === 'vencido').length
    const req  = desse.length
    return { code: tipo.nr_referencia ?? tipo.nome, titulo: tipo.nome, req, ok, warn, crit }
  }).filter(n => n.req > 0), [tipos, treinos])

  const donutData = kpis ? [
    { value: kpis.totalDocumentos - kpis.docsVencidos - kpis.docsVencendo, fill: '#10B981', label: 'Em dia' },
    { value: kpis.docsVencendo,  fill: '#F59E0B', label: 'Vencendo' },
    { value: kpis.docsVencidos,  fill: '#EF4444', label: 'Vencido'  },
  ].filter(d => d.value > 0) : []

  return (
    <div className="content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">{kpis ? `${kpis.totalColaboradores.toLocaleString('pt-BR')} colaboradores ativos` : ''}</p>
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

      {/* KPIs */}
      <div className="kpi-row">
        <div className="glass kpi">
          <div className="kpi-label">
            <span>Colaboradores ativos</span>
            <span className="kpi-ic blue"><Users size={15} /></span>
          </div>
          <div className="kpi-value">{kpis ? kpis.totalColaboradores.toLocaleString('pt-BR') : '—'}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">ativos</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Compliance geral</span>
            <span className="kpi-ic orange"><GraduationCap size={15} /></span>
          </div>
          <div className="kpi-value">{kpis ? `${kpis.compliancePct}%` : '—'}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">meta 95%</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Docs + Trein. vencendo</span>
            <span className="kpi-ic green"><Heart size={15} /></span>
          </div>
          <div className="kpi-value">{kpis ? kpis.docsVencendo + kpis.treinamentosVencendo : '—'}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">próximos 30d</span>
          </div>
        </div>

        <div className="glass kpi">
          <div className="kpi-label">
            <span>Alertas críticos</span>
            <span className="kpi-ic red"><FileText size={15} /></span>
          </div>
          <div className="kpi-value" style={{ color: (kpis?.docsVencidos ?? 0) + (kpis?.treinamentosVencidos ?? 0) > 0 ? "var(--red-500)" : undefined }}>
            {kpis ? kpis.docsVencidos + kpis.treinamentosVencidos : '—'}
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="kpi-foot">vencidos</span>
          </div>
        </div>
      </div>

      {/* Linha 2: Gauge */}
      <div className="row-2">

        {/* Gauge compliance */}
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
                    data={[{ value: compliancePct }, { value: Math.max(0, 100 - compliancePct) }]}
                    cx="50%" cy="50%"
                    startAngle={225} endAngle={-45}
                    innerRadius={58} outerRadius={76}
                    dataKey="value" strokeWidth={0}
                  >
                    <Cell fill="#F59E0B" />
                    <Cell fill="#F4F6FB" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 800, fontSize: 30, color: "var(--ink-900)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {kpis ? `${compliancePct}%` : '—'}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 4 }}>compliance</span>
              </div>
            </div>
            <div className="gauge-cap">
              Meta de <strong>{COMPLIANCE_TARGET}%</strong>. {compliancePct >= COMPLIANCE_TARGET ? 'Meta atingida!' : `Faltam ${COMPLIANCE_TARGET - compliancePct} p.p.`}
            </div>
          </div>
        </div>
      </div>

      {/* Linha 3: NR breakdown + Donut */}
      <div className="row-2">

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
                <div key={nr.code} style={{ display: "grid", gridTemplateColumns: "140px 1fr 44px", gap: 14, alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>{nr.code}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nr.titulo}</div>
                  </div>
                  <div>
                    <div style={{ height: 12, background: "var(--bg)", borderRadius: 6, overflow: "hidden", display: "flex" }}>
                      <div style={{ width: `${(nr.ok   / nr.req) * 100}%`, background: "#10B981" }} />
                      <div style={{ width: `${(nr.warn / nr.req) * 100}%`, background: "#F59E0B" }} />
                      <div style={{ width: `${(nr.crit / nr.req) * 100}%`, background: "#EF4444" }} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 10.5, color: "var(--ink-500)" }}>
                      <span><strong style={{ color: "#059669" }}>{nr.ok}</strong> em dia</span>
                      <span><strong style={{ color: "#D97706" }}>{nr.warn}</strong> vencendo</span>
                      <span><strong style={{ color: "#EF4444" }}>{nr.crit}</strong> vencido</span>
                      <span style={{ marginLeft: "auto" }}>{nr.req} obrigatórios</span>
                    </div>
                  </div>
                  <div style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 700, fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", color: pct >= 85 ? "#059669" : pct >= 70 ? "#D97706" : "#EF4444" }}>
                    {pct}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>

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
                    data={donutData.length ? donutData : [{ value: 1, fill: '#E2E8F0', label: '' }]}
                    cx="50%" cy="50%"
                    innerRadius={52} outerRadius={72}
                    startAngle={90} endAngle={-270}
                    dataKey="value" strokeWidth={2} stroke="var(--surface)"
                  >
                    {(donutData.length ? donutData : [{ fill: '#E2E8F0' }]).map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "Plus Jakarta Sans", fontWeight: 800, fontSize: 22, color: "var(--ink-900)", lineHeight: 1 }}>{kpis ? `${compliancePct}%` : '—'}</span>
                <span style={{ fontSize: 10, color: "var(--ink-400)", marginTop: 3 }}>em dia</span>
              </div>
            </div>
            <div className="donut-legend">
              {donutData.map((d, i) => (
                <div key={i} className="lg">
                  <div className="left"><span className="sw" style={{ background: d.fill }} />{d.label}</div>
                  <span className="val">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline de vencimentos */}
      <div className="glass">
        <div className="chart-head">
          <div>
            <div className="ctitle">Próximos vencimentos</div>
            <div className="csub">Itens da agenda SST das próximas 2 semanas · clique em resolver para ir direto ao item</div>
          </div>
        </div>
        <div className="tl-list">
          {alertas.length === 0 && (
            <div style={{ textAlign:'center', padding:24, color:'var(--ink-400)', fontSize:12 }}>Nenhum vencimento crítico nos próximos dias.</div>
          )}
          {alertas.map((t, i) => {
            const kind: TimelineKind = t.status === 'vencido' ? 'crit' : t.status === 'vencendo' ? 'warn' : 'ok'
            const when = t.dias_restantes === null ? 'Em breve' : t.dias_restantes < 0 ? `Há ${Math.abs(t.dias_restantes)}d` : t.dias_restantes === 0 ? 'Hoje' : `${t.dias_restantes}d`
            return (
              <div key={i} className={`tl-item ${kind}`}>
                <span className="when">{when}</span>
                <span className="dot" />
                <div className="body">{t.titulo}<span className="meta">{t.nome_envolvido ?? t.tipo}</span></div>
                <button className="tbtn primary">Resolver <ArrowRight size={13} /></button>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

/* ============================================================
   Entry — roteamento por role
   ============================================================ */

export default function DashboardPage() {
  const { profile } = useAuth()
  return profile?.role === "admin" ? <DashboardAdmin /> : <DashboardEmpresa />
}
