import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full border border-edge bg-black/60 px-3 font-mono text-sm text-term',
        'placeholder:text-term/30 transition-colors',
        'focus:border-term focus:outline-none focus:shadow-[0_0_18px_-6px_var(--color-term)]',
        'disabled:opacity-40',
        className
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('mb-2 block text-[11px] tracking-[0.16em] text-term/60 uppercase', className)}
      {...props}
    />
  )
}
