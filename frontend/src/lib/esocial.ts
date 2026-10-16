/**
 * Catálogos eSocial S-1.3 usados no S-2210 (Tabelas 13, 14, 15 e 17).
 *
 * O conteúdo vem de `src/data/esocial.json`, gerado a partir dos arquivos
 * oficiais em `supabase/data/esocial/` pelo mesmo script que gera o seed da
 * migration 026 — banco e tela usam exatamente os mesmos códigos.
 *
 * O JSON é carregado sob demanda (chunk próprio do Vite, ~9 KB gzip) e fica
 * no cache do navegador: os catálogos não passam pela API nem pelo Supabase.
 */
export type TabelaEsocial = '13' | '14' | '15' | '17'

export interface CodigoEsocial {
  codigo: string
  descricao: string
  conceito?: string
}

export interface CatalogosEsocial {
  versao: string
  tabelas: Record<TabelaEsocial, CodigoEsocial[]>
  descricao: (tabela: TabelaEsocial, codigo: string | null | undefined) => string
}

type Linha = [string, string] | [string, string, string]

let cache: Promise<CatalogosEsocial> | null = null

export function carregarCatalogosEsocial(): Promise<CatalogosEsocial> {
  cache ??= import('@/data/esocial.json').then(({ default: data }) => {
    const raw = data as { versao: string; tabelas: Record<TabelaEsocial, Linha[]> }
    const tabelas = {} as Record<TabelaEsocial, CodigoEsocial[]>
    const indice = new Map<string, string>()
    for (const tabela of ['13', '14', '15', '17'] as const) {
      tabelas[tabela] = raw.tabelas[tabela].map(([codigo, descricao, conceito]) => {
        indice.set(`${tabela}:${codigo}`, descricao)
        return conceito ? { codigo, descricao, conceito } : { codigo, descricao }
      })
    }
    return {
      versao: raw.versao,
      tabelas,
      descricao: (tabela: TabelaEsocial, codigo: string | null | undefined) =>
        (codigo ? indice.get(`${tabela}:${codigo}`) ?? `Código ${codigo}` : '—'),
    }
  }).catch(error => {
    cache = null
    throw error
  })
  return cache
}
