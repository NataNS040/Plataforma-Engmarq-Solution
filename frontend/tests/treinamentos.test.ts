import { beforeEach, expect, it, vi } from 'vitest'
import * as service from '@/services/treinamentosService'

const { getSession, upload, createSignedUrl } = vi.hoisted(() => ({ getSession: vi.fn(), upload: vi.fn(), createSignedUrl: vi.fn() }))
// No database .from(): business operations must go through FastAPI.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession }, storage: { from: () => ({ upload, createSignedUrl }) } } }))
const id = '94455974-ed31-40ba-b8af-dc335bf59801'
const company = '74455974-ed31-40ba-b8af-dc335bf59801'
const tipo = { id, nome: 'NR', descricao: null, nr_referencia: 'NR-10', validade_meses: 12 }
const input = { empresa_id: company, colaborador_id: id, treinamento_tipo_id: id, data_realizacao: '2025-01-01' }
const row = { ...input, id, data_vencimento: null, carga_horaria: null, instrutor: null, modalidade: null,
  certificado_url: null, created_at: null, status: 'em_dia', colaborador: { id, nome: 'Pessoa' }, treinamento_tipo: tipo }
const matrix = { id, empresa_id: company, funcao_id: id, treinamento_tipo_id: id, obrigatorio: true,
  funcao: { id, nome: 'Funcao' }, treinamento_tipo: tipo }
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api/v1')
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'caller-jwt' } }, error: null })
})
it('lists, detail, participant and requirements use API without tenant selector', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([row])).mockResolvedValueOnce(Response.json(row))
    .mockResolvedValueOnce(Response.json([row])).mockResolvedValueOnce(Response.json([matrix])).mockResolvedValueOnce(Response.json([tipo]))
  vi.stubGlobal('fetch', fetchMock)
  expect(await service.listarTreinamentos('forged')).toEqual([row])
  expect(await service.obterTreinamento(id)).toEqual(row)
  expect(await service.listarTreinamentosDoColaborador(id)).toEqual([row])
  expect(await service.listarMatrizTreinamentos('forged')).toEqual([matrix])
  expect(await service.listarTreinamentoTipos()).toEqual([tipo])
  expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/api/v1/treinamentos', `/api/v1/treinamentos/${id}`, `/api/v1/colaboradores/${id}/treinamentos`,
    '/api/v1/matriz-treinamentos', '/api/v1/treinamento-tipos',
  ])
  for (const [url, options] of fetchMock.mock.calls) {
    expect(new URL(String(url)).search).toBe('')
    expect(options.headers.get('Authorization')).toBe('Bearer caller-jwt')
  }
})
it('creates and edits history without tenant authority', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json(row))
  vi.stubGlobal('fetch', fetchMock)
  await service.registrarTreinamento({ ...input, empresa_id: 'forged' })
  await service.atualizarTreinamento(id, { instrutor: 'Editado', data_vencimento: null })
  expect(fetchMock.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PATCH'])
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('empresa_id')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ instrutor: 'Editado', data_vencimento: null })
  expect(service).not.toHaveProperty('deletarTreinamento')
})
it('training consumer tolerates a null employee relation through FastAPI', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ ...row, colaborador: null }])))
  expect((await service.listarTreinamentos(company))[0].colaborador).toBeNull()
})
it('matrix configuration can be created, changed and removed independently', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(matrix)).mockResolvedValueOnce(Response.json(matrix))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  await service.criarMatrizTreinamento({ empresa_id: 'forged', funcao_id: id, treinamento_tipo_id: id, obrigatorio: true })
  await service.atualizarMatrizTreinamento(id, false)
  await service.deletarMatrizTreinamento(id)
  expect(fetchMock.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PATCH', 'DELETE'])
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('empresa_id')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ obrigatorio: false })
})
it.each([401,403,404,409,422,503])('API error %s has no direct database fallback', async status => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code: 'denied', message: 'Denied' } }, { status }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(service.registrarTreinamento(input)).rejects.toMatchObject({ status })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('certificate upload retains scoped path and download uses a short-lived signed URL', async () => {
  upload.mockResolvedValue({ error: null }); createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://example.test/signed' }, error: null })
  const file = new File(['synthetic'], 'certificate.pdf', { type: 'application/pdf' })
  const path = await service.uploadCertificado(file, company)
  expect(path).toMatch(new RegExp(`^${company}/certificados/[a-f0-9-]+\\.pdf$`))
  expect(upload).toHaveBeenCalledWith(path, file)
  expect(await service.baixarCertificado(path)).toBe('https://example.test/signed')
  expect(createSignedUrl).toHaveBeenCalledWith(path, 60)
})
