import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import {
  listarDocumentoTipos,
  listarDocumentos,
  criarDocumento,
  atualizarDocumento,
  deletarDocumento,
  type DocumentoInput,
} from '@/services/documentosService'

export function useDocumentoTipos() {
  return useQuery({
    queryKey: qk.documentoTipos.list(),
    queryFn: listarDocumentoTipos,
    staleTime: 10 * 60_000, // catálogo muda raramente
  })
}

export function useDocumentos(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.documentos.list(empresaId ?? ''),
    queryFn: () => listarDocumentos(empresaId!),
    enabled: !!empresaId,
  })
}

export function useCriarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DocumentoInput) => criarDocumento(input),
    onSuccess: doc => {
      qc.invalidateQueries({ queryKey: qk.documentos.list(doc.empresa_id) })
      toast.success('Documento cadastrado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input, empresaId }: {
      id: string
      input: Partial<Omit<DocumentoInput, 'empresa_id'>>
      empresaId: string
    }) => atualizarDocumento(id, input).then(d => ({ ...d, empresaId })),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: qk.documentos.list(result.empresaId) })
      toast.success('Documento atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeletarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, empresaId }: { id: string; empresaId: string }) =>
      deletarDocumento(id).then(() => empresaId),
    onSuccess: empresaId => {
      qc.invalidateQueries({ queryKey: qk.documentos.list(empresaId) })
      toast.success('Documento removido.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
