import { beforeEach, expect, it, vi } from 'vitest'
import { buscarKpis, buscarAlertasCriticos } from '@/services/dashboardService'
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
// Any direct database/Storage call fails: this mock only exposes Auth.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }))
const own = '74455974-ed31-40ba-b8af-dc335bf59801'
const kpis = { totalColaboradores: 7, totalEmpresas: 1, totalDocumentos: 12,
  totalTreinamentos: 4, docsVencidos: 1, docsVencendo: 2, treinamentosVencidos: 0,
  treinamentosVencendo: 1, compliancePct: 75, operacionalDisponivel: true }
beforeEach(() => {
  vi.stubEnv('VITE_API_URL','http://localhost:8000/api/v1')
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'caller-jwt' } }, error: null })
})
it('B04 dashboard counts and alerts use FastAPI with caller JWT',async()=>{
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(kpis)).mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch',fetch)
  expect(await buscarKpis(own)).toEqual(kpis)
  expect(await buscarAlertasCriticos(own,5)).toEqual([])
  expect(fetch.mock.calls.map(([url])=>String(url))).toEqual([
    `http://localhost:8000/api/v1/dashboard/kpis?scope=${own}`,
    `http://localhost:8000/api/v1/dashboard/alertas?scope=${own}&limit=5`,
  ])
  for(const [,init] of fetch.mock.calls)expect(init.headers.get('Authorization')).toBe('Bearer caller-jwt')
})
it.each([401,403,503])('B04 API denial (%s) has no Supabase fallback',async status=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(Response.json({error:{code:'denied',message:'Denied'}},{status}))))
 await expect(buscarKpis(own)).rejects.toMatchObject({status})
 await expect(buscarAlertasCriticos(own)).rejects.toMatchObject({status})
})
it('B04 invalid scopes and limits fail before any request',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 expect(()=>buscarKpis('forged')).toThrow()
 expect(()=>buscarAlertasCriticos(own,51)).toThrow()
 expect(fetch).not.toHaveBeenCalled()
})
it('B04 invalid response fails closed',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({totalDocumentos:'forged'})))
 await expect(buscarKpis(own)).rejects.toMatchObject({code:'invalid_response'})
})
it('B04 admin commercial response carries no internal counters',async()=>{
 const commercial={...kpis,totalColaboradores:null,totalTreinamentos:null,totalDocumentos:0,
  docsVencidos:0,docsVencendo:0,treinamentosVencidos:null,treinamentosVencendo:null,compliancePct:0,operacionalDisponivel:false}
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json(commercial)))
 expect(await buscarKpis('all')).toEqual(commercial)
})
