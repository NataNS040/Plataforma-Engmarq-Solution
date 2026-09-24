import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'

export interface ApiErrorDetail {
  field: string
  code: string
}

export class ApiError extends AppError {
  status: number
  details: ApiErrorDetail[]

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message, { code })
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  json?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  timeoutMs?: number
  authenticated?: boolean
  parse?: (data: unknown) => T
}

function endpointUrl(path: string): URL {
  const configured = import.meta.env.VITE_API_URL?.trim()
  if (!configured) {
    throw new ApiError(0, 'api_not_configured', 'Configure VITE_API_URL para acessar a API.')
  }
  let base: URL
  try {
    base = new URL(configured)
  } catch {
    throw new ApiError(0, 'invalid_api_url', 'VITE_API_URL deve ser uma URL HTTP(S) válida.')
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new ApiError(0, 'invalid_api_url', 'VITE_API_URL deve ser uma URL HTTP(S) sem credenciais ou parâmetros.')
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new ApiError(0, 'invalid_api_path', 'O caminho deve ser relativo à API.')
  }
  const url = new URL(path.slice(1), base)
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.hash) {
    throw new ApiError(0, 'invalid_api_path', 'O caminho deve permanecer dentro da API.')
  }
  return url
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function responseError(status: number, payload: unknown): ApiError {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null
  const details = Array.isArray(error?.details)
    ? error.details.filter((item): item is ApiErrorDetail =>
      isRecord(item) && typeof item.field === 'string' && typeof item.code === 'string')
    : []
  const fallback = status === 401 ? 'Sessão inválida ou expirada.'
    : status === 403 ? 'Você não tem permissão para esta operação.'
    : 'Não foi possível concluir a solicitação à API.'
  return new ApiError(
    status,
    typeof error?.code === 'string' ? error.code : `http_${status}`,
    typeof error?.message === 'string' ? error.message : fallback,
    details,
  )
}

/** Uses the existing Supabase session; does not store tokens, sign out or retry writes. */
export async function apiRequest<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const url = endpointUrl(path)
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  headers.delete('Authorization')

  if (options.signal?.aborted) throw new ApiError(0, 'aborted', 'Solicitação cancelada.')

  if (options.authenticated !== false) {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) throw new Error('No session')
      headers.set('Authorization', `Bearer ${data.session.access_token}`)
    } catch {
      throw new ApiError(401, 'unauthorized', 'Faça login para acessar a API.')
    }
  }
  if (options.json !== undefined) headers.set('Content-Type', 'application/json')

  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 15_000)
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    })
    const text = response.status === 204 ? '' : await response.text()
    let payload: unknown
    if (text) {
      try { payload = JSON.parse(text) }
      catch {
        if (!response.ok) throw responseError(response.status, null)
        throw new ApiError(response.status, 'invalid_response', 'A API retornou uma resposta inválida.')
      }
    }
    if (!response.ok) throw responseError(response.status, payload)
    if (options.parse) {
      try { return options.parse(payload) }
      catch { throw new ApiError(response.status, 'invalid_response', 'A API retornou dados incompatíveis.') }
    }
    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut) throw new ApiError(0, 'timeout', 'A API demorou para responder.')
    if (controller.signal.aborted) throw new ApiError(0, 'aborted', 'Solicitação cancelada.')
    throw new ApiError(0, 'network_error', 'Não foi possível conectar à API.')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}
