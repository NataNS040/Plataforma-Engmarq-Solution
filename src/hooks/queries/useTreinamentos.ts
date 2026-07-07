import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import {
  listarTreinamentoTipos,
  listarMatrizTreinamentos,
  criarMatrizTreinamento,
  deletarMatrizTreinamento,
  listarTreinamentos,
  listarTreinamentosDoColaborador,
  registrarTreinamento,
  atualizarTreinamento,
  type MatrizInput,
  type TreinamentoInput,
} from '@/services/treinamentosService'

export function useTreinamentoTipos() {
  return useQuery({
    queryKey: qk.treinamentoTipos.list(),
    queryFn: listarTreinamentoTipos,
    staleTime: 10 * 60_000,
  })
}

export function useMatrizTreinamentos(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.matrizTreinamentos.list(empresaId ?? ''),
    queryFn: () => listarMatrizTreinamentos(empresaId!),
    enabled: !!empresaId,
  })
}

export function useCriarMatrizTreinamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MatrizInput) => criarMatrizTreinamento(input),
    onSuccess: mt => {
      qc.invalidateQueries({ queryKey: qk.matrizTreinamentos.list(mt.empresa_id) })
      toast.success('NR adicionada à matriz.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeletarMatrizTreinamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, empresaId }: { id: string; empresaId: string }) =>
      deletarMatrizTreinamento(id).then(() => empresaId),
    onSuccess: empresaId => {
      qc.invalidateQueries({ queryKey: qk.matrizTreinamentos.list(empresaId) })
      toast.success('NR removida da matriz.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useTreinamentos(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.treinamentos.list(empresaId ?? ''),
    queryFn: () => listarTreinamentos(empresaId!),
    enabled: !!empresaId,
  })
}

export function useTreinamentosDoColaborador(colaboradorId: string | null | undefined) {
  return useQuery({
    queryKey: qk.treinamentos.byColaborador(colaboradorId ?? ''),
    queryFn: () => listarTreinamentosDoColaborador(colaboradorId!),
    enabled: !!colaboradorId,
  })
}

export function useRegistrarTreinamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TreinamentoInput) => registrarTreinamento(input),
    onSuccess: t => {
      qc.invalidateQueries({ queryKey: qk.treinamentos.list(t.empresa_id) })
      qc.invalidateQueries({ queryKey: qk.treinamentos.byColaborador(t.colaborador_id) })
      toast.success('Treinamento registrado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarTreinamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input, empresaId, colaboradorId }: {
      id: string
      input: Partial<Omit<TreinamentoInput, 'empresa_id'>>
      empresaId: string
      colaboradorId: string
    }) => atualizarTreinamento(id, input).then(t => ({ ...t, empresaId, colaboradorId })),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: qk.treinamentos.list(result.empresaId) })
      qc.invalidateQueries({ queryKey: qk.treinamentos.byColaborador(result.colaboradorId) })
      toast.success('Treinamento atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
