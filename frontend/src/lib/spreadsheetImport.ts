export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 500

/** Read only the first worksheet, preserving formatted identifiers and dates. */
export async function readSpreadsheetRows(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<Record<string, string>[]> {
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new Error('A planilha deve ter no máximo 10 MiB.')
  }
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array', raw: false, cellDates: false,
    // Header + 500 accepted rows + one row to detect an oversized import.
    sheetRows: MAX_IMPORT_ROWS + 2,
  })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) throw new Error('A planilha não contém uma aba legível.')
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, { defval: '', raw: false })
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error('Importe no máximo 500 colaboradores por arquivo.')
  }
  return rows.map(row => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), String(value)]),
  ))
}
