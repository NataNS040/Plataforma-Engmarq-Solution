import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import {
  listarColaboradores,
  obterColaborador,
  criarColaborador,
  atualizarColaborador,
  type ColaboradorInput,
} from '@/services/colaboradoresService'

export function useColaboradores(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.colaboradores.list(empresaId ?? ''),
    queryFn: () => listarColaboradores(empresaId!),
    enabled: !!empresaId,
  })
}

export function useColaborador(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.colaboradores.detail(id ?? ''),
    queryFn: () => obterColaborador(id!),
    enabled: !!id,
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
    mutationFn: ({ id, input, empresaId }: {
      id: string
      input: Partial<Omit<ColaboradorInput, 'empresa_id'>>
      empresaId: string
    }) => atualizarColaborador(id, input).then(c => ({ ...c, empresaId })),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: qk.colaboradores.list(result.empresaId) })
      qc.invalidateQueries({ queryKey: qk.colaboradores.detail(result.id) })
      toast.success('Colaborador atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
