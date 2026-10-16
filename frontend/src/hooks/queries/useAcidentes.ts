import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { qk } from '@/lib/queryKeys'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { carregarCatalogosEsocial } from '@/lib/esocial'
import {
  listarAcidentes,
  obterAcidente,
  resumoAcidentes,
  criarAcidente,
  atualizarAcidente,
  anularAcidente,
  type AcidenteInput,
} from '@/services/acidentesService'

export function useAcidentes() {
  const { profile, empresaId, canReadAcidentes } = useCurrentProfile()
  return useQuery({
    queryKey: [...qk.acidentes.list(empresaId ?? ''), profile?.id, canReadAcidentes],
    queryFn: listarAcidentes,
    enabled: canReadAcidentes && !!empresaId,
  })
}

export function useResumoAcidentes() {
  const { profile, empresaId, canReadAcidentes } = useCurrentProfile()
  return useQuery({
    queryKey: [...qk.acidentes.resumo(empresaId ?? ''), profile?.id, canReadAcidentes],
    queryFn: resumoAcidentes,
    enabled: canReadAcidentes && !!empresaId,
  })
}

/** Detalhe completo (com textos longos) só quando um registro é aberto. */
export function useAcidente(id: string | null | undefined) {
  const { profile, empresaId, canReadAcidentes } = useCurrentProfile()
  return useQuery({
    queryKey: [...qk.acidentes.detail(id ?? ''), profile?.id, empresaId, canReadAcidentes],
    queryFn: () => obterAcidente(id!),
    enabled: canReadAcidentes && !!id,
  })
}

/** Catálogos eSocial: arquivo estático do próprio app, sem chamada à API. */
export function useCatalogosEsocial() {
  return useQuery({ queryKey: ['esocial', 'catalogos'], queryFn: carregarCatalogosEsocial, staleTime: Infinity, gcTime: Infinity })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: qk.acidentes.all })
}

export function useCriarAcidente() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: AcidenteInput) => criarAcidente(input),
    onSuccess: () => { void invalidate(); toast.success('Acidente registrado.') },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAtualizarAcidente() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AcidenteInput> }) => atualizarAcidente(id, input),
    onSuccess: () => { void invalidate(); toast.success('Acidente atualizado.') },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAnularAcidente() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => anularAcidente(id, motivo),
    onSuccess: () => { void invalidate(); toast.success('Registro anulado.') },
    onError: (err: Error) => toast.error(err.message),
  })
}
