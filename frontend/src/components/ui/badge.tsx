import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] uppercase',
  {
    variants: {
      variant: {
        default: 'border-term/40 bg-term/10 text-term',
        muted: 'border-edge bg-white/5 text-term/50',
        alert: 'border-alert/50 bg-alert/10 text-alert',
        warn: 'border-warn/50 bg-warn/10 text-warn',
        info: 'border-info/50 bg-info/10 text-info',
        item: 'border-item/50 bg-item/10 text-item',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

/** Maps an item type to its badge colour so the palette stays consistent. */
export function itemTypeVariant(type: string): VariantProps<typeof badgeVariants>['variant'] {
  switch (type) {
    case 'HINT': return 'warn'
    case 'INSURANCE': return 'info'
    case 'BOOST': return 'item'
    case 'ACCESS': return 'default'
    default: return 'muted'
  }
}
