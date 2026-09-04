import { Loader2, Trash2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface ConfirmDialogProps {
  title: string
  /** Corpo da mensagem — pode incluir <strong> etc. via JSX. */
  description: React.ReactNode
  icon?: LucideIcon
  confirmLabel?: string
  cancelLabel?: string
  /** Ação destrutiva (exclusão) usa o botão vermelho — true por padrão. */
  danger?: boolean
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Generaliza o padrão de confirmação já usado em ExamesPage (ConfirmDelete)
 * para qualquer ação (exclusão de treinamento, empresa, etc.) — mesmo
 * markup (.modal-backdrop/.modal/.del-ic), agora reutilizável.
 */
export function ConfirmDialog({
  title,
  description,
  icon: Icon = Trash2,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  danger = true,
  loading,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 430 }} onClick={e => e.stopPropagation()}>
        <div className="modal-body" style={{ paddingTop: 26 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div className="del-ic"><Icon size={20} /></div>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 18, fontFamily: 'var(--font-display)' }}>{title}</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.5 }}>
                {description}
              </p>
            </div>
          </div>
          <div className="modal-foot">
            <Button variant="default" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading}>
              {loading ? <Loader2 size={13} className="btn-spinner" /> : <Icon size={13} />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
