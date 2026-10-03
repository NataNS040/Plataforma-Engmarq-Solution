import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import {
  listarAsos,
  listarAsosDoColaborador,
  criarAso,
  atualizarAso,
  deletarAso,
  listarExamesCatalogo,
  type AsoInput,
} from '@/services/examesService'

export function useExames(empresaId: string | null | undefined) {
  const { profile, empresaId: actorEmpresaId, canReadColaboradores } = useCurrentProfile()
  const allowed = !!empresaId && empresaId === actorEmpresaId && canReadColaboradores
  return useQuery({
    queryKey: [...qk.exames.list(empresaId ?? ''), profile?.id, allowed],
    queryFn: () => listarAsos(empresaId!),
    enabled: allowed,
  })
}

export function useExamesDoColaborador(colaboradorId: string | null | undefined) {
  const { profile, empresaId, canReadColaboradores } = useCurrentProfile()
  const allowed = !!colaboradorId && !!empresaId && canReadColaboradores
  return useQuery({
    queryKey: [...qk.exames.byColaborador(colaboradorId ?? ''), profile?.id, empresaId, allowed],
    queryFn: () => listarAsosDoColaborador(colaboradorId!),
    enabled: allowed,
  })
}

export function useCriarExame() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AsoInput) => criarAso(input),
    onSuccess: aso => {
      qc.invalidateQueries({ queryKey: qk.documentos.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
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
      qc.invalidateQueries({ queryKey: qk.documentos.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.exames.all })
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
      qc.invalidateQueries({ queryKey: qk.documentos.all })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.exames.list(empresaId) })
      if (colaboradorId) qc.invalidateQueries({ queryKey: qk.exames.byColaborador(colaboradorId) })
      toast.success('ASO removido.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useExamesCatalogo() {
  const { profile, empresaId, canReadColaboradores } = useCurrentProfile()
  return useQuery({
    queryKey: [...qk.examesCatalogo.list(), profile?.id, empresaId, canReadColaboradores],
    queryFn: listarExamesCatalogo,
    enabled: canReadColaboradores,
    staleTime: 10 * 60_000,
  })
}
