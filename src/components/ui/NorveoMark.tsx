export interface NorveoMarkProps {
  size?: number
  /** 'dark' = para fundos escuros (Sidebar, hero do Login). 'light' = para fundos claros (Login mobile). */
  tone?: 'dark' | 'light'
  className?: string
}

/**
 * Ícone da marca Norveo (seta/"N"), recriado em SVG a partir do manual de
 * marca — não é um traço vetorial exato do arquivo original (o Claude Code
 * não tem acesso ao binário de imagens coladas no chat, só à visualização),
 * mas usa as cores oficiais (Norte/Vision Blue/Horizon) e a composição
 * correta (seta sobre "N"). Trocar por <img src=.../> aqui, num único
 * lugar, se/quando o arquivo vetorial oficial (src/assets/brand/) chegar.
 */
export function NorveoMark({ size = 42, tone = 'dark', className }: NorveoMarkProps) {
  const gradId = `norveo-mark-grad-${tone}`
  const leftLeg = tone === 'dark' ? '#0F2A44' : '#071A2B'
  const diagonal = tone === 'dark' ? '#176FFF' : '#0F2A44'

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4385FF" />
          <stop offset="1" stopColor="#176FFF" />
        </linearGradient>
      </defs>
      {/* Seta / pico */}
      <path d="M49 4 L25 39 L49 24 Z" fill="#4385FF" />
      <path d="M49 4 L49 24 L73 39 Z" fill="#176FFF" />
      {/* "N" */}
      <path d="M14 38 L30 38 L30 96 L14 96 Z" fill={leftLeg} />
      <path d="M14 38 L30 38 L84 96 L68 96 Z" fill={diagonal} />
      <path d="M68 38 L84 38 L84 96 L68 96 Z" fill={`url(#${gradId})`} />
    </svg>
  )
}
