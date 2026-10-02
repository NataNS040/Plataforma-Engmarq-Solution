import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '@/modules/dashboard/DashboardPage'
import DocumentosPage from '@/modules/documentos/DocumentosPage'
const { internal, commercial } = vi.hoisted(()=>({internal:vi.fn(()=>{throw new Error('admin internal query')}),
 commercial:vi.fn(()=>({data:{totalEmpresas:3,operacionalDisponivel:false}}))}))
vi.mock('@/modules/auth/AuthProvider',()=>({useAuth:()=>({profile:{id:'admin',role:'admin',empresa_id:'own',active:true}})}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
vi.mock('@/hooks/queries/useDashboard',()=>({useDashboardKpis:commercial,useDashboardAlertas:internal}))
vi.mock('@/hooks/queries/useEmpresas',()=>({useEmpresas:()=>({data:[]})}))
vi.mock('@/hooks/queries/useDocumentos',()=>({useDocumentos:internal,useDocumentoTipos:internal,
 useCriarDocumento:internal,useDeletarDocumento:internal,useAtualizarDocumento:internal}))
it('B01 admin documents screen never mounts operational queries or create/delete controls',()=>{
 const html=renderToStaticMarkup(<MemoryRouter><DocumentosPage/></MemoryRouter>)
 expect(html).toContain('Acesso restrito')
 expect(html).not.toContain('Novo documento')
 expect(internal).not.toHaveBeenCalled()
})
it('B04 admin dashboard renders commercial data without operational counters or alerts',()=>{
 const html=renderToStaticMarkup(<MemoryRouter><DashboardPage/></MemoryRouter>)
 expect(html).toContain('Empresas cadastradas')
 expect(html).not.toContain('Compliance')
 expect(html).not.toContain('Colaboradores monitorados')
 expect(html).not.toContain('Vencimentos')
 expect(commercial).toHaveBeenCalledWith('all')
 expect(internal).not.toHaveBeenCalled()
})
