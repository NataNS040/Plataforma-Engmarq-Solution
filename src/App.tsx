import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/modules/auth/LoginPage'
import DashboardPage from '@/modules/dashboard/DashboardPage'
import ColaboradoresPage from '@/modules/colaboradores/ColaboradoresPage'
import DocumentosPage from '@/modules/documentos/DocumentosPage'
import TreinamentosPage from '@/modules/treinamentos/TreinamentosPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="colaboradores" element={<ColaboradoresPage />} />
            <Route path="documentos" element={<DocumentosPage />} />
            <Route path="treinamentos" element={<TreinamentosPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
