import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import {
  listarSetores, criarSetor, atualizarSetor, desativarSetor, type SetorInput,
  listarFuncoes, criarFuncao, atualizarFuncao, desativarFuncao, type FuncaoInput,
  listarAmbientes, criarAmbiente, atualizarAmbiente, desativarAmbiente, type AmbienteInput,
} from '@/services/catalogosService'

// ---------------------------------------------------------------------------
// Setores
// ---------------------------------------------------------------------------
export function useSetores(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.setores.list(empresaId ?? ''),
    queryFn: () => listarSetores(empresaId!),
    enabled: !!empresaId,
  })
}

export function useCriarSetor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SetorInput) => criarSetor(input),
    onSuccess: setor => {
      qc.invalidateQueries({ queryKey: qk.setores.list(setor.empresa_id) })
      toast.success(`Setor "${setor.nome}" criado.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarSetor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SetorInput> & { active?: boolean } }) =>
      atualizarSetor(id, input),
    onSuccess: setor => {
      qc.invalidateQueries({ queryKey: qk.setores.list(setor.empresa_id) })
      toast.success('Setor atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDesativarSetor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => desativarSetor(id),
    onSuccess: setor => {
      qc.invalidateQueries({ queryKey: qk.setores.list(setor.empresa_id) })
      toast.success('Setor desativado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ---------------------------------------------------------------------------
// Funções
// ---------------------------------------------------------------------------
export function useFuncoes(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.funcoes.list(empresaId ?? ''),
    queryFn: () => listarFuncoes(empresaId!),
    enabled: !!empresaId,
  })
}

export function useCriarFuncao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: FuncaoInput) => criarFuncao(input),
    onSuccess: funcao => {
      qc.invalidateQueries({ queryKey: qk.funcoes.list(funcao.empresa_id) })
      toast.success(`Função "${funcao.nome}" criada.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarFuncao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<FuncaoInput> & { active?: boolean } }) =>
      atualizarFuncao(id, input),
    onSuccess: funcao => {
      qc.invalidateQueries({ queryKey: qk.funcoes.list(funcao.empresa_id) })
      toast.success('Função atualizada.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDesativarFuncao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => desativarFuncao(id),
    onSuccess: funcao => {
      qc.invalidateQueries({ queryKey: qk.funcoes.list(funcao.empresa_id) })
      toast.success('Função desativada.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

// ---------------------------------------------------------------------------
// Ambientes
// ---------------------------------------------------------------------------
export function useAmbientes(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: qk.ambientes.list(empresaId ?? ''),
    queryFn: () => listarAmbientes(empresaId!),
    enabled: !!empresaId,
  })
}

export function useCriarAmbiente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AmbienteInput) => criarAmbiente(input),
    onSuccess: ambiente => {
      qc.invalidateQueries({ queryKey: qk.ambientes.list(ambiente.empresa_id) })
      toast.success(`Ambiente "${ambiente.nome}" criado.`)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarAmbiente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AmbienteInput> & { active?: boolean } }) =>
      atualizarAmbiente(id, input),
    onSuccess: ambiente => {
      qc.invalidateQueries({ queryKey: qk.ambientes.list(ambiente.empresa_id) })
      toast.success('Ambiente atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDesativarAmbiente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => desativarAmbiente(id),
    onSuccess: ambiente => {
      qc.invalidateQueries({ queryKey: qk.ambientes.list(ambiente.empresa_id) })
      toast.success('Ambiente desativado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
