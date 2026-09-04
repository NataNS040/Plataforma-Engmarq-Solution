import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Envolve as classes CSS legadas (.tbtn) já usadas em todo o app — não
 * introduz um sistema visual novo, só dá a elas uma API de componente
 * (variant/size/loading) tipada, em vez de className solta.
 */
const buttonVariants = cva('tbtn', {
  variants: {
    variant: {
      default: '',
      primary: 'primary',
      accent: 'accent',
      ghost: 'ghost',
      danger: 'danger',
    },
    size: {
      default: '',
      sm: 'sm',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={13} className="btn-spinner" />}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
