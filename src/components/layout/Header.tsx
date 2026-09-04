import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/modules/auth/AuthProvider"
import { useCurrentProfile } from "@/hooks/useCurrentProfile"
import { useDashboardAlertas } from "@/hooks/queries/useDashboard"
import {
  Search, Bell, HelpCircle, User, Settings,
  Activity, ShieldCheck, ChevronRight, LogOut,
} from "lucide-react"
import { APP_SHORT_NAME } from "@/config/brand"

type NotifTone = "crit" | "warn" | "ok" | "info"

type Notification = {
  id: number
  tone: NotifTone
  title: string
  meta: string
  unread: boolean
}

function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onClose: () => void
) {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [ref, onClose])
}

export function Header() {
  const { profile, signOut } = useAuth()
  const { empresaId, isAdmin } = useCurrentProfile()
  const navigate = useNavigate()

  // Alertas reais do banco como notificações
  const alertasQuery = useDashboardAlertas(isAdmin ? 'all' : empresaId, 5)
  const alertasReais = alertasQuery.data ?? []

  const [openNotif, setOpenNotif] = useState(false)
  const [openProfile, setOpenProfile] = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [searchTerm, setSearchTerm] = useState("")

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Notificações vêm só de alertas reais (documentos/treinamentos vencendo
  // ou vencidos) — sem lista fake de fallback quando não há nada pendente.
  useEffect(() => {
    setNotifs(alertasReais.map((a, i) => ({
      id: i + 1,
      tone: a.status === 'vencido' ? 'crit' : 'warn',
      title: a.nome_envolvido
        ? `${a.nome_envolvido} — ${a.titulo}`
        : a.titulo,
      meta: a.vencimento
        ? `vence ${new Date(a.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}`
        : '',
      unread: true,
    })))
  }, [alertasReais])

  useClickOutside(notifRef, () => setOpenNotif(false))
  useClickOutside(profileRef, () => setOpenProfile(false))

  const unreadCount = notifs.filter(n => n.unread).length
  const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, unread: false })))

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : "?"

  const searchPlaceholder = profile?.role === "admin"
    ? "Buscar empresa, colaborador, NR…"
    : "Buscar colaborador, treinamento…"

  const roleName = profile?.role === "admin" ? "Coordenadora SST" : "DP / RH"
  const companyName = profile?.role === "admin" ? APP_SHORT_NAME : "Empresa"

  function submitSearch() {
    const term = searchTerm.trim()
    if (!term) return
    navigate(`/colaboradores?q=${encodeURIComponent(term)}`)
  }

  return (
    <header className="topbar">
      {/* Search — leva para Colaboradores com o termo pré-filtrado */}
      <div className="topbar-search">
        <Search size={14} />
        <input
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submitSearch() }}
        />
        <kbd>⌘K</kbd>
      </div>

      <div className="topbar-spacer" />

      {/* Notifications */}
      <div className="tb-anchor" ref={notifRef}>
        <button
          className={"icon-btn" + (openNotif ? " on" : "")}
          title="Notificações"
          aria-label="Notificações"
          onClick={() => { setOpenNotif(o => !o); setOpenProfile(false) }}
        >
          <Bell size={17} />
          {unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
        </button>

        {openNotif && (
          <div className="pop notif-pop" role="dialog" aria-label="Notificações">
            <div className="pop-head">
              <div>
                <div className="pop-title">Notificações</div>
                <div className="pop-sub">
                  {unreadCount > 0 ? `${unreadCount} não lidas` : "Tudo em dia"}
                </div>
              </div>
              <button className="pop-link" onClick={markAllRead} disabled={unreadCount === 0}>
                Marcar tudo como lido
              </button>
            </div>

            <div className="pop-tabs">
              <button className="on">
                Todas <span className="count">{notifs.length}</span>
              </button>
              <button>
                Críticas <span className="count">{notifs.filter(n => n.tone === "crit").length}</span>
              </button>
              <button>
                Compliance <span className="count">{notifs.filter(n => n.tone === "warn").length}</span>
              </button>
            </div>

            {notifs.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--ink-500)", fontSize: 12.5 }}>
                Nenhum alerta no momento — tudo em dia.
              </div>
            ) : (
              <ul className="notif-list">
                {notifs.map(n => (
                  <li
                    key={n.id}
                    className={["notif-item", n.tone, n.unread ? "unread" : ""].filter(Boolean).join(" ")}
                  >
                    <span className="nf-dot" />
                    <div className="nf-body">
                      <div className="nf-title">{n.title}</div>
                      <div className="nf-meta">{n.meta}</div>
                    </div>
                    {n.unread && <span className="nf-pill">novo</span>}
                  </li>
                ))}
              </ul>
            )}

            <div className="pop-foot">
              <button className="tbtn ghost">Configurar alertas</button>
              <button className="tbtn">
                Ver tudo <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Help */}
      <button className="icon-btn" title="Ajuda" aria-label="Ajuda">
        <HelpCircle size={17} />
      </button>

      {/* Profile */}
      <div className="tb-anchor" ref={profileRef}>
        <button
          className={"topbar-avatar" + (openProfile ? " on" : "")}
          onClick={() => { setOpenProfile(o => !o); setOpenNotif(false) }}
          title="Perfil"
          aria-label="Menu do perfil"
        >
          {initials}
        </button>

        {openProfile && (
          <div className="pop profile-pop" role="menu" aria-label="Perfil">
            <div className="pp-hero">
              <div className="pp-ava">{initials}</div>
              <div className="pp-id">
                <div className="pp-name">{profile?.full_name ?? "Usuário"}</div>
                <div className="pp-email">{profile?.email}</div>
                <div className="pp-role">
                  <ShieldCheck size={11} />
                  <span>{roleName} · {companyName}</span>
                </div>
              </div>
            </div>

            <div className="pp-section">
              <button className="pp-item" onClick={() => { navigate("/perfil"); setOpenProfile(false) }}>
                <User size={15} /><span>Meu perfil</span>
              </button>
              <button className="pp-item" onClick={() => { navigate("/configuracoes"); setOpenProfile(false) }}>
                <Settings size={15} /><span>Configurações</span>
              </button>
              <button className="pp-item">
                <Activity size={15} /><span>Atividade recente</span>
              </button>
            </div>

            <div className="pp-section">
              <div className="pp-label">Preferências</div>
              <button className="pp-item">
                <Bell size={15} /><span>Notificações</span><span className="pp-kbd">⌘N</span>
              </button>
              <button className="pp-item">
                <HelpCircle size={15} /><span>Ajuda &amp; suporte</span>
              </button>
            </div>

            <div className="pp-section danger">
              <button className="pp-item" onClick={() => { signOut(); setOpenProfile(false) }}>
                <LogOut size={15} /><span>Sair da conta</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
