import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * The base surface of the whole interface: a dark panel with a hairline
 * border and cut corners, so it reads as a terminal window rather than a
 * rounded material card.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative border border-edge bg-panel/80 backdrop-blur-[2px]',
        'before:absolute before:top-0 before:left-0 before:size-2 before:border-t before:border-l before:border-term/60',
        'after:absolute after:right-0 after:bottom-0 after:size-2 after:border-r after:border-b after:border-term/60',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 border-b border-edge px-4 py-3', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('font-display text-sm tracking-[0.18em] text-term uppercase', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-xs leading-relaxed text-term/55', className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 border-t border-edge px-4 py-3', className)} {...props} />
}
