import { useAuth } from "@/modules/auth/AuthProvider"
import { Bell, Search } from "lucide-react"

interface HeaderProps {
  title: string
}

export function Header({ title: _title }: HeaderProps) {
  const { profile: _profile } = useAuth()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#1a365d] focus:bg-white transition-all"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <Bell size={17} />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#f5a623] ring-2 ring-white" />
        </button>
      </div>
    </header>
  )
}
