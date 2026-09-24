import { toast } from 'sonner'

/**
 * Feedback padrão pra qualquer ação "em breve" — usado em botões/abas que
 * hoje não têm back-end nenhum (ver mapeamento de gaps funcionais). Em vez
 * de deixar o clique não fazer nada (parece quebrado) ou desabilitar o
 * elemento nativamente (some o tooltip em vários navegadores), o botão
 * continua um <button> normal — só estilizado com a classe `.is-soon`
 * (ver src/index.css) — e o clique mostra esse toast informativo.
 */
export function comingSoon(feature?: string) {
  toast(feature ? `${feature} — em breve.` : 'Em breve.', { icon: '🕒' })
}
