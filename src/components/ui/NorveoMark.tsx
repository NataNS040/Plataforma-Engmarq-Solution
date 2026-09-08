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
 * mas replica cores, gradientes e composição fielmente. Trocar por
 * <img src=.../> aqui, num único lugar, se/quando o arquivo vetorial
 * oficial (src/assets/brand/) chegar.
 */
export function NorveoMark({ size = 42, tone = 'dark', className }: NorveoMarkProps) {
  const uid = tone // sufixo único pros gradientes, evita colisão de ids se houver 2 marks na tela
  const leftLeg = tone === 'dark' ? '#0F2A44' : '#071A2B'
  const diagonal = tone === 'dark' ? '#176FFF' : '#0B233A'

  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 100 110" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`norveo-al-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7EC0FF" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id={`norveo-ar-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4385FF" />
          <stop offset="1" stopColor="#0F5DD1" />
        </linearGradient>
        <linearGradient id={`norveo-nr-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4385FF" />
          <stop offset="1" stopColor="#0F5DD1" />
        </linearGradient>
      </defs>
      {/* Seta / pico */}
      <path d="M50 3 L21 43 L50 25 Z" fill={`url(#norveo-al-${uid})`} />
      <path d="M50 3 L50 25 L79 43 Z" fill={`url(#norveo-ar-${uid})`} />
      {/* "N" */}
      <path d="M11 41 L30 41 L30 107 L11 92 Z" fill={leftLeg} />
      <path d="M70 41 L89 41 L89 92 L70 107 Z" fill={`url(#norveo-nr-${uid})`} />
      <path d="M11 41 L30 41 L89 92 L70 107 Z" fill={diagonal} />
    </svg>
  )
}
