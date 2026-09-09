import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  className?: string
  tone?: 'term' | 'warn' | 'info' | 'item' | 'alert'
  label?: string
}

const TONE: Record<NonNullable<ProgressProps['tone']>, string> = {
  term: 'bg-term',
  warn: 'bg-warn',
  info: 'bg-info',
  item: 'bg-item',
  alert: 'bg-alert',
}

export function Progress({ value, max = 100, className, tone = 'term', label }: ProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden border border-edge bg-black/60', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className={cn('h-full transition-[width] duration-500', TONE[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** A labelled "3 / 7" style meter used across both apps. */
export function StatMeter({
  label,
  value,
  max,
  tone = 'term',
}: {
  label: string
  value: number
  max: number
  tone?: ProgressProps['tone']
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="tracking-[0.12em] text-term/60 uppercase">{label}</span>
        <span className="font-bold tabular-nums">
          {value} <span className="text-term/40">/ {max}</span>
        </span>
      </div>
      <Progress value={value} max={max} tone={tone} label={label} />
    </div>
  )
}
