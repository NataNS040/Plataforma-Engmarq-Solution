import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { listarAsos, listarAsosDoColaborador } from '@/services/examesService'
import {
  listarDocumentoTipos,
  listarDocumentos,
  listarDocumentosDoColaborador,
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
  const { isAdmin, profile, empresaId: actorEmpresaId, canReadColaboradores } = useCurrentProfile()
  const allowed = !!empresaId && empresaId === actorEmpresaId && canReadColaboradores
  return useQuery({
    queryKey: [...qk.documentos.list(empresaId ?? ''), isAdmin, profile?.id, allowed],
    queryFn: async () => {
      const [docs, asos] = await Promise.all([listarDocumentos(empresaId!, isAdmin), listarAsos(empresaId!)])
      return [...docs, ...asos.map(a => ({ ...a, created_at: a.created_at ?? '' }))]
    },
    enabled: allowed,
  })
}

export function useDocumentosDoColaborador(colaboradorId: string | null | undefined) {
  return useQuery({
    queryKey: qk.documentos.byColaborador(colaboradorId ?? ''),
    queryFn: async () => {
      const [docs, asos] = await Promise.all([listarDocumentosDoColaborador(colaboradorId!), listarAsosDoColaborador(colaboradorId!)])
      return [...docs, ...asos.map(a => ({ ...a, created_at: a.created_at ?? '' }))]
    },
    enabled: !!colaboradorId,
  })
}

export function useCriarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DocumentoInput) => criarDocumento(input),
    onSuccess: doc => {
      qc.invalidateQueries({ queryKey: qk.exames.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.documentos.list(doc.empresa_id) })
      if (doc.colaborador_id) qc.invalidateQueries({ queryKey: qk.documentos.byColaborador(doc.colaborador_id) })
      toast.success('Documento cadastrado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input, empresaId, colaboradorId }: {
      id: string
      input: Partial<Omit<DocumentoInput, 'empresa_id'>>
      empresaId: string
      colaboradorId?: string | null
    }) => atualizarDocumento(id, input).then(d => ({ ...d, empresaId, colaboradorId })),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: qk.exames.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.documentos.list(result.empresaId) })
      if (result.colaboradorId) qc.invalidateQueries({ queryKey: qk.documentos.byColaborador(result.colaboradorId) })
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
      qc.invalidateQueries({ queryKey: qk.exames.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.documentos.list(empresaId) })
      toast.success('Documento removido.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
