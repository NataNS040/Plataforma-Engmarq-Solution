import { ShieldCheck } from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '@/config/brand'

export interface BrandMarkProps {
  /** 'md' = mark colorido + nome + tagline (Sidebar, hero do Login). 'sm' = versão compacta (Login mobile). */
  size?: 'md' | 'sm'
  /** Esconde a tagline mesmo no tamanho 'md'. */
  hideTagline?: boolean
}

/**
 * Marca da aplicação (ícone + nome). Renderiza só o conteúdo interno —
 * o consumidor mantém seu próprio container flex (`.sb-brand` na Sidebar,
 * `.lbrand`/`.login-mobile-brand` na LoginPage), já responsável por
 * espaçamento e comportamento responsivo específicos de cada tela.
 *
 * Único lugar que precisa mudar quando o arquivo de logo oficial
 * (src/assets/brand/) estiver disponível — hoje o "ícone" é um mark
 * genérico (ShieldCheck) nas cores da marca.
 */
export function BrandMark({ size = 'md', hideTagline }: BrandMarkProps) {
  if (size === 'sm') {
    return (
      <>
        <div className="brand-mark-sm">
          <ShieldCheck size={18} color="var(--blue-500)" strokeWidth={2.5} />
        </div>
        <span className="brand-text">{APP_NAME}</span>
      </>
    )
  }

  return (
    <>
      <div className="brand-mark">
        <ShieldCheck size={20} color="#071A2B" strokeWidth={2.5} />
      </div>
      <div>
        <div className="brand-name">{APP_NAME}</div>
        {!hideTagline && <div className="brand-tag">{APP_TAGLINE}</div>}
      </div>
    </>
  )
}
