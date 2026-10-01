import { beforeEach, expect, it, vi } from 'vitest'
import * as service from '@/services/catalogosService'
import { importarColaboradores } from '@/services/colaboradoresService'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession } } }))
const id = '94455974-ed31-40ba-b8af-dc335bf59801'
const company = '74455974-ed31-40ba-b8af-dc335bf59801'
const row = { id, empresa_id: company, nome: 'Catalogo', descricao: null, active: true, riscos: null }
const matrix = [
  { name: 'funcoes', list: service.listarFuncoes, create: service.criarFuncao, update: service.atualizarFuncao, deactivate: service.desativarFuncao },
  { name: 'setores', list: service.listarSetores, create: service.criarSetor, update: service.atualizarSetor, deactivate: service.desativarSetor },
  { name: 'ambientes', list: service.listarAmbientes, create: service.criarAmbiente, update: service.atualizarAmbiente, deactivate: service.desativarAmbiente },
]
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api/v1')
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'caller-jwt' } }, error: null })
})
it.each(matrix)('$name CRUD uses FastAPI and caller JWT without tenant authority', async api => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([row]))
    .mockResolvedValueOnce(Response.json(row)).mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(Response.json({ ...row, active: false }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await api.list('forged')).toHaveLength(1)
  await api.create({ empresa_id: 'forged', nome: 'Catalogo' })
  await api.update(id, { nome: 'Editado', descricao: null })
  expect((await api.deactivate(id)).active).toBe(false)
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    `http://localhost:8000/api/v1/${api.name}`, `http://localhost:8000/api/v1/${api.name}`,
    `http://localhost:8000/api/v1/${api.name}/${id}`, `http://localhost:8000/api/v1/${api.name}/${id}`,
  ])
  expect(fetchMock.mock.calls.map(([, opts]) => opts.method)).toEqual(['GET', 'POST', 'PATCH', 'PATCH'])
  for (const [, opts] of fetchMock.mock.calls) {
    expect(opts.headers.get('Authorization')).toBe('Bearer caller-jwt')
    if (opts.body) expect(JSON.parse(opts.body)).not.toHaveProperty('empresa_id')
  }
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ nome: 'Editado', descricao: null })
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ active: false })
})
it.each(matrix)('$name propagates forbidden writes without database fallback', async api => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code: 'forbidden', message: 'Denied' } }, { status: 403 }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(api.create({ empresa_id: company, nome: 'Catalogo' })).rejects.toMatchObject({ status: 403 })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('employee import creates missing catalogs through API before employee POST', async () => {
  const employee = { id, empresa_id: company, nome: 'Pessoa', cpf: '12345678901', matricula: null,
    funcao_id: id, setor_id: id, ambiente_id: id, data_admissao: '2025-01-01', data_demissao: null,
    active: true, created_at: null, funcao: { id, nome: 'Catalogo' }, setor: { id, nome: 'Catalogo' }, ambiente: { id, nome: 'Catalogo' } }
  const fetchMock = vi.fn().mockImplementation(async (url: URL) => Response.json(String(url).endsWith('/colaboradores') ? employee : row))
  vi.stubGlobal('fetch', fetchMock)
  const result = await importarColaboradores(['Pessoa'], async nome => {
    const input = { empresa_id: company, nome: 'Catalogo' }
    const funcao = await service.criarFuncao(input)
    const setor = await service.criarSetor(input)
    const ambiente = await service.criarAmbiente(input)
    return { empresa_id: company, nome, cpf: employee.cpf, data_admissao: employee.data_admissao,
      funcao_id: funcao.id, setor_id: setor.id, ambiente_id: ambiente.id }
  })
  expect(result).toEqual({ ok: 1, fail: 0 })
  expect(fetchMock.mock.calls.map(([url]) => String(url).split('/').pop())).toEqual(['funcoes', 'setores', 'ambientes', 'colaboradores'])
  for (const [, opts] of fetchMock.mock.calls) {
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).not.toHaveProperty('empresa_id')
  }
})
