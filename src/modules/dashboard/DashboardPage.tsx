import { useAuth } from '@/modules/auth/AuthProvider'
import {
  Users, FileText, GraduationCap, AlertTriangle,
  TrendingUp, Clock, CheckCircle2, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const kpis = [
  {
    label: 'Colaboradores Ativos',
    value: '—',
    sub: 'cadastrados',
    icon: Users,
    color: 'bg-blue-50 text-blue-600',
    border: 'border-blue-100',
    trend: null,
  },
  {
    label: 'Documentos Vigentes',
    value: '—',
    sub: 'em dia',
    icon: CheckCircle2,
    color: 'bg-emerald-50 text-emerald-600',
    border: 'border-emerald-100',
    trend: null,
  },
  {
    label: 'Vencendo em 60 dias',
    value: '—',
    sub: 'requerem atenção',
    icon: Clock,
    color: 'bg-amber-50 text-amber-600',
    border: 'border-amber-100',
    trend: null,
  },
  {
    label: 'Documentos Vencidos',
    value: '—',
    sub: 'ação imediata',
    icon: XCircle,
    color: 'bg-red-50 text-red-600',
    border: 'border-red-100',
    trend: null,
  },
]

const modules = [
  {
    title: 'Colaboradores',
    desc: 'Cadastro, setores, funções e ambientes de trabalho',
    icon: Users,
    href: '/colaboradores',
    color: 'from-blue-600 to-blue-700',
    lightColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    phase: 'Fase 2',
  },
  {
    title: 'Documentos',
    desc: 'PGR, PCMSO, LTCAT e demais documentos com semáforo',
    icon: FileText,
    href: '/documentos',
    color: 'from-violet-600 to-violet-700',
    lightColor: 'bg-violet-50',
    textColor: 'text-violet-600',
    phase: 'Fase 3',
  },
  {
    title: 'Treinamentos',
    desc: 'Matriz por função, validade e certificados',
    icon: GraduationCap,
    href: '/treinamentos',
    color: 'from-emerald-600 to-emerald-700',
    lightColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
    phase: 'Fase 4',
  },
]

export default function DashboardPage() {
  const { profile } = useAuth()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-[#0f2744] to-[#1a365d] rounded-2xl p-6 text-white flex items-center justify-between overflow-hidden relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute right-32 -bottom-6 w-32 h-32 rounded-full bg-[#f5a623]/10" />
        </div>
        <div className="relative z-10">
          <p className="text-white/60 text-sm font-medium mb-1">{greeting},</p>
          <h2 className="text-2xl font-black">{profile?.full_name ?? 'Usuário'} 👋</h2>
          <p className="text-white/50 text-sm mt-1">Aqui está o resumo do sistema hoje</p>
        </div>
        <div className="relative z-10 hidden sm:flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-xl">
          <TrendingUp size={18} className="text-[#f5a623]" />
          <span className="text-sm font-semibold">Sistema ativo</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              className={cn(
                'bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-shadow',
                kpi.border
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', kpi.color)}>
                  <Icon size={20} />
                </div>
              </div>
              <p className="text-3xl font-black text-gray-900 leading-none mb-1">{kpi.value}</p>
              <p className="text-xs font-semibold text-gray-500">{kpi.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{kpi.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Modules grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-gray-900">Módulos do sistema</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full font-medium">
            MVP em desenvolvimento
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modules.map(mod => {
            const Icon = mod.icon
            return (
              <a
                key={mod.title}
                href={mod.href}
                className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group cursor-pointer block"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', mod.lightColor, mod.textColor)}>
                    <Icon size={22} />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                    {mod.phase}
                  </span>
                </div>
                <h4 className="font-black text-gray-900 mb-1 group-hover:text-[#1a365d] transition-colors">
                  {mod.title}
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">{mod.desc}</p>
              </a>
            )
          })}
        </div>
      </div>

      {/* Setup notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={20} className="text-amber-600" />
        </div>
        <div>
          <p className="font-bold text-amber-900 text-sm mb-1">Configure o banco de dados para ver os dados reais</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Execute a migration SQL no Supabase (<code className="bg-amber-100 px-1 rounded">supabase/migrations/001_base_schema.sql</code>) e o seed do primeiro admin para começar a usar o sistema.
          </p>
        </div>
      </div>
    </div>
  )
}

