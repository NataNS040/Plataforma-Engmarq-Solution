import { Outlet, useLocation } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/colaboradores": "Colaboradores",
  "/documentos": "Documentos",
  "/treinamentos": "Treinamentos",
  "/configuracoes": "Configuracoes",
}

export function AppLayout() {
  const location = useLocation()
  const title = pageTitles[location.pathname] ?? "EngMarq SST"
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f8fafc]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-screen-xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
