import { NavLink } from "react-router-dom"
import { useAuth } from "@/modules/auth/AuthProvider"
import {
  LayoutDashboard, Building2, Users, GraduationCap,
  FileText, Heart, BarChart3, Settings, LogOut, ShieldCheck,
} from "lucide-react"

type NavItem = {
  to: string
  label: string
  icon: React.ElementType
  exact?: boolean
  badge?: number
  badgeDanger?: boolean
  soon?: boolean
}

type NavGroup = {
  group: string
  items: NavItem[]
}

const ADMIN_NAV: NavGroup[] = [
  {
    group: "Principal",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/empresas", label: "Empresas", icon: Building2, badge: 24 },
      { to: "/colaboradores", label: "Colaboradores", icon: Users },
    ],
  },
  {
    group: "Conformidade",
    items: [
      { to: "/treinamentos", label: "Treinamentos", icon: GraduationCap },
      { to: "/documentos", label: "Documentos", icon: FileText },
      { to: "/exames", label: "Exames", icon: Heart },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, badge: 3, badgeDanger: true },
    ],
  },
  {
    group: "Sistema",
    items: [
      { to: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
]

const EMPRESA_NAV: NavGroup[] = [
  {
    group: "Principal",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/colaboradores", label: "Colaboradores", icon: Users, badge: 247 },
    ],
  },
  {
    group: "Conformidade",
    items: [
      { to: "/treinamentos", label: "Treinamentos NR", icon: GraduationCap },
      { to: "/documentos", label: "Documentos", icon: FileText },
      { to: "/exames", label: "Exames", icon: Heart, badge: 8, badgeDanger: true },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    group: "Sistema",
    items: [
      { to: "/configuracoes", label: "Minha empresa", icon: Building2 },
    ],
  },
]

export function Sidebar() {
  const { profile, signOut } = useAuth()

  const navGroups = profile?.role === "admin" ? ADMIN_NAV : EMPRESA_NAV

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : "?"
  const roleLabel = profile?.role === "admin" ? "EngMarq · Admin" : "Empresa"

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sb-brand">
        <div className="brand-mark">
          <ShieldCheck size={20} color="#0B1426" strokeWidth={2.5} />
        </div>
        <div>
          <div className="brand-name">EngMarq Vision</div>
          <div className="brand-tag">Gestão SST</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sb-nav">
        {navGroups.map(({ group, items }) => (
          <div key={group}>
            <div className="sb-section-label">{group}</div>
            {items.map(({ to, label, icon: Icon, exact, badge, badgeDanger, soon }) => (
              <NavLink
                key={to}
                to={soon ? "#" : to}
                end={exact}
                onClick={soon ? (e) => e.preventDefault() : undefined}
                className={({ isActive }) =>
                  "nav-item" + (isActive && !soon ? " active" : "")
                }
              >
                <Icon size={16} />
                <span style={{ flex: 1 }}>{label}</span>
                {badge !== undefined && (
                  <span className={"nav-badge" + (badgeDanger ? " danger" : "")}>
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer CTA */}
      <div className="sb-footer">
        <h4>{profile?.role === "admin" ? "Auditoria 2026" : "Suporte EngMarq"}</h4>
        <p>
          {profile?.role === "admin"
            ? "3 empresas precisam de atenção esta semana."
            : "Tire dúvidas com os profissionais de SST."}
        </p>
        <button className="cta">
          {profile?.role === "admin" ? "Ver alertas" : "Falar com SST"}
        </button>
      </div>

      {/* User strip */}
      <div className="sb-user">
        <div className="sb-ava">{initials}</div>
        <div className="sb-user-info">
          <div className="sb-user-name">{profile?.full_name ?? "Usuário"}</div>
          <div className="sb-user-role">{roleLabel}</div>
        </div>
        <button className="sb-logout" onClick={signOut} title="Sair">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}
