import { PIRAMIDE } from '@/services/acidentesService'

export type NivelBird = keyof typeof PIRAMIDE

/** Níveis de cima para baixo, com a proporção clássica de Frank Bird (1 : 10 : 30 : 600). */
const NIVEIS: { key: NivelBird; proporcao: string; cor: string; largura: number }[] = [
  { key: 'lesao_grave', proporcao: '1', cor: 'var(--red-500)', largura: 34 },
  { key: 'lesao_leve', proporcao: '10', cor: 'var(--orange-500)', largura: 56 },
  { key: 'dano_material', proporcao: '30', cor: 'var(--blue-500)', largura: 78 },
  { key: 'quase_acidente', proporcao: '600', cor: 'var(--green-500)', largura: 100 },
]

export function PiramideBird({ contagem, semClassificacao }: { contagem: Record<NivelBird, number>; semClassificacao: number }) {
  const resumo = NIVEIS.map(n => `${PIRAMIDE[n.key]}: ${contagem[n.key]}`).join('; ')
  return (
    <div className="bird" role="img" aria-label={`Pirâmide de Bird — ${resumo}`}>
      {NIVEIS.map(n => (
        <div className="bird-row" key={n.key}>
          <div className="bird-track">
            <div className="bird-bar" style={{ width: `${n.largura}%`, background: n.cor }}>{contagem[n.key]}</div>
          </div>
          <div className="bird-label">
            {PIRAMIDE[n.key]}
            <span>Referência de Bird: {n.proporcao}</span>
          </div>
        </div>
      ))}
      {semClassificacao > 0 && (
        <p className="bird-note">{semClassificacao} registro{semClassificacao > 1 ? 's' : ''} sem classificação na pirâmide.</p>
      )}
    </div>
  )
}
