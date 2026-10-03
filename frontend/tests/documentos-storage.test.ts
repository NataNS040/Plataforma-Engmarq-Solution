import { beforeEach, expect, it, vi } from 'vitest'
import { resolverDocumentoPath, assinarDocumento, abrirDocumento, uploadArquivoPrivado } from '@/services/documentosStorage'
import { uploadDocumentoArquivo, criarDocumento, atualizarDocumento } from '@/services/documentosService'
import { uploadCertificado, baixarCertificado } from '@/services/treinamentosService'

const { getSession, profile, upload, sign, from, query, result, toastError } = vi.hoisted(() => {
  const result = { data: {} as unknown, error: null }
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select','eq','neq','ilike','limit','insert','update']) query[method] = vi.fn(() => query)
  query.single = vi.fn(() => Promise.resolve(result))
  return { getSession: vi.fn(), profile: vi.fn(), upload: vi.fn(), sign: vi.fn(), from: vi.fn(), query, result, toastError: vi.fn() }
})
vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession }, storage: { from },
  from: (table: string) => table === 'user_profiles'
    ? { select: () => ({ eq: () => ({ single: profile }) }) } : query,
} }))
const company = '00000000-0000-4000-8000-000000000101'
const other = '00000000-0000-4000-8000-000000000102'
const origin = 'https://synthetic.supabase.co'
const path = `${company}/synthetic.pdf`
const legacy = `${origin}/storage/v1/object/public/documentos/${path}`
const file = new File(['synthetic'], 'file.pdf', { type: 'application/pdf' })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', origin)
  getSession.mockResolvedValue({ data: { session: { user: { id: 'caller' } } }, error: null })
  profile.mockResolvedValue({ data: { empresa_id: company, role: 'gestor', active: true }, error: null })
  from.mockReturnValue({ upload, createSignedUrl: sign })
  upload.mockResolvedValue({ error: null })
  sign.mockResolvedValue({ data: { signedUrl: 'https://synthetic.test/temporary' }, error: null })
  result.data = { id: 'document' }; result.error = null
})
it('recognizes canonical paths and exact-origin legacy public references', () => {
  expect(resolverDocumentoPath({ arquivo_path: path }, company)).toBe(path)
  expect(resolverDocumentoPath({ arquivo_url: legacy }, company)).toBe(path)
  expect(resolverDocumentoPath({ arquivo_path: path, arquivo_url: 'https://external.test/a' }, company)).toBe(path)
})
it.each([
  'https://external.test/file.pdf', legacy.replace('documentos/', 'other/'),
  legacy.replace(company, other), `${legacy}?token=secret`, `${legacy}#fragment`,
  legacy.replace('/public/', '/sign/'), legacy.replace('https:', 'http:'),
  legacy.replace('https://', 'https://user:password@'), 'not a URL',
  `${origin}/storage/v1/object/public/documentos/${company}/../synthetic.pdf`,
  `${origin}/storage/v1/object/public/documentos/${company}/%2e%2e/synthetic.pdf`,
])('rejects malformed, foreign, encoded, signed or external references', async url => {
  await expect(assinarDocumento({ arquivo_url: url }, company)).rejects.toThrow()
  expect(sign).not.toHaveBeenCalled()
})
it.each([`${other}/synthetic.pdf`, `${company}/../file.pdf`, `${company}/a/b.pdf`,
  `${company}/file.pdf?x=1`, `${company}/file%2f.pdf`, `${company}/file.pdf\n`, '',
  'https://external.test/a'])('rejects forged paths', async forged => {
  await expect(assinarDocumento({ arquivo_path: forged }, company)).rejects.toThrow()
  expect(sign).not.toHaveBeenCalled()
})
it('signs a legacy document for 60 seconds and supports attachment download', async () => {
  expect(await assinarDocumento({ arquivo_url: legacy }, company)).toBe('https://synthetic.test/temporary')
  expect(sign).toHaveBeenCalledWith(path, 60)
  await assinarDocumento({ arquivo_path: path }, company, 'Document.pdf')
  expect(sign).toHaveBeenLastCalledWith(path, 60, { download: 'Document.pdf' })
})
it.each(['admin','superadmin'])('denies %s even with a matching company', async role => {
  profile.mockResolvedValue({ data: { empresa_id: company, role, active: true }, error: null })
  await expect(assinarDocumento({ arquivo_path: path }, company)).rejects.toThrow()
  await expect(uploadArquivoPrivado(company, file)).rejects.toThrow()
  expect(from).not.toHaveBeenCalled()
})
it('denies cross-tenant access even if the caller forges the requested company', async () => {
  await expect(assinarDocumento({ arquivo_path: `${other}/synthetic.pdf` }, other)).rejects.toThrow()
  await expect(uploadArquivoPrivado(other, file)).rejects.toThrow()
  expect(from).not.toHaveBeenCalled()
})
it('requires a session and an active caller profile', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null })
  await expect(assinarDocumento({ arquivo_path: path }, company)).rejects.toThrow()
  getSession.mockResolvedValue({ data: { session: { user: { id: 'caller' } } }, error: null })
  profile.mockResolvedValue({ data: { empresa_id: company, role: 'gestor', active: false }, error: null })
  await expect(assinarDocumento({ arquivo_path: path }, company)).rejects.toThrow()
  expect(sign).not.toHaveBeenCalled()
})
it('operacional reads but cannot upload', async () => {
  profile.mockResolvedValue({ data: { empresa_id: company, role: 'operacional', active: true }, error: null })
  await assinarDocumento({ arquivo_path: path }, company)
  await expect(uploadArquivoPrivado(company, file)).rejects.toThrow()
  expect(upload).not.toHaveBeenCalled()
})
it.each([uploadDocumentoArquivo])('Documentos upload returns a path without any URL', async send => {
  const uploaded = await send(company, file)
  expect(uploaded).toMatch(new RegExp(`^${company}/[a-f0-9-]+\\.pdf$`))
  expect(from).toHaveBeenCalledWith('documentos')
  expect(upload).toHaveBeenCalledWith(uploaded, file, expect.objectContaining({ upsert: false }))
  expect(sign).not.toHaveBeenCalled()
})
it('training upload retains certificates namespace and authorized signed access', async () => {
  const uploaded = await uploadCertificado(file, company)
  expect(uploaded).toContain(`${company}/certificados/`)
  await baixarCertificado(uploaded)
  expect(sign).toHaveBeenCalledWith(uploaded, 60)
  await expect(baixarCertificado(path)).rejects.toThrow()
})
it.each([['photo.JPG','image/jpeg'], ['photo.png','image/png'], ['file.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['file.xls','application/vnd.ms-excel'], ['file.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['file.doc','application/msword']])(
  'preserves supported extension %s', async (name, contentType) => {
    const supported = new File(['synthetic'], name, { type: contentType })
    const uploaded = await uploadArquivoPrivado(company, supported)
    expect(upload).toHaveBeenCalledWith(uploaded, supported, expect.objectContaining({ contentType }))
  },
)
it('rejects unsupported files, oversize files and forged upload tenants', async () => {
  await expect(uploadArquivoPrivado(company, new File(['x'], 'file.exe'))).rejects.toThrow()
  await expect(uploadArquivoPrivado(company, new File([new Uint8Array(10485761)], 'file.pdf'))).rejects.toThrow()
  await expect(uploadArquivoPrivado('../forged', file)).rejects.toThrow()
  expect(upload).not.toHaveBeenCalled()
})
it('persists canonical path for Documentos without signed/public URL', async () => {
  const input = { empresa_id: company, tipo_id: 'type', titulo: 'Synthetic', arquivo_path: path }
  await criarDocumento(input)
  expect(query.insert).toHaveBeenLastCalledWith(expect.objectContaining({ arquivo_path: path }))
  expect(query.insert.mock.calls[0][0]).not.toHaveProperty('arquivo_url')
  await atualizarDocumento('document', { arquivo_path: path })
  expect(query.update).toHaveBeenCalledWith({ arquivo_path: path })
})
it('opens a temporary link after authorization and closes the blank tab on failure', async () => {
  const target = { opener: 'parent', location: { replace: vi.fn() }, close: vi.fn() }
  const open = vi.fn(() => target)
  vi.stubGlobal('window', { open })
  await abrirDocumento({ arquivo_url: legacy }, company)
  expect(open).toHaveBeenCalledWith('about:blank', '_blank')
  expect(target.opener).toBeNull()
  expect(target.location.replace).toHaveBeenCalledWith('https://synthetic.test/temporary')
  sign.mockResolvedValue({ data: null, error: { message: 'internal object detail' } })
  await abrirDocumento({ arquivo_path: path }, company)
  expect(target.close).toHaveBeenCalled()
  expect(toastError).toHaveBeenCalledWith(expect.not.stringContaining('internal object detail'))
})
