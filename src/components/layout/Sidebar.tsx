import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/modules/auth/AuthProvider'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  FolderOpen,
  GraduationCap,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/colaboradores', icon: Users, label: 'Colaboradores' },
  { to: '/documentos', icon: FolderOpen, label: 'Documentos' },
  { to: '/treinamentos', icon: GraduationCap, label: 'Treinamentos' },
]

const adminItems = [
  { to: '/configuracoes', icon: Settings, label: 'Configurações' },
]

export function Sidebar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-[#1a365d] text-white transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-[#f5a623] flex items-center justify-center font-black text-[#1a365d] text-sm">
          E
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-black text-sm leading-tight">EngMarq SST</p>
            <p className="text-white/50 text-[10px] truncate">{profile?.email}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? location.pathname === to : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          )
        })}

        {profile?.role === 'admin' && (
          <>
            <div className={cn('my-2 border-t border-white/10', collapsed && 'mx-1')} />
            {adminItems.map(({ to, icon: Icon, label }) => {
              const active = location.pathname.startsWith(to)
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
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

      {/* Footer */}
      <div className="border-t border-white/10 p-2 space-y-1">
        {!collapsed && profile && (
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-white/80 truncate">{profile.full_name}</p>
            <span className="text-[10px] text-white/40 capitalize">{profile.role}</span>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-white/40 hover:bg-white/10 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /><span>Recolher</span></>}
        </button>
      </div>
    </aside>
  )
}
