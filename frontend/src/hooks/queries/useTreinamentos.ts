import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
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
  const { profile, canReadTreinamentos: allowed } = useCurrentProfile()
  return useQuery({
    queryKey: [...qk.treinamentoTipos.list(), profile?.id, allowed],
    queryFn: () => allowed ? listarTreinamentoTipos() : Promise.resolve([]),
    enabled: allowed,
    staleTime: 10 * 60_000,
  })
}

export function useMatrizTreinamentos(empresaId: string | null | undefined) {
  const { profile, empresaId: own, canReadTreinamentos } = useCurrentProfile()
  const allowed = canReadTreinamentos && !!empresaId && empresaId === own
  return useQuery({
    queryKey: [...qk.matrizTreinamentos.list(empresaId ?? ''), profile?.id, allowed],
    queryFn: () => allowed ? listarMatrizTreinamentos(empresaId!) : Promise.resolve([]),
    enabled: allowed,
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
  const { profile, empresaId: own, canReadTreinamentos } = useCurrentProfile()
  const allowed = canReadTreinamentos && !!empresaId && empresaId === own
  return useQuery({
    queryKey: [...qk.treinamentos.list(empresaId ?? ''), profile?.id, allowed],
    queryFn: () => allowed ? listarTreinamentos(empresaId!) : Promise.resolve([]),
    enabled: allowed,
  })
}

export function useTreinamentosDoColaborador(colaboradorId: string | null | undefined) {
  const { profile, empresaId, canReadTreinamentos } = useCurrentProfile()
  const allowed = canReadTreinamentos && !!colaboradorId
  return useQuery({
    queryKey: [...qk.treinamentos.byColaborador(colaboradorId ?? ''), profile?.id, empresaId, allowed],
    queryFn: () => allowed ? listarTreinamentosDoColaborador(colaboradorId!) : Promise.resolve([]),
    enabled: allowed,
  })
}

export function useRegistrarTreinamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TreinamentoInput) => registrarTreinamento(input),
    onSuccess: t => {
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
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
    onSuccess: () => {
      // Editing may change the participant; invalidate both old and new readers.
      qc.invalidateQueries({ queryKey: qk.treinamentos.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      toast.success('Treinamento atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
