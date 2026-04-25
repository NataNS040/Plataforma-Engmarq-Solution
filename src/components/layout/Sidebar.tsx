import { NavLink, useLocation } from "react-router-dom"
import { useAuth } from "@/modules/auth/AuthProvider"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Users, FolderOpen, GraduationCap,
  Settings, LogOut, ChevronLeft, ChevronRight, ShieldCheck,
} from "lucide-react"
import { useState } from "react"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { to: "/colaboradores", icon: Users, label: "Colaboradores" },
  { to: "/documentos", icon: FolderOpen, label: "Documentos" },
  { to: "/treinamentos", icon: GraduationCap, label: "Treinamentos" },
]

const adminItems = [
  { to: "/configuracoes", icon: Settings, label: "Configuracoes" },
]

const roleColors: Record<string, string> = {
  admin: "bg-red-500/20 text-red-300",
  gestor: "bg-blue-500/20 text-blue-300",
  operacional: "bg-green-500/20 text-green-300",
}

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  operacional: "Operacional",
}

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={cn(
      "flex flex-col h-screen bg-[#0f2744] text-white transition-all duration-300 ease-in-out flex-shrink-0",
      collapsed ? "w-[68px]" : "w-64"
    )}>
      <div className={cn(
        "flex items-center gap-3 border-b border-white/10 transition-all duration-300",
        collapsed ? "px-3.5 py-5 justify-center" : "px-5 py-5"
      )}>
        <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-[#f5a623] flex items-center justify-center shadow-lg">
          <ShieldCheck size={18} className="text-[#0f2744]" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div>
            <p className="font-black text-sm text-white leading-tight">EngMarq SST</p>
            <p className="text-white/40 text-[10px] font-medium">Gestao de Seguranca</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-2.5 overflow-y-auto space-y-1">
        {!collapsed && (
          <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest px-3 mb-2">Menu</p>
        )}
        {navItems.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? location.pathname === to : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150",
                collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5",
                active ? "bg-white/15 text-white shadow-sm" : "text-white/55 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
              {!collapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#f5a623]" />}
            </NavLink>
          )
        })}

        {profile?.role === "admin" && (
          <>
            <div className={cn("my-3 border-t border-white/10", collapsed && "mx-1")} />
            {!collapsed && (
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest px-3 mb-2">Admin</p>
            )}
            {adminItems.map(({ to, icon: Icon, label }) => {
              const active = location.pathname.startsWith(to)
              return (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150",
                    collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5",
                    active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              )
            })}
          </>
        )}
      </nav>

      <div className="border-t border-white/10 p-2.5 space-y-1">
        {!collapsed && profile && (
          <div className="px-3 py-2.5 rounded-xl bg-white/5 mb-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-[#f5a623] flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-black text-[#0f2744]">
                  {profile.full_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate leading-tight">{profile.full_name}</p>
                <p className="text-[10px] text-white/40 truncate">{profile.email}</p>
              </div>
            </div>
            <span className={cn("inline-block text-[10px] font-bold px-2 py-0.5 rounded-full", roleColors[profile.role])}>
              {roleLabel[profile.role]}
            </span>
          </div>
        )}
        <button
          onClick={signOut}
          title={collapsed ? "Sair" : undefined}
          className={cn(
            "flex items-center gap-3 w-full rounded-xl text-sm text-white/55 hover:bg-red-500/15 hover:text-red-300 transition-all duration-150",
            collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5"
          )}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "flex items-center gap-3 w-full rounded-xl text-sm text-white/30 hover:bg-white/10 hover:text-white/60 transition-all duration-150",
            collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5"
          )}
        >
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /><span className="text-xs">Recolher</span></>}
        </button>
      </div>
    </aside>
  )
}
