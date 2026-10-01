import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { buscarKpis, buscarAlertasCriticos } from '@/services/dashboardService'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'

export function useDashboardKpis(empresaId: string | 'all' | null | undefined) {
  const { profile, canReadColaboradores, empresaId: actorEmpresaId } = useCurrentProfile()
  const includeColaboradores = canReadColaboradores && empresaId === actorEmpresaId
  return useQuery({
    queryKey: [...qk.dashboard.kpis(empresaId ?? 'all'), includeColaboradores, profile?.id],
    queryFn: () => buscarKpis(empresaId ?? 'all', includeColaboradores),
    enabled: !!empresaId,
    staleTime: 60_000,  // dashboard pode ficar 1min em cache
  })
}

export function useDashboardAlertas(
  empresaId: string | 'all' | null | undefined,
  limit = 5
) {
  const { profile, empresaId: own, canReadTreinamentos } = useCurrentProfile()
  const allowed = canReadTreinamentos && empresaId === own
  return useQuery({
    queryKey: [...qk.dashboard.alertas(empresaId ?? 'all', limit), profile?.id, allowed],
    queryFn: () => buscarAlertasCriticos(empresaId ?? 'all', limit, allowed),
    enabled: !!empresaId,
    staleTime: 60_000,
  })
}
