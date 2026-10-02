"""Refresh catalog expectations in the canonical 021 read-only SQL scripts.

Diagnostics and scope live in the checked-in SQL, not a second SQL template.
Run remediation-catalog.mjs first to derive post-021 expectations locally.
"""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
manifest = json.loads((HERE / "expected-021-catalog.json").read_text(encoding="utf-8"))
old = json.loads((HERE.parent / "2026-10-01/expected-catalog.json").read_text(encoding="utf-8"))

def in_scope(row):
    return (row.get("tablename") not in ("fichas_epi", "fichas_epi_itens")
            and row.get("relation") not in ("fichas_epi", "fichas_epi_itens", "public.fichas_epi", "public.fichas_epi_itens")
            and not row.get("policyname", "").startswith(("assinaturas_", "epi_tenant_")))

pre = {key: [dict(row) for row in values if in_scope(row)] for key, values in old.items()}
pre["policies"] = [row for row in pre["policies"] if row["tablename"] not in ("documentos", "empresas")]
for function in pre["functions"]:
    body = re.search(r"AS \$function\$(.*?)\$function\$", function["definition"], re.S)
    assert body, function["signature"]
    function["source_hash"] = hashlib.md5(body.group(1).replace("\r\n", "\n").encode()).hexdigest()

for phase, catalog in (("preflight", pre), ("postflight", manifest)):
    path = ROOT / f"supabase/tests/021_security_{phase}_readonly.sql"
    sql = path.read_text(encoding="utf-8")
    for key in ("policies", "functions", "triggers", "constraints", "grants"):
        pattern = rf"(expected_{key} AS \(SELECT \* FROM jsonb_to_recordset\(')(.*?)(\'::jsonb\) AS x\((.*?)\)\))"
        match = re.search(pattern, sql)
        if not match:
            assert phase == "preflight" and key == "grants", key
            continue
        columns = [column.strip().split()[0] for column in match.group(4).split(",")]
        rows = [{column: row.get(column) for column in columns} for row in catalog[key] if in_scope(row)]
        payload = json.dumps(rows, ensure_ascii=False).replace("'", "''")
        sql = sql[:match.start(2)] + payload + sql[match.end(2):]
    assert "FROM public.fichas_epi" not in sql
    assert "assinaturas_storage_insert" not in sql
    path.write_text(sql, encoding="utf-8")
print("021 scope/catalog expectations refreshed locally")
