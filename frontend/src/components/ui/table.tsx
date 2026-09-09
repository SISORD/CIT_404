import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Wide tables scroll inside their own container, never the page body. */
export function TableWrap({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-left text-xs', className)} {...props} />
}

export function Thead({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('border-b border-term/30 text-[10px] tracking-[0.14em] text-term/60 uppercase', className)}
      {...props}
    />
  )
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return <th className={cn('px-3 py-2 font-medium whitespace-nowrap', className)} {...props} />
}

export function Tbody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-edge', className)} {...props} />
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-term/5', className)} {...props} />
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2 align-middle whitespace-nowrap', className)} {...props} />
}
