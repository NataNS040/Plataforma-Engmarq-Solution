import { NavLink } from "react-router-dom"
import { useAuth } from "@/modules/auth/AuthProvider"
import { useCurrentProfile } from "@/hooks/useCurrentProfile"
import { useDashboardKpis } from "@/hooks/queries/useDashboard"
import {
  LayoutDashboard, Building2, Users, GraduationCap,
  FileText, Heart, BarChart3, Settings, LogOut,
} from "lucide-react"
import { BrandMark } from "@/components/ui/BrandMark"
import { APP_SHORT_NAME } from "@/config/brand"

type NavItem = {
  to: string
  label: string
  icon: React.ElementType
  exact?: boolean
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
      { to: "/empresas", label: "Empresas", icon: Building2 },
      { to: "/colaboradores", label: "Colaboradores", icon: Users },
    ],
  },
  {
    group: "Conformidade",
    items: [
      { to: "/treinamentos", label: "Treinamentos", icon: GraduationCap },
      { to: "/documentos", label: "Documentos", icon: FileText },
      { to: "/exames", label: "Exames", icon: Heart },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
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
      { to: "/colaboradores", label: "Colaboradores", icon: Users },
    ],
  },
  {
    group: "Conformidade",
    items: [
      { to: "/treinamentos", label: "Treinamentos NR", icon: GraduationCap },
      { to: "/documentos", label: "Documentos", icon: FileText },
      { to: "/exames", label: "Exames", icon: Heart },
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
  const { empresaId, isAdmin } = useCurrentProfile()

  const kpisQuery = useDashboardKpis(isAdmin ? 'all' : empresaId)
  const kpis = kpisQuery.data

  const navGroups = profile?.role === "admin" ? ADMIN_NAV : EMPRESA_NAV

  // Badges vêm só de métricas reais já calculadas no dashboard — nenhum
  // número decorativo. Item sem métrica correspondente fica sem badge.
  const badges: Record<string, { value: number; danger?: boolean }> = kpis ? (
    isAdmin
      ? {
          "/empresas": { value: kpis.totalEmpresas },
          "/relatorios": { value: kpis.docsVencidos + kpis.treinamentosVencidos, danger: true },
        }
      : {
          "/colaboradores": { value: kpis.totalColaboradores },
        }
  ) : {}

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : "?"
  const roleLabel =
    profile?.role === "admin" ? `${APP_SHORT_NAME} · Admin` :
    profile?.role === "empresa" ? "Acesso Empresa" :
    profile?.role === "gestor" ? "Gestor" : "Operacional"

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sb-brand">
        <BrandMark />
      </div>

      {/* Navigation */}
      <nav className="sb-nav">
        {navGroups.map(({ group, items }) => (
          <div key={group}>
            <div className="sb-section-label">{group}</div>
            {items.map(({ to, label, icon: Icon, exact, soon }) => {
              const badge = badges[to]
              return (
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
                  {badge !== undefined && badge.value > 0 && (
                    <span className={"nav-badge" + (badge.danger ? " danger" : "")}>
                      {badge.value}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer CTA */}
      <div className="sb-footer">
        <h4>{profile?.role === "admin" ? "Auditoria 2026" : `Suporte ${APP_SHORT_NAME}`}</h4>
        <p>
          {profile?.role === "admin"
            ? (kpis && kpis.docsVencidos + kpis.treinamentosVencidos > 0
                ? `${kpis.docsVencidos + kpis.treinamentosVencidos} pendências críticas precisam de atenção.`
                : "Nenhuma pendência crítica no momento.")
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
