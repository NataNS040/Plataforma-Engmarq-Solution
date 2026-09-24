import type { LucideIcon } from 'lucide-react'
import { Clock } from 'lucide-react'

export interface SoonPanelProps {
  icon?: LucideIcon
  title?: string
  subtitle?: string
}

/**
 * Placeholder honesto pra uma seção/aba inteira que ainda não tem back-end
 * (ex.: Papéis e permissões, Integrações, Plano — ver mapeamento de gaps
 * funcionais). Substitui dado fictício disfarçado de real por um estado
 * claramente "em breve", no mesmo espírito das outras telas do app que já
 * marcam pendências honestamente (ex.: "Cálculo em breve" no detalhe de
 * empresa, "Score SST — em breve" no perfil do colaborador).
 */
export function SoonPanel({ icon: Icon = Clock, title = 'Em breve', subtitle }: SoonPanelProps) {
  return (
    <div className="soon-panel">
      <Icon size={32} />
      <div className="soon-title">{title}</div>
      {subtitle && <div className="soon-sub">{subtitle}</div>}
    </div>
  )
}
