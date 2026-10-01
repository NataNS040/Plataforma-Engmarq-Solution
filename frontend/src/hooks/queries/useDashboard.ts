import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { buscarKpis, buscarAlertasCriticos } from '@/services/dashboardService'
import { useCurrentProfile } from '@/hooks/useCurrentProfile'

export function useDashboardKpis(empresaId: string | 'all' | null | undefined) {
  const { canReadColaboradores, empresaId: actorEmpresaId } = useCurrentProfile()
  const includeColaboradores = canReadColaboradores && empresaId === actorEmpresaId
  return useQuery({
    queryKey: [...qk.dashboard.kpis(empresaId ?? 'all'), includeColaboradores],
    queryFn: () => buscarKpis(empresaId ?? 'all', includeColaboradores),
    enabled: !!empresaId,
    staleTime: 60_000,  // dashboard pode ficar 1min em cache
  })
}

export function useDashboardAlertas(
  empresaId: string | 'all' | null | undefined,
  limit = 5
) {
  return useQuery({
    queryKey: qk.dashboard.alertas(empresaId ?? 'all', limit),
    queryFn: () => buscarAlertasCriticos(empresaId ?? 'all', limit),
    enabled: !!empresaId,
    staleTime: 60_000,
  })
}
