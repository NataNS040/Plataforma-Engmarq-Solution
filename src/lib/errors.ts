import type { PostgrestError } from '@supabase/supabase-js'

const PG_MESSAGES: Record<string, string> = {
  '23505': 'Registro duplicado. Já existe um item com estes dados.',
  '23503': 'Não é possível concluir: há registros relacionados.',
  '23502': 'Preencha todos os campos obrigatórios.',
  '42501': 'Você não tem permissão para esta operação.',
  'PGRST116': 'Registro não encontrado.',
  'PGRST301': 'Sessão expirada. Faça login novamente.',
}

export class AppError extends Error {
  code?: string
  cause?: unknown
  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    super(message)
    this.name = 'AppError'
    this.code = options?.code
    this.cause = options?.cause
  }
}

function isPostgrestError(err: unknown): err is PostgrestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err &&
    'details' in err
  )
}

/**
 * Normaliza erros do Supabase em AppError com mensagens em português.
 * Loga no console para observabilidade e devolve algo pronto para exibir ao usuário.
 */
export function handleSupabaseError(error: unknown, fallback = 'Ocorreu um erro inesperado.'): AppError {
  if (error instanceof AppError) return error

  if (isPostgrestError(error)) {
    const friendly = PG_MESSAGES[error.code] ?? error.message ?? fallback
    console.error('[supabase]', error.code, error.message, error.details)
    return new AppError(friendly, { code: error.code, cause: error })
  }

  if (error instanceof Error) {
    console.error('[app]', error)
    return new AppError(error.message || fallback, { cause: error })
  }

  console.error('[app] unknown error', error)
  return new AppError(fallback, { cause: error })
}
