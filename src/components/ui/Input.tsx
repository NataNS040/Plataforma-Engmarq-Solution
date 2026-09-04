import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type LabelHTMLAttributes, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Envolve o padrão de formulário já usado em todos os modais (.mp-field /
 * .mp-label / .mp-input) — mesma aparência, com a API de componente.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('mp-input', className)} {...props} />
  )
)
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn('mp-input', className)} {...props} />
  )
)
Select.displayName = 'Select'

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mp-label', className)} {...props} />
}

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mp-field', className)} {...props} />
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null
  return (
    <span role="alert" style={{ color: 'var(--red-600)', fontSize: 11.5, marginTop: 4, display: 'block' }}>
      {children}
    </span>
  )
}
