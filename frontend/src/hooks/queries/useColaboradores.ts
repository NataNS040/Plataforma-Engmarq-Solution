import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import {
  listarColaboradores,
  obterColaborador,
  criarColaborador,
  atualizarColaborador,
  desativarColaborador,
  type ColaboradorInput,
  type ColaboradorUpdateInput,
} from '@/services/colaboradoresService'

export function useColaboradores(empresaId: string | null | undefined) {
  const { profile, empresaId: actorEmpresaId, canReadColaboradores } = useCurrentProfile()
  const allowed = canReadColaboradores && !!empresaId && empresaId === actorEmpresaId
  return useQuery({
    queryKey: [...qk.colaboradores.list(empresaId ?? ''), profile?.id, allowed],
    queryFn: () => allowed ? listarColaboradores(empresaId!) : Promise.resolve([]),
    enabled: allowed,
  })
}

export function useColaborador(id: string | null | undefined) {
  const { profile, empresaId, canReadColaboradores } = useCurrentProfile()
  const allowed = canReadColaboradores && !!empresaId && !!id
  return useQuery({
    queryKey: [...qk.colaboradores.detail(id ?? ''), profile?.id, empresaId, allowed],
    queryFn: () => allowed ? obterColaborador(id!) : Promise.resolve(null),
    enabled: allowed,
  })
}

export function useCriarColaborador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ColaboradorInput) => criarColaborador(input),
    onSuccess: colaborador => {
      qc.invalidateQueries({ queryKey: qk.colaboradores.list(colaborador.empresa_id) })
      toast.success(`Colaborador "${colaborador.nome}" cadastrado.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarColaborador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: {
      id: string
      input: ColaboradorUpdateInput
      empresaId: string
    }) => atualizarColaborador(id, input).then(c => ({ ...c, empresaId: c.empresa_id })),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: qk.colaboradores.list(result.empresaId) })
      qc.invalidateQueries({ queryKey: qk.colaboradores.detail(result.id) })
      toast.success('Colaborador atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDesativarColaborador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data_demissao }: { id: string; data_demissao: string }) => desativarColaborador(id, data_demissao),
    onSuccess: colaborador => {
      qc.invalidateQueries({ queryKey: qk.colaboradores.list(colaborador.empresa_id) })
      qc.invalidateQueries({ queryKey: qk.colaboradores.detail(colaborador.id) })
      toast.success('Colaborador inativado. Histórico preservado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
