import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'
import { qk } from '@/lib/queryKeys'
import { atualizarUsuario, listarUsuariosDaEmpresa, type UsuarioInput } from '@/services/usuariosService'

export function useUsuariosDaEmpresa(empresaId: string | null | undefined) {
  const { canManageUsers, empresaId: actorEmpresaId } = useCurrentProfile()
  return useQuery({
    queryKey: qk.usuarios.list(empresaId ?? ''),
    queryFn: () => listarUsuariosDaEmpresa(),
    enabled: canManageUsers && !!empresaId && empresaId === actorEmpresaId,
  })
}

export function useAtualizarUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UsuarioInput }) => atualizarUsuario(id, input),
    onSuccess: usuario => {
      qc.invalidateQueries({ queryKey: qk.usuarios.list(usuario.empresa_id) })
      toast.success('Usuário atualizado.')
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
