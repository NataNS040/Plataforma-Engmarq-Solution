import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/modules/auth/AuthProvider"
import { useAssinarFichaEpi } from "@/hooks/queries/useFichasEpi"
import { uploadAssinaturaFoto } from "@/services/fichasEpiService"
import { FacialCapture } from "@/components/ui/FacialCapture"

/**
 * Fluxo de captura + gravação da assinatura de uma ficha de EPI já
 * existente. Extraído pra ser reaproveitado tanto no wizard de criação
 * (FichaEpiModal) quanto no "Assinar agora" do detalhe de uma ficha ainda
 * não assinada (FichaEpiDetailModal).
 */
export function AssinaturaFichaFlow({ fichaId, empresaId, colaboradorId, onSigned, onCancel }: {
  fichaId: string
  empresaId: string
  colaboradorId: string
  onSigned: () => void
  onCancel: () => void
}) {
  const { profile } = useAuth()
  const assinar = useAssinarFichaEpi()
  const [uploading, setUploading] = useState(false)

  async function handleFotoCapturada(blob: Blob) {
    if (!profile) return
    setUploading(true)
    try {
      const fotoUrl = await uploadAssinaturaFoto(empresaId, blob)
      await assinar.mutateAsync({ id: fichaId, fotoUrl, assinadoPor: profile.id, empresaId, colaboradorId })
      onSigned()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  if (uploading || assinar.isPending) {
    return (
      <div style={{ textAlign: "center", padding: "32px 4px", color: "var(--ink-500)" }}>
        <Loader2 size={22} className="btn-spinner" style={{ display: "inline-block", marginBottom: 10 }} />
        <div style={{ fontSize: 12.5 }}>Salvando assinatura…</div>
      </div>
    )
  }

  return <FacialCapture onCapture={blob => void handleFotoCapturada(blob)} onCancel={onCancel} />
}
