import { useAuth } from '@/modules/auth/AuthProvider'
import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
}

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  operacional: 'Operacional',
}

export function Header({ title }: HeaderProps) {
  const { profile } = useAuth()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>

      <div className="flex items-center gap-4">
        <button className="relative text-gray-500 hover:text-gray-700 transition-colors">
          <Bell size={20} />
        </button>

        {profile && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#1a365d] flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {profile.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-gray-800 leading-tight">{profile.full_name}</p>
              <p className="text-[10px] text-gray-400">{roleLabel[profile.role]}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
