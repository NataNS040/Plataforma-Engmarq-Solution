import { useAuth } from "@/modules/auth/AuthProvider"
import { Bell, Search } from "lucide-react"

interface HeaderProps {
  title: string
}

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  operacional: "Operacional",
}

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  gestor: "bg-blue-100 text-blue-700",
  operacional: "bg-green-100 text-green-700",
}

export function Header({ title }: HeaderProps) {
  const { profile } = useAuth()
  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
      <div>
        <h1 className="text-lg font-black text-gray-900 leading-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
          <Search size={18} />
        </button>
        <button className="relative w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#f5a623] border-2 border-white" />
        </button>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        {profile && (
          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-9 h-9 rounded-xl bg-[#1a365d] flex items-center justify-center shadow-sm">
              <span className="text-xs font-black text-[#f5a623]">
                {profile.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-gray-800 leading-tight">{profile.full_name}</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${roleColors[profile.role]}`}>
                {roleLabel[profile.role]}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
