// Files only. Does not open a database, read env or contact Supabase.
// Source of truth: supabase/data/esocial/tabela{13,14,15,17}.tsv (official S-1.3 tables).
// Writes the seed block of migrations/026_acidentes.sql and frontend/src/data/esocial.json.
// --check: fails if either output is stale (run by `npm run test:026`).
import { readFile, writeFile } from 'node:fs/promises'

const TABELAS = ['13', '14', '15', '17']
const VERSAO = 'S-1.3 (cons. até NT 07/2026 rev. 24/09/2026)'
const check = process.argv.includes('--check')

const tabelas = {}
for (const n of TABELAS) {
  const text = (await readFile(new URL(`../data/esocial/tabela${n}.tsv`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
  const lines = text.split('\n').filter(l => l && !l.startsWith('#'))
  const header = lines.shift()
  if (header !== (n === '15' ? 'codigo\tdescricao\tconceito' : 'codigo\tdescricao')) throw new Error(`Unexpected header in tabela${n}.tsv`)
  const seen = new Set()
  tabelas[n] = lines.map(line => {
    const [codigo, descricao, conceito] = line.split('\t')
    if (!/^[0-9]{9}$/.test(codigo)) throw new Error(`Invalid code ${codigo} in tabela${n}.tsv`)
    if (seen.has(codigo)) throw new Error(`Duplicate code ${codigo} in tabela${n}.tsv`)
    if (!descricao || descricao.length > 600) throw new Error(`Invalid description for ${codigo} in tabela${n}.tsv`)
    seen.add(codigo)
    return conceito ? [codigo, descricao, conceito] : [codigo, descricao]
  })
}

const sqlText = value => `'${value.replaceAll("'", "''")}'`
const values = TABELAS.flatMap(n => tabelas[n].map(([codigo, descricao]) => `(${n},'${codigo}',${sqlText(descricao)})`))
const block = `-- BEGIN GENERATED ESOCIAL SEED
-- ${values.length} codes from supabase/data/esocial/*.tsv, leiaute ${VERSAO}.
INSERT INTO public.esocial_codigos (tabela, codigo, descricao) VALUES
${values.join(',\n')};
-- END GENERATED ESOCIAL SEED`

const migrationUrl = new URL('../migrations/026_acidentes.sql', import.meta.url)
const migration = await readFile(migrationUrl, 'utf8')
const pattern = /-- BEGIN GENERATED ESOCIAL SEED[\s\S]*?-- END GENERATED ESOCIAL SEED/
if (!pattern.test(migration)) throw new Error('Seed markers not found in 026_acidentes.sql')
const nextMigration = migration.replace(pattern, () => block)

const jsonUrl = new URL('../../frontend/src/data/esocial.json', import.meta.url)
const nextJson = JSON.stringify({ versao: VERSAO, tabelas }) + '\n'

if (check) {
  if (nextMigration !== migration) throw new Error('026_acidentes.sql seed is stale; run node 026_esocial_generate.mjs')
  const currentJson = await readFile(jsonUrl, 'utf8').catch(() => '')
  if (currentJson !== nextJson) throw new Error('frontend/src/data/esocial.json is stale; run node 026_esocial_generate.mjs')
  console.log(`eSocial catalogs in sync (${values.length} codes)`)
} else {
  await writeFile(migrationUrl, nextMigration)
  await writeFile(jsonUrl, nextJson)
  console.log(`Wrote ${values.length} codes to 026_acidentes.sql and frontend/src/data/esocial.json`)
}
