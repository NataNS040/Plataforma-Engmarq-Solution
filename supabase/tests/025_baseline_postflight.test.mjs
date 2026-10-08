import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {fundacaoFixture,migrate,id} from './fundacao-fixture.mjs'
import {withBaseline} from './025_postflight_baseline.mjs'
import {parseReadonly} from './025_manual_preflight.test.mjs'
const exportSql=await readFile(new URL('025_baseline_pre025_export_readonly.sql',import.meta.url),'utf8')
const postSql=await readFile(new URL('025_fundacao_postflight_readonly.sql',import.meta.url),'utf8')
const run=async(db,sql)=>(await db.exec(sql)).flatMap(r=>r.rows??[])
test('export and POST parser: exactly three read-only statements, no remote CNPJ call',()=>{
 parseReadonly(exportSql);parseReadonly(postSql)
 assert.doesNotMatch(postSql,/NOT engmarq_private\.cnpj_valido\(cnpj\)/)
})
test('complete baseline import rejects summary-only, incomplete snapshots, wrong freeze and unapproved evidence',async()=>{
 const db=await fundacaoFixture(true)
 try{
  const rows=await run(db,exportSql),payload=rows[0].BASELINE_PRE025
  assert.equal(rows.length,1);assert.equal(payload.approved,true)
  assert.ok(payload.snapshots['storage.objects'])
  assert.ok(payload.checks.some(r=>r.CHECK.startsWith('Previsão exata: ')))
  assert.doesNotMatch(JSON.stringify(payload.snapshots),/user[0-9]+@example|Synthetic employee/)
  for(const mutate of [p=>p.version=1,p=>p.approved=false,p=>p.migration_sha256='bad',p=>delete p.snapshots['public.empresa_features'],p=>p.checks=p.checks.filter(r=>!r.CHECK.startsWith('Previsão exata: ')),p=>p.snapshots['public.empresas'].rows={},p=>p.legacy.pop()]){
   const invalid=structuredClone(payload);mutate(invalid);assert.throws(()=>withBaseline(postSql,invalid))
  }
  assert.throws(()=>withBaseline(postSql,[{CHECK:'Preservação: empresas',RESULTADO:'a'.repeat(32)}]))
  await migrate(db,'025_entitlements_quota_hardening.sql')
  const validated=withBaseline(postSql,rows)
  parseReadonly(validated)
  assert.deepEqual((await run(db,validated)).filter(r=>r.STATUS==='BLOQUEIO'),[])
  for(const mutation of [
   `UPDATE user_profiles SET full_name='Data drift' WHERE id='${id(3)}'`,
   `INSERT INTO empresa_features VALUES('${id(101)}','epi',true)`,
   `UPDATE engmarq_private.fundacao_025_legado SET features_antes='[{"feature_key":"documents"}]' WHERE empresa_id='${id(101)}'`,
   "GRANT UPDATE ON SEQUENCE public.exames_catalogo_id_seq TO anon",
   'ALTER EVENT TRIGGER ensure_rls DISABLE',
   "UPDATE storage.buckets SET public=true WHERE id='logos'",
   "INSERT INTO auditoria_comercial(empresa_id,objeto,operacao,executor) VALUES('00000000-0000-4000-8000-000000000101','empresa_limites','INSERT','unexpected')",
   `ALTER TABLE documentos DROP CONSTRAINT documentos_colaborador_tenant_fkey; UPDATE documentos SET colaborador_id='${id(202)}' WHERE empresa_id='${id(101)}'`,
   "CREATE OR REPLACE FUNCTION engmarq_private.cnpj_valido(raw text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'must not execute remote drift'; END $$"
  ]){
   await db.exec('BEGIN');try{
    await db.exec(mutation)
    const selectOnly=validated.slice(validated.indexOf('WITH baseline_input'),validated.lastIndexOf('COMMIT;'))
    assert.ok((await run(db,selectOnly)).some(r=>r.STATUS==='BLOQUEIO'),mutation)
   }finally{await db.exec('ROLLBACK')}
  }
  assert.ok((await run(db,postSql)).some(r=>r.CHECK==='Pacote PRE-025 integral'&&r.STATUS==='BLOQUEIO'))
 }finally{await db.close()}
})
test('additional storage table fingerprints block drift; original commercial OFF/limit/plan remain preserved',async()=>{
 const db=await fundacaoFixture(true)
 try{
  // Additional optional relation is known before the cut; no personal rows exported.
  await db.exec("CREATE TABLE storage.sst_extra(id uuid PRIMARY KEY,note text); ALTER TABLE storage.sst_extra ENABLE ROW LEVEL SECURITY; INSERT INTO storage.sst_extra VALUES('00000000-0000-4000-8000-000000009999','private')")
  await db.exec(`INSERT INTO empresa_comercial(empresa_id,origem) VALUES('${id(101)}','administrativo'); INSERT INTO empresa_features VALUES('${id(101)}','exames',false); INSERT INTO empresa_limites VALUES('${id(101)}',10,false)`)
  const rows=await run(db,exportSql)
  assert.equal(rows[0].BASELINE_PRE025.approved,true)
  await migrate(db,'025_entitlements_quota_hardening.sql')
  const sql=withBaseline(postSql,rows)
  assert.deepEqual((await run(db,sql)).filter(r=>r.STATUS==='BLOQUEIO'),[])
  await db.exec("UPDATE storage.sst_extra SET note='changed'")
  assert.ok((await run(db,sql)).some(r=>r.CHECK==='Snapshot: storage.sst_extra'&&r.STATUS==='BLOQUEIO'))
 }finally{await db.close()}
})
