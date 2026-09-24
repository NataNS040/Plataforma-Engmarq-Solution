import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import {
  atualizarEmpresa,
  criarEmpresa,
  desativarEmpresa,
  listarEmpresas,
  obterEmpresa,
  type EmpresaInput,
} from '@/services/empresasService'

export function useEmpresas() {
  return useQuery({
    queryKey: qk.empresas.list(),
    queryFn: listarEmpresas,
  })
}

export function useEmpresa(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.empresas.detail(id ?? ''),
    queryFn: () => obterEmpresa(id!),
    enabled: !!id,
  })
}

export function useCriarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: EmpresaInput) => criarEmpresa(input),
    onSuccess: empresa => {
      qc.invalidateQueries({ queryKey: qk.empresas.all })
      toast.success(`Empresa "${empresa.razao_social}" cadastrada.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EmpresaInput> }) =>
      atualizarEmpresa(id, input),
    onSuccess: empresa => {
      qc.invalidateQueries({ queryKey: qk.empresas.all })
      qc.invalidateQueries({ queryKey: qk.empresas.detail(empresa.id) })
      toast.success('Empresa atualizada.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDesativarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => desativarEmpresa(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.empresas.all })
      toast.success('Empresa suspensa.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
