import {beforeEach,expect,it,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {uploadEmpresaLogo,downloadEmpresaLogo} from '@/services/empresasService'
import {LogoCard} from '@/modules/configuracoes/ConfiguracoesPage'
const own='74455974-ed31-40ba-b8af-dc335bf59801'
const other='cd60a82f-8ca9-4024-95a6-a136a28208ea'
const {upload,download,from,auth,company}=vi.hoisted(()=>({
 upload:vi.fn(),download:vi.fn(),from:vi.fn(),
 auth:{profile:{id:'actor',role:'empresa',active:true,empresa_id:'74455974-ed31-40ba-b8af-dc335bf59801'}},
 company:{id:'74455974-ed31-40ba-b8af-dc335bf59801',status:'ativa',logo_url:null},
}))
vi.mock('@/lib/supabase',()=>({supabase:{storage:{from}}}))
vi.mock('@/modules/auth/AuthProvider',()=>({useAuth:()=>auth}))
vi.mock('@/hooks/queries/useEmpresas',()=>({useEmpresa:()=>({data:company}),useAtualizarEmpresa:()=>({mutateAsync:vi.fn()})}))
beforeEach(()=>{
 vi.clearAllMocks();from.mockReturnValue({upload,download})
 upload.mockResolvedValue({error:null});download.mockResolvedValue({data:new Blob(['image']),error:null})
 auth.profile.role='empresa';auth.profile.active=true;company.status='ativa'
})
it.each([['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']])('uploads canonical private %s path and keeps stable reference',async(type,ext)=>{
 const file=new File(['image'],'ignored.UPPERCASE',{type})
 const ref=await uploadEmpresaLogo(own,file)
 expect(ref).toBe(`logos/${own}/logo.${ext}`)
 expect(from).toHaveBeenCalledWith('logos')
 expect(upload).toHaveBeenCalledWith(`${own}/logo.${ext}`,file,{cacheControl:'0',contentType:type,upsert:true})
 const blob=await downloadEmpresaLogo(own,ref)
 expect(blob).toBeInstanceOf(Blob)
 expect(download).toHaveBeenCalledWith(`${own}/logo.${ext}`)
})
it.each(['image/svg+xml','application/pdf',''])('rejects unsupported MIME %s before HTTP',async type=>{
 await expect(uploadEmpresaLogo(own,new File(['image'],'fake.png',{type}))).rejects.toThrow()
 expect(upload).not.toHaveBeenCalled()
})
it('rejects oversized and empty files and invalid tenant',async()=>{
 for(const file of [new File([],'logo.png',{type:'image/png'}),new File([new Uint8Array(2097153)],'logo.png',{type:'image/png'})])
  await expect(uploadEmpresaLogo(own,file)).rejects.toThrow()
 await expect(uploadEmpresaLogo('bad',new File(['image'],'logo.png',{type:'image/png'}))).rejects.toThrow()
 expect(upload).not.toHaveBeenCalled()
})
it.each([`logos/${other}/logo.png`,`https://example/logo.png`,`${own}/logo.png`,`logos/${own}/../logo.png`])('does not render foreign/external reference %s',async ref=>{
 await expect(downloadEmpresaLogo(own,ref)).rejects.toThrow()
 expect(download).not.toHaveBeenCalled()
})
it('propagates upload and download authorization failures',async()=>{
 upload.mockResolvedValue({error:new Error('Denied')})
 await expect(uploadEmpresaLogo(own,new File(['image'],'logo.png',{type:'image/png'}))).rejects.toThrow('Denied')
 download.mockResolvedValue({error:new Error('Denied'),data:null})
 await expect(downloadEmpresaLogo(own,`logos/${own}/logo.png`)).rejects.toThrow('Denied')
})
it.each(['empresa','gestor'])('%s sees upload control',role=>{
 auth.profile.role=role
 expect(renderToStaticMarkup(<LogoCard empresaId={own} brandLabel="Tenant"/>)).toContain('Adicionar logo')
})
it.each(['admin','operacional'])('%s has no upload control',role=>{
 auth.profile.role=role
 expect(renderToStaticMarkup(<LogoCard empresaId={own} brandLabel="Tenant"/>)).not.toContain('Adicionar logo')
})
it('inactive, suspended and foreign tenant have no upload control',()=>{
 auth.profile.active=false
 expect(renderToStaticMarkup(<LogoCard empresaId={own} brandLabel="Tenant"/>)).not.toContain('Adicionar logo')
 auth.profile.active=true;company.status='suspensa'
 expect(renderToStaticMarkup(<LogoCard empresaId={own} brandLabel="Tenant"/>)).not.toContain('Adicionar logo')
 company.status='ativa'
 expect(renderToStaticMarkup(<LogoCard empresaId={other} brandLabel="Tenant"/>)).not.toContain('Adicionar logo')
})
