import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import {
  listarFichasEpi,
  listarFichasEpiDoColaborador,
  criarFichaEpi,
  deletarFichaEpi,
  assinarFichaEpi,
  type FichaEpiInput,
} from '@/services/fichasEpiService'

export function useFichasEpi(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.fichasEpi.list(empresaId ?? ''),
    queryFn: () => listarFichasEpi(empresaId!),
    enabled: !!empresaId,
  })
}

export function useFichasEpiDoColaborador(colaboradorId: string | null | undefined) {
  return useQuery({
    queryKey: qk.fichasEpi.byColaborador(colaboradorId ?? ''),
    queryFn: () => listarFichasEpiDoColaborador(colaboradorId!),
    enabled: !!colaboradorId,
  })
}

export function useCriarFichaEpi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: FichaEpiInput) => criarFichaEpi(input),
    onSuccess: ficha => {
      qc.invalidateQueries({ queryKey: qk.fichasEpi.list(ficha.empresa_id) })
      qc.invalidateQueries({ queryKey: qk.fichasEpi.byColaborador(ficha.colaborador_id) })
      toast.success('Ficha de EPI criada.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeletarFichaEpi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, empresaId, colaboradorId }: { id: string; empresaId: string; colaboradorId: string }) =>
      deletarFichaEpi(id).then(() => ({ empresaId, colaboradorId })),
    onSuccess: ({ empresaId, colaboradorId }) => {
      qc.invalidateQueries({ queryKey: qk.fichasEpi.list(empresaId) })
      qc.invalidateQueries({ queryKey: qk.fichasEpi.byColaborador(colaboradorId) })
      toast.success('Ficha de EPI removida.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAssinarFichaEpi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fotoUrl, assinadoPor, empresaId, colaboradorId }: {
      id: string
      fotoUrl: string
      assinadoPor: string
      empresaId: string
      colaboradorId: string
    }) => assinarFichaEpi(id, fotoUrl, assinadoPor).then(f => ({ ...f, empresaId, colaboradorId })),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: qk.fichasEpi.list(result.empresaId) })
      qc.invalidateQueries({ queryKey: qk.fichasEpi.byColaborador(result.colaboradorId) })
      toast.success('Ficha assinada com sucesso.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
