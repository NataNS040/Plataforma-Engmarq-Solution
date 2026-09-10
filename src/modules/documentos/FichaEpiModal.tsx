import { useState } from "react"
import { X, Plus, Trash2, CheckCircle2, Loader2, HardHat } from "lucide-react"
import { useColaboradores } from "@/hooks/queries/useColaboradores"
import { useCriarFichaEpi } from "@/hooks/queries/useFichasEpi"
import { AssinaturaFichaFlow } from "./AssinaturaFichaFlow"
import { getAvatarColor, getInitials } from "@/lib/theme"

interface ItemForm { equipamento: string; ca: string; dataValidade: string }

type ColabRef = { id: string; nome: string; cor: string; foto: string }

export interface FichaEpiModalProps {
  /** Colaborador já conhecido (ex.: aberto de dentro do perfil dele). Se
   *  omitido, o modal mostra um select de colaborador (ex.: aberto da
   *  toolbar da página Documentos, sem colaborador de contexto). */
  colab?: ColabRef
  empresaId: string
  onClose: () => void
}

/**
 * Cadastro de uma ficha de EPI (cabeçalho + itens) em duas etapas:
 * 1. Itens entregues (equipamento, CA, validade) — grava a ficha como
 *    rascunho (sem assinatura ainda).
 * 2. Assinatura por foto, presencial (ver AssinaturaFichaFlow) — opcional
 *    na hora; a ficha pode ficar salva sem assinatura e ser assinada depois.
 */
export function FichaEpiModal({ colab: colabFixo, empresaId, onClose }: FichaEpiModalProps) {
  const criar = useCriarFichaEpi()
  const colabsQuery = useColaboradores(colabFixo ? null : empresaId)

  const [step, setStep] = useState<"itens" | "assinatura">("itens")
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [colaboradorIdCriado, setColaboradorIdCriado] = useState<string | null>(null)
  const [colabIdEscolhido, setColabIdEscolhido] = useState("")
  const [dataEntrega, setDataEntrega] = useState(() => new Date().toISOString().slice(0, 10))
  const [itens, setItens] = useState<ItemForm[]>([{ equipamento: "", ca: "", dataValidade: "" }])

  const colab: ColabRef | null = colabFixo ?? (() => {
    const c = (colabsQuery.data ?? []).find(x => x.id === colabIdEscolhido)
    return c ? { id: c.id, nome: c.nome, cor: getAvatarColor(c.nome), foto: getInitials(c.nome) } : null
  })()

  const updItem = (i: number, patch: Partial<ItemForm>) =>
    setItens(list => list.map((it, j) => j === i ? { ...it, ...patch } : it))
  const addItem = () => setItens(list => [...list, { equipamento: "", ca: "", dataValidade: "" }])
  const removeItem = (i: number) => setItens(list => list.length === 1 ? list : list.filter((_, j) => j !== i))

  const itensValidos = itens.filter(it => it.equipamento.trim())
  const canSave = Boolean(colab && dataEntrega && itensValidos.length > 0)

  async function salvarFicha(): Promise<string | null> {
    if (!colab) return null
    try {
      const ficha = await criar.mutateAsync({
        empresa_id: empresaId,
        colaborador_id: colab.id,
        data_entrega: dataEntrega,
        itens: itensValidos.map(it => ({
          equipamento: it.equipamento.trim(),
          ca: it.ca.trim() || null,
          data_validade: it.dataValidade || null,
        })),
      })
      setColaboradorIdCriado(ficha.colaborador_id)
      return ficha.id
    } catch {
      return null
    }
  }

  async function handleContinuarParaAssinatura() {
    const id = await salvarFicha()
    if (!id) return
    setFichaId(id)
    setStep("assinatura")
  }

  async function handleSalvarSemAssinar() {
    const id = await salvarFicha()
    if (!id) return
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="doc-ic file"><HardHat size={16} /></div>
            <span>{step === "itens" ? "Nova ficha de EPI" : "Assinatura da ficha"}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {colabFixo || (colab && step === "assinatura") ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 24px 0", padding: "10px 12px", background: "var(--bg)", borderRadius: 10 }}>
            <div className="ava" style={{ background: (colabFixo ?? colab)!.cor, width: 34, height: 34, fontSize: 12 }}>{(colabFixo ?? colab)!.foto}</div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{(colabFixo ?? colab)!.nome}</div>
          </div>
        ) : step === "itens" && (
          <div className="mp-field" style={{ margin: "18px 24px 0" }}>
            <label>Colaborador</label>
            <select className="mp-input" value={colabIdEscolhido} onChange={e => setColabIdEscolhido(e.target.value)} disabled={colabsQuery.isLoading}>
              <option value="">Selecione…</option>
              {(colabsQuery.data ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        )}

        {step === "itens" ? (
          <div className="modal-body" style={{ paddingTop: 16 }}>
            <div className="mp-field" style={{ marginBottom: 14 }}>
              <label>Data de entrega</label>
              <input className="mp-input" type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {itens.map((it, i) => (
                <div key={i} className="epi-item">
                  <div className="epi-item-head">
                    <span>Item {i + 1}</span>
                    {itens.length > 1 && (
                      <button type="button" className="icon-btn sm danger" title="Remover item" onClick={() => removeItem(i)}><Trash2 size={14} /></button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", gap: 10 }}>
                    <div className="mp-field">
                      <label>Equipamento</label>
                      <input className="mp-input" placeholder="Ex.: Capacete de segurança" value={it.equipamento} onChange={e => updItem(i, { equipamento: e.target.value })} />
                    </div>
                    <div className="mp-field">
                      <label>CA</label>
                      <input className="mp-input" placeholder="Ex.: 38.241" value={it.ca} onChange={e => updItem(i, { ca: e.target.value })} />
                    </div>
                    <div className="mp-field">
                      <label>Validade</label>
                      <input className="mp-input" type="date" value={it.dataValidade} onChange={e => updItem(i, { dataValidade: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="tbtn ghost" style={{ alignSelf: "flex-start", marginTop: 10 }} onClick={addItem}>
              <Plus size={13} /> Adicionar item
            </button>

            <div className="modal-foot">
              <button type="button" className="tbtn ghost" onClick={handleSalvarSemAssinar} disabled={!canSave || criar.isPending}>
                Salvar sem assinar
              </button>
              <button type="button" className="tbtn primary" onClick={handleContinuarParaAssinatura} disabled={!canSave || criar.isPending}>
                {criar.isPending ? <Loader2 size={13} className="btn-spinner" /> : <CheckCircle2 size={13} />}
                Continuar para assinatura
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body" style={{ paddingTop: 16 }}>
            {fichaId && colaboradorIdCriado && (
              <AssinaturaFichaFlow
                fichaId={fichaId}
                empresaId={empresaId}
                colaboradorId={colaboradorIdCriado}
                onSigned={onClose}
                onCancel={onClose}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
