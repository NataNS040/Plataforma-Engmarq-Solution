import { forwardRef, type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('chip', {
  variants: {
    tone: {
      ok: 'ok',
      warn: 'warn',
      crit: 'crit',
      info: 'info',
      neutral: 'neutral',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  )
)
Badge.displayName = 'Badge'
