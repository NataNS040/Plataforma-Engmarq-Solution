import { describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { MAX_IMPORT_ROWS, MAX_SPREADSHEET_BYTES, readSpreadsheetRows } from '../src/lib/spreadsheetImport'

function asFile(buffer: ArrayBuffer) {
  return { size: buffer.byteLength, arrayBuffer: async () => buffer }
}

function workbookBuffer(sheet: XLSX.WorkSheet, bookType: 'xlsx' | 'xls' = 'xlsx') {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Colaboradores')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Ignorar'], ['Outra aba']]), 'Outra')
  return XLSX.write(workbook, { type: 'array', bookType }) as ArrayBuffer
}

describe('spreadsheet compatibility and import limits', () => {
  it.each(['xlsx', 'xls'] as const)('imports %s with accents, leading zeros, formatted dates and only the first sheet', async bookType => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [' Nome ', 'CPF', 'Matrícula', 'Data_admissao', 'Ambiente'],
      ['João Teste', 1234567890, '0007', 45659, ''],
    ])
    sheet.B2.z = '00000000000'
    sheet.D2.z = 'dd/mm/yyyy'
    const rows = await readSpreadsheetRows(asFile(workbookBuffer(sheet, bookType)))
    expect(rows).toEqual([{ nome: 'João Teste', cpf: '01234567890', matrícula: '0007', data_admissao: '02/01/2025', ambiente: '' }])
  })

  it('imports CSV with BOM, quotes, semicolon separator and text identifiers', async () => {
    const csv = '\uFEFFNome;CPF;Matricula;Data_admissao\r\n"João; Teste";01234567890;0007;02/01/2025'
    const bytes = new TextEncoder().encode(csv)
    const rows = await readSpreadsheetRows(asFile(bytes.buffer))
    expect(rows).toEqual([{ nome: 'João; Teste', cpf: '01234567890', matricula: '0007', data_admissao: '02/01/2025' }])
  })

  it('rejects oversized files before reading their bytes', async () => {
    const arrayBuffer = vi.fn()
    await expect(readSpreadsheetRows({ size: MAX_SPREADSHEET_BYTES + 1, arrayBuffer })).rejects.toThrow('10 MiB')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('accepts 500 rows and rejects 501 rather than silently truncating', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS }, (_, index) => [`Pessoa ${index}`])
    expect(await readSpreadsheetRows(asFile(workbookBuffer(XLSX.utils.aoa_to_sheet([['Nome'], ...rows]))))).toHaveLength(500)
    await expect(readSpreadsheetRows(asFile(workbookBuffer(XLSX.utils.aoa_to_sheet([['Nome'], ...rows, ['Excedente']]))))).rejects.toThrow('500')
  })

  it('round-trips report worksheets, empty placeholders, numbers and formula-like text', () => {
    const workbook = XLSX.utils.book_new()
    const summary = [{ Métrica: 'Empresa', Valor: 'Empresa Teste' }, { Métrica: 'Colaboradores ativos', Valor: 7 }]
    const documents = [{ Documento: '=HYPERLINK("https://example.invalid")', Número: '00042' }]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), 'Resumo')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documents), 'Documentos')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Informação: 'Sem registros no período' }]), 'Exames')
    const restored = XLSX.read(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }), { type: 'array' })
    expect(restored.SheetNames).toEqual(['Resumo', 'Documentos', 'Exames'])
    expect(XLSX.utils.sheet_to_json(restored.Sheets.Resumo)).toEqual(summary)
    expect(XLSX.utils.sheet_to_json(restored.Sheets.Documentos)).toEqual(documents)
    expect(restored.Sheets.Documentos.A2.t).toBe('s')
    expect(restored.Sheets.Documentos.A2.f).toBeUndefined()
    expect(XLSX.utils.sheet_to_json(restored.Sheets.Exames)).toEqual([{ Informação: 'Sem registros no período' }])
  })
})
