import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CatalogosTab } from '@/modules/configuracoes/CatalogosTab'
import { useSetores, useFuncoes, useAmbientes, useAtualizarSetor } from '@/hooks/queries/useCatalogos'
import { qk } from '@/lib/queryKeys'

const { auth, update } = vi.hoisted(() => ({ auth: {
  profile: { id: 'actor', empresa_id: 'own', role: 'empresa', active: true },
}, update: vi.fn() }))
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/services/catalogosService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/catalogosService')>(), atualizarSetor: update,
}))
let qc: QueryClient
const row = { id: 'catalog', empresa_id: 'own', nome: 'Visivel', descricao: null, active: true }
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  auth.profile.role = 'empresa'; auth.profile.active = true
  for (const key of [qk.setores, qk.funcoes, qk.ambientes]) qc.setQueryData([...key.list('own'), 'actor', true], [row])
  update.mockReset().mockResolvedValue(row)
})
function render(children: ReactNode) { return renderToStaticMarkup(<QueryClientProvider client={qc}>{children}</QueryClientProvider>) }
it.each(['empresa', 'gestor'])('%s has create, edit and deactivate controls', role => {
  auth.profile.role = role
  const html = render(<CatalogosTab empresaId="own" />)
  for (const text of ['Visivel', 'Adicionar', 'title="Editar"', 'title="Desativar"']) expect(html).toContain(text)
})
it('operacional reads without write controls', () => {
  auth.profile.role = 'operacional'
  const html = render(<CatalogosTab empresaId="own" />)
  expect(html).toContain('Visivel')
  for (const text of ['Adicionar', 'title="Editar"', 'title="Desativar"']) expect(html).not.toContain(text)
})
it('admin, inactive profile and foreign company cannot mount catalogs', () => {
  expect(render(<CatalogosTab empresaId="foreign" />)).toBe('')
  auth.profile.active = false
  expect(render(<CatalogosTab empresaId="own" />)).toBe('')
  auth.profile.active = true; auth.profile.role = 'admin'
  expect(render(<CatalogosTab empresaId="own" />)).toBe('')
})
function Consumer({ company }: { company: string | null }) {
  const queries = [useSetores(company), useFuncoes(company), useAmbientes(company)]
  return <span>{queries.map(q => `${q.data?.length ?? 0}:${q.isLoading}`).join('|')}</span>
}
it.each(['empresa', 'gestor', 'operacional', 'admin'])('%s hooks isolate tenant and cached data', role => {
  auth.profile.role = role
  expect(render(<Consumer company="own" />)).toContain(role === 'admin' ? '0:false|0:false|0:false' : '1:false|1:false|1:false')
  expect(render(<Consumer company="foreign" />)).toContain('0:false|0:false|0:false')
  expect(render(<Consumer company={null} />)).toContain('0:false|0:false|0:false')
  auth.profile.active = false
  expect(render(<Consumer company="own" />)).toContain('0:false|0:false|0:false')
})
it('editing invalidates catalog and embedded employee/training labels', async () => {
  qc.setQueryData(qk.colaboradores.all, [row]); qc.setQueryData(qk.matrizTreinamentos.all, [row])
  let mutation: ReturnType<typeof useAtualizarSetor> | undefined
  function Capture() { mutation = useAtualizarSetor(); return null }
  render(<Capture />)
  await mutation!.mutateAsync({ id: 'catalog', input: { nome: 'Editado' } })
  expect(update).toHaveBeenCalledWith('catalog', { nome: 'Editado' })
  for (const key of [[...qk.setores.list('own'), 'actor', true], qk.colaboradores.all, qk.matrizTreinamentos.all]) {
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
  }
})
