import { useEffect, useRef, useState } from "react"
import { Camera, RotateCcw, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react"
import { comingSoon } from "@/lib/comingSoon"

/**
 * Captura de "assinatura facial" — presencial: liga a câmera do próprio
 * dispositivo (colaborador na frente), tira uma foto e usa ela como
 * comprovante de recebimento dos EPIs. Não há verificação automática de
 * identidade nenhuma ainda (fica "em breve" — ver botão abaixo); a
 * confirmação de que é a pessoa certa é visual, feita por quem está
 * testemunhando a entrega.
 */

export interface FacialCaptureProps {
  onCapture: (blob: Blob) => void
  onCancel: () => void
}

type Stage = "consent" | "starting" | "live" | "preview" | "error"

export function FacialCapture({ onCapture, onCancel }: FacialCaptureProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [stage, setStage]     = useState<Stage>("consent")
  const [errorMsg, setErrorMsg] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => stopStream(), [])

  async function startCamera() {
    setStage("starting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setStage("live")
    } catch {
      setErrorMsg("Não foi possível acessar a câmera. Verifique a permissão do navegador e tente novamente.")
      setStage("error")
    }
  }

  function capturar() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) return
      setPhotoBlob(blob)
      setPhotoUrl(URL.createObjectURL(blob))
      stopStream()
      setStage("preview")
    }, "image/jpeg", 0.9)
  }

  function repetir() {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoUrl(null)
    setPhotoBlob(null)
    void startCamera()
  }

  function confirmar() {
    if (!photoBlob) return
    onCapture(photoBlob)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {stage === "consent" && (
        <div style={{ textAlign: "center", padding: "12px 4px" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--color-accent-soft)", color: "var(--color-accent)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
            <Camera size={22} />
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            Assinatura por foto
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.5, maxWidth: 340, margin: "0 auto 18px" }}>
            Ao continuar, uma foto do colaborador será capturada agora, presencialmente, como
            comprovante de recebimento dos itens listados nesta ficha. A foto fica salva apenas
            para fins de auditoria interna da empresa.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button type="button" className="tbtn ghost" onClick={onCancel}>Cancelar</button>
            <button type="button" className="tbtn primary" onClick={() => void startCamera()}>
              <Camera size={13} /> Ligar câmera
            </button>
          </div>
        </div>
      )}

      {stage === "starting" && (
        <div style={{ textAlign: "center", padding: "32px 4px", color: "var(--ink-500)" }}>
          <Loader2 size={22} className="btn-spinner" style={{ display: "inline-block", marginBottom: 10 }} />
          <div style={{ fontSize: 12.5 }}>Solicitando acesso à câmera…</div>
        </div>
      )}

      {stage === "error" && (
        <div style={{ textAlign: "center", padding: "20px 4px" }}>
          <AlertTriangle size={22} style={{ color: "var(--red-500)", marginBottom: 10 }} />
          <p style={{ fontSize: 12.5, color: "var(--ink-700)", lineHeight: 1.5, marginBottom: 16 }}>{errorMsg}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button type="button" className="tbtn ghost" onClick={onCancel}>Cancelar</button>
            <button type="button" className="tbtn primary" onClick={() => void startCamera()}>Tentar novamente</button>
          </div>
        </div>
      )}

      {(stage === "live" || stage === "preview") && (
        <>
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#000", aspectRatio: "4 / 3" }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover", display: stage === "live" ? "block" : "none", transform: "scaleX(-1)" }}
            />
            {stage === "preview" && photoUrl && (
              <img src={photoUrl} alt="Foto capturada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />

          <button
            type="button"
            className="tbtn ghost sm is-soon"
            title="Em breve"
            style={{ alignSelf: "center", fontSize: 11.5 }}
            onClick={() => comingSoon("Verificação automática de identidade")}
          >
            <ShieldCheck size={12} /> Verificação automática de identidade
          </button>

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button type="button" className="tbtn ghost" onClick={onCancel}>Cancelar</button>
            {stage === "live" ? (
              <button type="button" className="tbtn primary" onClick={capturar}>
                <Camera size={13} /> Capturar foto
              </button>
            ) : (
              <>
                <button type="button" className="tbtn" onClick={repetir}><RotateCcw size={13} /> Repetir</button>
                <button type="button" className="tbtn primary" onClick={confirmar}>
                  <ShieldCheck size={13} /> Confirmar assinatura
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
