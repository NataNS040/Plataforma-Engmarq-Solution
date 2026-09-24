import { useState } from "react"
import { X, HardHat, ShieldCheck, Trash2, Camera } from "lucide-react"
import { useDeletarFichaEpi } from "@/hooks/queries/useFichasEpi"
import { AssinaturaFichaFlow } from "./AssinaturaFichaFlow"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import type { FichaEpiComItens } from "@/services/fichasEpiService"

const STATUS_CHIP: Record<string, { cls: string; label: string }> = {
  vigente:  { cls: "ok",   label: "Vigente"  },
  vencendo: { cls: "warn", label: "Vencendo" },
  vencido:  { cls: "crit", label: "Vencido"  },
}

export function FichaEpiDetailModal({ ficha, empresaId, onClose }: {
  ficha: FichaEpiComItens
  empresaId: string
  onClose: () => void
}) {
  const [assinandoAgora, setAssinandoAgora] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const deletar = useDeletarFichaEpi()

  const assinada = !!ficha.assinado_em

  async function handleDelete() {
    try {
      await deletar.mutateAsync({ id: ficha.id, empresaId, colaboradorId: ficha.colaborador_id })
      onClose()
    } catch { /* toast já disparado */ }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="doc-ic file"><HardHat size={16} /></div>
            <span>Ficha de EPI</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ paddingTop: 16 }}>
          {assinandoAgora ? (
            <AssinaturaFichaFlow
              fichaId={ficha.id}
              empresaId={empresaId}
              colaboradorId={ficha.colaborador_id}
              onSigned={onClose}
              onCancel={() => setAssinandoAgora(false)}
            />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ficha.colaborador?.nome ?? "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    Entrega em {new Date(ficha.data_entrega + "T00:00:00").toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span className={`chip ${assinada ? "ok" : "neutral"}`}>
                  {assinada ? "Assinada" : "Pendente de assinatura"}
                </span>
              </div>

              <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
                <table className="tbl">
                  <thead>
                    <tr><th>Equipamento</th><th>CA</th><th>Validade</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {ficha.itens.map(it => {
                      const chip = STATUS_CHIP[it.status] ?? STATUS_CHIP.vigente
                      return (
                        <tr key={it.id}>
                          <td>{it.equipamento}</td>
                          <td>{it.ca ?? "—"}</td>
                          <td>{it.data_validade ? new Date(it.data_validade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                          <td><span className={`chip ${chip.cls}`} style={{ fontSize: 10.5 }}>{chip.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {assinada ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {ficha.foto_assinatura_url && (
                    <img
                      src={ficha.foto_assinatura_url}
                      alt="Foto da assinatura"
                      style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: "1px solid var(--border)" }}
                    />
                  )}
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--green-600)", fontWeight: 600, marginBottom: 2 }}>
                      <ShieldCheck size={13} /> Assinada
                    </div>
                    {ficha.assinado_em && new Date(ficha.assinado_em).toLocaleString("pt-BR")}
                  </div>
                </div>
              ) : (
                <div className="modal-foot" style={{ paddingTop: 0, borderTop: "none" }}>
                  <button className="tbtn ghost" style={{ color: "var(--red-500)" }} onClick={() => setConfirmDel(true)}>
                    <Trash2 size={13} /> Excluir ficha
                  </button>
                  <button className="tbtn primary" onClick={() => setAssinandoAgora(true)}>
                    <Camera size={13} /> Assinar agora
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog
          title="Excluir ficha de EPI?"
          description={<>Isso remove a ficha e os <strong>{ficha.itens.length}</strong> item(ns) dela permanentemente. Essa ação não pode ser desfeita.</>}
          loading={deletar.isPending}
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}
