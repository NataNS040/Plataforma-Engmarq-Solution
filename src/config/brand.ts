/**
 * Identidade da marca — ponto único de verdade para nome, tagline e
 * copyright do produto. Ao trocar a identidade visual (rebrand), editar
 * SÓ este arquivo (mais a paleta física em src/index.css e o logo em
 * src/assets/brand/, referenciado por <BrandMark />).
 *
 * NÃO editar aqui: o basename do BrowserRouter (src/App.tsx) e o `base`
 * do Vite (vite.config.ts) — esses seguem o nome do repositório no
 * GitHub Pages, não o nome comercial do produto.
 *
 * index.html (<title>) e public/404.html não importam este arquivo
 * (rodam antes do bundle JS) — mantidos em sincronia manual, ver
 * comentário nesses arquivos.
 */

export const APP_NAME = 'Norveo'

/** Nome curto, usado em espaços apertados (ex: menu do usuário no Header). */
export const APP_SHORT_NAME = 'Norveo'

export const APP_TAGLINE = 'O Norte da sua Gestão.'

/** Linha secundária, usada em telas maiores (hero do login, banners). */
export const APP_SLOGAN = 'Gestão à vista. Decisões à frente.'

export const APP_COPYRIGHT = `© ${new Date().getFullYear()} Norveo · uma tecnologia Engmarq Solution`
