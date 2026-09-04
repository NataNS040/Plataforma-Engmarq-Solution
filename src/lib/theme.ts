/**
 * Paletas categóricas centralizadas (gráficos, avatares, status).
 *
 * Antes deste arquivo, cada página declarava a própria cópia dessas
 * listas (DashboardPage, ExamesPage, DocumentosPage, TreinamentosPage,
 * ColaboradoresPage) — algumas idênticas copiadas e coladas, outras
 * levemente diferentes sem motivo. Import daqui em vez de redeclarar.
 *
 * CHART_PALETTE / AVATAR_PALETTE são paletas categóricas (várias cores
 * lado a lado) — não fazem sentido como um único token semântico em
 * src/index.css, por isso ficam como arrays aqui. STATUS_COLORS, por
 * outro lado, referencia os tokens semânticos em src/index.css, então
 * acompanha automaticamente qualquer troca de paleta da marca.
 */

/** Cor de destaque para séries/entidades em gráficos (Dashboard, Exames, Documentos). */
export const CHART_PALETTE = ['#1F2A44', '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B']

export function getChartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]
}

/** Cor de avatar derivada por hash do nome (Colaboradores, Treinamentos). */
export const AVATAR_PALETTE = [
  '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444',
  '#06B6D4', '#1F2A44', '#F472B6', '#22C55E', '#A855F7',
]

export function getAvatarColor(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

export function getInitials(nome: string): string {
  return nome.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/** Estados de semáforo (vigente/vencendo/vencido/não aplicável), via tokens semânticos. */
export const STATUS_COLORS = {
  ok:   { bg: 'var(--color-success)', border: 'rgba(16,185,129,0.18)' },
  warn: { bg: 'var(--color-warning)', border: 'rgba(245,158,11,0.18)' },
  crit: { bg: 'var(--color-danger)',  border: 'rgba(239,68,68,0.18)' },
  na:   { bg: 'var(--ink-300)',       border: 'rgba(203,213,225,0.30)' },
} as const
