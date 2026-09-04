import { NorveoMark } from '@/components/ui/NorveoMark'
import { APP_NAME, APP_TAGLINE } from '@/config/brand'

export interface BrandMarkProps {
  /** 'md' = mark + nome + tagline (Sidebar, hero do Login — fundo escuro). 'sm' = versão compacta (Login mobile — fundo claro). */
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
 * O ícone vem de <NorveoMark /> — ver esse componente para a ressalva
 * sobre fidelidade ao arquivo de logo oficial.
 */
export function BrandMark({ size = 'md', hideTagline }: BrandMarkProps) {
  if (size === 'sm') {
    return (
      <>
        <NorveoMark size={34} tone="light" />
        <span className="brand-text">{APP_NAME}</span>
      </>
    )
  }

  return (
    <>
      <NorveoMark size={40} tone="dark" />
      <div>
        <div className="brand-name">{APP_NAME}</div>
        {!hideTagline && <div className="brand-tag">{APP_TAGLINE}</div>}
      </div>
    </>
  )
}
