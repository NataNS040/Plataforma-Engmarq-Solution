// LOCAL SYNTHETIC ONLY. No 024 application, credentials or remote connection.
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {cnpjCTE} from './024-catalog.mjs'
export const target='5c114b79-bbd1-4829-b6ac-42da9f7362c0'
export const oldCnpj='12.345.678/0001-99'
export const newCnpj='60.545.359/0001-76'
export const canonical='60545359000176'
export const inputCTE=cnpjCTE.replace('FROM public.empresas',
 `FROM (VALUES ('${target}'::uuid,'${newCnpj}'::text)) input(id,cnpj)`)
export async function validateNewCnpj() {
 const db=new PGlite()
 try {
  const row=(await db.query(`WITH ${inputCTE} SELECT cnpj,canonical,valid FROM validated`)).rows[0]
  assert.equal(row.canonical,canonical);assert.equal(row.valid,true)
  return row
 }finally{await db.close()}
}
if(process.argv[1]?.endsWith('024_cnpj_remediation_validate.mjs'))console.log(await validateNewCnpj())
