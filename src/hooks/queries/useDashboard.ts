import { useQuery } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import { buscarKpis, buscarAlertasCriticos } from '@/services/dashboardService'

export function useDashboardKpis(empresaId: string | 'all' | null | undefined) {
  return useQuery({
    queryKey: qk.dashboard.kpis(empresaId ?? 'all'),
    queryFn: () => buscarKpis(empresaId ?? 'all'),
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
