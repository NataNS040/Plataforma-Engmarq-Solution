import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ExamesPage, { resultadoLabel, subtipoLabel } from '@/modules/exames/ExamesPage'
import { apiRequest } from '@/services/api/client'
import { listarAsos, listarAsosDoColaborador, criarAso, atualizarAso, deletarAso, uploadAsoArquivo, abrirAso, asoSchema } from '@/services/examesService'
import { qk } from '@/lib/queryKeys'
import { useExames, useExamesDoColaborador } from '@/hooks/queries/useExames'
const { auth } = vi.hoisted(() => ({ auth: { profile: { id:'actor',empresa_id:'own',role:'empresa',active:true } } }))
vi.mock('@/modules/auth/AuthProvider',()=>({useAuth:()=>auth}))
vi.mock('@/services/api/client',()=>({apiRequest:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
const id='00000000-0000-4000-8000-000000000001'
const row={id,empresa_id:'own',tipo_id:id,colaborador_id:id,titulo:'ASO',numero:null,emissao:null,vencimento:null,
 subtipo_exame:null,resultado_aso:null,observacoes:'Apto',exames_realizados:[],arquivo_path:null,arquivo_url:null,
 created_at:null,status:'vigente',tipo:null,colaborador:{id,nome:'Pessoa'}}
let qc:QueryClient
beforeEach(()=>{
 qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})
 auth.profile.role='empresa';auth.profile.active=true
 vi.mocked(apiRequest).mockReset().mockResolvedValue(row)
 qc.setQueryData([...qk.exames.list('own'),'actor',true],[row])
})
const render=(child:React.ReactNode)=><QueryClientProvider client={qc}>{child}</QueryClientProvider>

it('ASO CRUD/file/list operations all use FastAPI and never send empresa_id as authority',async()=>{
 await listarAsos('forged');await listarAsosDoColaborador(id)
 await criarAso({empresa_id:'forged',colaborador_id:id,titulo:'ASO',subtipo_exame:'admissional'})
 await atualizarAso(id,{resultado_aso:'inapto'});await deletarAso(id)
 const file=new File(['%PDF-1.4'],'a.pdf',{type:'application/pdf'});await uploadAsoArquivo(id,file)
 expect(apiRequest).toHaveBeenNthCalledWith(1,'/exames',expect.any(Object))
 expect(apiRequest).toHaveBeenNthCalledWith(2,`/colaboradores/${id}/exames`,expect.any(Object))
 const create=vi.mocked(apiRequest).mock.calls[2][1]
 expect(create?.json).not.toHaveProperty('empresa_id')
 expect(create?.json).not.toHaveProperty('tipo_id')
 expect(apiRequest).toHaveBeenLastCalledWith(`/exames/${id}/arquivo`,expect.objectContaining({body:file,headers:{'Content-Type':'application/pdf'}}))
})
it('legacy unknown values are not displayed as medical conclusions or subtype defaults',()=>{
 expect(resultadoLabel(null)).toBe('Não informado');expect(subtipoLabel(null)).toContain('legado')
 const html=renderToStaticMarkup(render(<ExamesPage/>))
 expect(html).toContain('Não informado (legado)');expect(html).not.toContain('>Apto<')
 expect(html).not.toContain('+1 ano');expect(html).not.toContain('Sugerir validade')
})
it.each(['empresa','gestor'])('%s has legitimate management actions',role=>{
 auth.profile.role=role
 const html=renderToStaticMarkup(render(<ExamesPage/>))
 expect(html).toContain('Registrar ASO');expect(html).toContain('Editar ASO');expect(html).toContain('Excluir ASO')
})
it('operacional reads without write controls',()=>{
 auth.profile.role='operacional'
 const html=renderToStaticMarkup(render(<ExamesPage/>))
 expect(html).toContain('Pessoa');expect(html).not.toContain('Registrar ASO');expect(html).not.toContain('Editar ASO');expect(html).not.toContain('Excluir ASO')
})
it.each(['admin','superadmin'])('%s sees no operational ASO records',role=>{
 auth.profile.role=role
 const html=renderToStaticMarkup(render(<ExamesPage/>))
 expect(html).toContain('restritos');expect(html).not.toContain('Pessoa')
})
function Consumer(){const q=useExames('own');const e=useExamesDoColaborador(id);return <span>{q.data?.length??0}:{e.data?.length??0}</span>}
it('role changes cannot expose cached ASO data through disabled hooks',()=>{
 qc.setQueryData([...qk.exames.byColaborador(id),'actor','own',true],[row])
 expect(renderToStaticMarkup(render(<Consumer/>))).toContain('1:1')
 auth.profile.role='admin'
 expect(renderToStaticMarkup(render(<Consumer/>))).toContain('0:0')
})
it('error state distinguishes failure from an empty list',()=>{
 const key=[...qk.exames.list('own'),'actor',true]
 qc.getQueryCache().find({queryKey:key})?.setState({status:'error',error:new Error('API indisponível')})
 expect(renderToStaticMarkup(render(<ExamesPage/>))).toContain('API indisponível')
})
it('response parser preserves unknown legacy result and rejects malformed medical values',()=>{
 const valid={...row,empresa_id:id}
 expect(asoSchema.parse(valid).resultado_aso).toBeNull()
 expect(()=>asoSchema.parse({...valid,resultado_aso:'unknown'})).toThrow()
})
it('file access uses only document ID and temporary API link',async()=>{
 const target={opener:'parent',location:{replace:vi.fn()},close:vi.fn()}
 vi.stubGlobal('window',{open:()=>target})
 vi.mocked(apiRequest).mockResolvedValue({url:'https://project.supabase.co/storage/v1/object/sign/documentos/a.pdf?token=synthetic',expires_in:60})
 await abrirAso(id,true)
 expect(apiRequest).toHaveBeenCalledWith(`/exames/${id}/download`,expect.any(Object))
 expect(target.opener).toBeNull();expect(target.location.replace).toHaveBeenCalled()
 vi.mocked(apiRequest).mockRejectedValue(new Error('denied'))
 await expect(abrirAso(id)).rejects.toThrow('denied');expect(target.close).toHaveBeenCalled()
})
