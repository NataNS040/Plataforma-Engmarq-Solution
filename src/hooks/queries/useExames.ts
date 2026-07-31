import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import {
  listarAsos,
  listarAsosDoColaborador,
  criarAso,
  atualizarAso,
  deletarAso,
  type AsoInput,
} from '@/services/examesService'

export function useExames(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.exames.list(empresaId ?? ''),
    queryFn: () => listarAsos(empresaId!),
    enabled: !!empresaId,
  })
}

export function useExamesDoColaborador(colaboradorId: string | null | undefined) {
  return useQuery({
    queryKey: qk.exames.byColaborador(colaboradorId ?? ''),
    queryFn: () => listarAsosDoColaborador(colaboradorId!),
    enabled: !!colaboradorId,
  })
}

export function useCriarExame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AsoInput) => criarAso(input),
    onSuccess: aso => {
      qc.invalidateQueries({ queryKey: qk.exames.list(aso.empresa_id) })
      if (aso.colaborador_id) {
        qc.invalidateQueries({ queryKey: qk.exames.byColaborador(aso.colaborador_id) })
      }
      toast.success('ASO cadastrado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarExame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input, empresaId, colaboradorId }: {
      id: string
      input: Partial<Omit<AsoInput, 'empresa_id'>>
      empresaId: string
      colaboradorId: string
    }) => atualizarAso(id, input).then(a => ({ ...a, empresaId, colaboradorId })),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: qk.exames.list(result.empresaId) })
      qc.invalidateQueries({ queryKey: qk.exames.byColaborador(result.colaboradorId) })
      toast.success('ASO atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeletarExame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, empresaId, colaboradorId }: { id: string; empresaId: string; colaboradorId?: string | null }) =>
      deletarAso(id).then(() => ({ empresaId, colaboradorId })),
    onSuccess: ({ empresaId, colaboradorId }) => {
      qc.invalidateQueries({ queryKey: qk.exames.list(empresaId) })
      if (colaboradorId) qc.invalidateQueries({ queryKey: qk.exames.byColaborador(colaboradorId) })
      toast.success('ASO removido.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
