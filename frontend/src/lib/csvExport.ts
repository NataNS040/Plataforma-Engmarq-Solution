// Helper único de exportação CSV — extraído do padrão que já existia em
// downloadCsvTemplate() (ColaboradoresPage.tsx): Blob com BOM (pra acentos
// abrirem certo no Excel) + URL.createObjectURL + <a download>. Tudo
// client-side, sem chamada nova ao banco — exporta o que já está na tela.

const BOM = String.fromCharCode(0xfeff)

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Baixa uma matriz de linhas já pronta como arquivo .csv. */
export function downloadCsvRows(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map(r => r.map(escapeCsvCell).join(',')).join('\r\n')
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

/** Exporta uma lista de objetos como .csv, dada uma definição de colunas. */
export function exportToCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  const headerRow = columns.map(c => c.header)
  const dataRows = rows.map(r => columns.map(c => c.value(r)))
  downloadCsvRows(filename, [headerRow, ...dataRows])
}
