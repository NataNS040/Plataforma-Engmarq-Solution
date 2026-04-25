import { NavLink, useLocation } from "react-router-dom"
import { useAuth } from "@/modules/auth/AuthProvider"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Users, FolderOpen, GraduationCap,
  ShieldCheck, ClipboardCheck, BarChart3, FileCheck,
  Settings, ChevronDown, ChevronUp, LogOut, Crown,
} from "lucide-react"
import { useState } from "react"

const mainNav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { to: "/colaboradores", icon: Users, label: "Colaboradores" },
  { to: "/documentos", icon: FolderOpen, label: "Documentos" },
  { to: "/treinamentos", icon: GraduationCap, label: "Treinamentos" },
]

const gestaoNav = [
  { to: "/auditorias", icon: ClipboardCheck, label: "Auditorias", soon: true },
  { to: "/relatorios", icon: BarChart3, label: "Relatorios", soon: true },
  { to: "/conformidade", icon: FileCheck, label: "Conformidade", soon: true },
]

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  gestor: "bg-blue-100 text-blue-700",
  operacional: "bg-emerald-100 text-emerald-700",
}

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  operacional: "Operacional",
}

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [configOpen, setConfigOpen] = useState(false)

  const renderNav = (items: typeof mainNav, isExact = false) =>
    items.map(({ to, icon: Icon, label, ...rest }) => {
      const exact = (rest as any).exact ?? isExact
      const soon = (rest as any).soon
      const active = exact ? location.pathname === to : location.pathname.startsWith(to)
      return (
        <NavLink
          key={to}
          to={soon ? "#" : to}
          onClick={soon ? (e) => e.preventDefault() : undefined}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            active
              ? "bg-[#1a365d] text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
            soon && "opacity-50 cursor-not-allowed hover:bg-transparent"
          )}
        >
          <Icon size={17} className="flex-shrink-0" />
          <span className="flex-1">{label}</span>
          {soon && <span className="text-[9px] font-bold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">EM BREVE</span>}
        </NavLink>
      )
    })

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen flex-shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-2.5 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1a365d] to-[#0f2744] flex items-center justify-center shadow-md">
          <ShieldCheck size={19} className="text-[#f5a623]" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <p className="font-black text-base text-gray-900">EngMarq <span className="text-[#f5a623]">SST</span></p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <p className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Menu</p>
          <div className="space-y-0.5">{renderNav(mainNav)}</div>
        </div>

        <div>
          <p className="px-3 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Gestao</p>
          <div className="space-y-0.5">{renderNav(gestaoNav)}</div>
        </div>

        {profile?.role === "admin" && (
          <div>
            <button
              onClick={() => setConfigOpen(o => !o)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <Settings size={17} />
              <span className="flex-1 text-left">Configuracoes</span>
              {configOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {configOpen && (
              <div className="ml-4 mt-1 pl-4 border-l border-gray-200 space-y-0.5">
                <button className="w-full text-left px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100">Empresa</button>
                <button className="w-full text-left px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100">Usuarios</button>
                <button className="w-full text-left px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100">Setores e Funcoes</button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Upgrade banner */}
      <div className="px-3 pb-3">
        <div className="bg-gradient-to-br from-[#1a365d] to-[#0f2744] rounded-xl p-3 text-center shadow-md">
          <Crown size={18} className="text-[#f5a623] mx-auto mb-1.5" />
          <p className="text-xs font-bold text-white mb-1">Plano Profissional</p>
          <p className="text-[10px] text-white/60 mb-2">Desbloqueie todos os modulos</p>
          <button className="w-full bg-[#f5a623] hover:bg-[#e09010] text-[#0f2744] text-xs font-bold py-1.5 rounded-lg transition-colors">
            Saiba mais
          </button>
        </div>
      </div>

      {/* User card */}
      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1a365d] to-[#0f2744] flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-black text-[#f5a623]">
              {profile?.full_name?.charAt(0).toUpperCase() ?? "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-900 truncate">{profile?.full_name ?? "Usuario"}</p>
            <p className="text-[10px] text-gray-500 truncate">{profile?.email}</p>
          </div>
          <button
            onClick={signOut}
            title="Sair"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>
        {profile && (
          <span className={cn("ml-12 inline-block text-[9px] font-bold px-2 py-0.5 rounded-full", roleColors[profile.role])}>
            {roleLabel[profile.role]}
          </span>
        )}
        <p className="text-center text-[9px] text-gray-300 mt-2">v0.1.0</p>
      </div>
    </aside>
  )
}
