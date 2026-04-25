import { useAuth } from "@/modules/auth/AuthProvider"
import {
  Users, FileText, GraduationCap, Plus, RefreshCw, Download,
  Calendar, ChevronDown, HelpCircle, ShieldCheck,
  CheckCircle2, Clock, XCircle, AlertTriangle,
  Activity, TrendingUp, FolderCheck, ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface KPI {
  label: string
  value: string
  sub: string
  icon: any
  iconColor: string
  iconBg: string
  trend?: string
  trendUp?: boolean
}

const kpisVisao: KPI[] = [
  { label: "Total Colaboradores", value: "0", sub: "Cadastrados no sistema", icon: Users, iconColor: "text-blue-600", iconBg: "bg-blue-100" },
  { label: "Colaboradores Ativos", value: "0", sub: "Em atividade", icon: Activity, iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  { label: "Documentos no Sistema", value: "0", sub: "Total cadastrado", icon: FileText, iconColor: "text-violet-600", iconBg: "bg-violet-100" },
  { label: "Treinamentos Realizados", value: "0", sub: "Historico total", icon: GraduationCap, iconColor: "text-amber-600", iconBg: "bg-amber-100" },
]

const kpisDocs: KPI[] = [
  { label: "Vigentes", value: "0", sub: "Em dia", icon: CheckCircle2, iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  { label: "Vencendo (60 dias)", value: "0", sub: "Atencao necessaria", icon: Clock, iconColor: "text-amber-600", iconBg: "bg-amber-100" },
  { label: "Vencidos", value: "0", sub: "Acao imediata", icon: XCircle, iconColor: "text-red-600", iconBg: "bg-red-100" },
  { label: "Taxa de Conformidade", value: "—", sub: "Vigentes / Total", icon: TrendingUp, iconColor: "text-blue-600", iconBg: "bg-blue-100" },
]

const kpisTrein: KPI[] = [
  { label: "Em Dia", value: "0", sub: "Treinamentos validos", icon: ShieldCheck, iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  { label: "Vencendo", value: "0", sub: "Renovar em 30 dias", icon: AlertTriangle, iconColor: "text-amber-600", iconBg: "bg-amber-100" },
  { label: "Pendentes", value: "0", sub: "Nao realizados", icon: ClipboardList, iconColor: "text-orange-600", iconBg: "bg-orange-100" },
  { label: "Cobertura da Matriz", value: "—", sub: "Realizados / Obrigatorios", icon: FolderCheck, iconColor: "text-blue-600", iconBg: "bg-blue-100" },
]

function KpiCard({ kpi }: { kpi: KPI }) {
  const Icon = kpi.icon
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", kpi.iconBg)}>
          <Icon size={22} className={kpi.iconColor} />
        </div>
        <button className="text-gray-300 hover:text-gray-500 mt-1"><HelpCircle size={14} /></button>
      </div>
      <p className="text-4xl font-black text-gray-900 mb-1 leading-none">{kpi.value}</p>
      <p className="text-sm font-semibold text-gray-700 mb-0.5">{kpi.label}</p>
      <p className="text-xs text-gray-400">{kpi.sub}</p>
    </div>
  )
}

function Section({ title, children, accent = "bg-[#1a365d]" }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <div className={cn("w-1 h-5 rounded-full", accent)} />
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </section>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
  const firstName = profile?.full_name?.split(" ")[0] ?? "Usuario"

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Bem-vindo de volta, {firstName}!</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visao geral da gestao SST em {today}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 bg-[#1a365d] hover:bg-[#0f2744] text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors">
            <Plus size={15} /> Novo Colaborador
          </button>
          <button className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Download size={15} /> Exportar
          </button>
          <button className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <RefreshCw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {/* Period filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-2 text-sm font-semibold text-gray-700">
          <Calendar size={15} className="text-gray-400" />
          Filtrar por periodo:
        </div>
        <button className="flex items-center gap-2 bg-gray-50 border border-gray-200 hover:border-gray-300 text-sm text-gray-700 px-3 py-2 rounded-lg transition-colors">
          <Calendar size={14} className="text-gray-400" />
          01/04/2026 - 30/04/2026
          <ChevronDown size={14} className="text-gray-400" />
        </button>
        <button className="text-sm font-medium text-gray-600 hover:text-[#1a365d] hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors">Mes Atual</button>
        <button className="text-sm font-medium text-gray-600 hover:text-[#1a365d] hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors">Ultimos 90 dias</button>
        <button className="text-sm font-medium text-gray-600 hover:text-[#1a365d] hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors">Todo periodo</button>
        <div className="ml-auto flex items-center gap-2">
          <button className="bg-[#1a365d] hover:bg-[#0f2744] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            Aplicar
          </button>
        </div>
      </div>

      {/* Visao Geral */}
      <Section title="Visao Geral" accent="bg-[#1a365d]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {kpisVisao.map(k => <KpiCard key={k.label} kpi={k} />)}
        </div>
      </Section>

      {/* Documentos */}
      <Section title="Status dos Documentos" accent="bg-violet-500">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {kpisDocs.map(k => <KpiCard key={k.label} kpi={k} />)}
        </div>
      </Section>

      {/* Treinamentos */}
      <Section title="Status dos Treinamentos" accent="bg-amber-500">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {kpisTrein.map(k => <KpiCard key={k.label} kpi={k} />)}
        </div>
      </Section>

      {/* Setup notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={18} className="text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">Sistema em fase de implantacao</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Os modulos de Colaboradores, Documentos e Treinamentos estao em desenvolvimento. Em breve voce podera cadastrar e gerenciar os dados reais da sua empresa.
          </p>
        </div>
      </div>
    </div>
  )
}
