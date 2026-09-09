import { useEffect, useState, type ReactNode } from 'react'
import {
  Lightbulb, KeyRound, Shield, Timer, Radar, Zap, RefreshCw, MapPin,
  Route, LockOpen, RotateCcw, Package, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Item codes map to a lucide icon via the `icon` column in the catalogue. */
const ICONS: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  'key-round': KeyRound,
  shield: Shield,
  timer: Timer,
  radar: Radar,
  zap: Zap,
  'refresh-cw': RefreshCw,
  'map-pin': MapPin,
  route: Route,
  'lock-open': LockOpen,
  'rotate-ccw': RotateCcw,
  package: Package,
}

export function ItemIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Package
  return <Icon className={cn('size-5', className)} aria-hidden />
}

/** Chromatic-aberration title. Purely decorative, so it is aria-hidden. */
export function GlitchTitle({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn('glitch relative inline-block', className)} data-glitch={children} aria-hidden>
      {children}
    </span>
  )
}

/**
 * Types text out one character at a time. Respects prefers-reduced-motion
 * by rendering the full string immediately.
 */
export function TypeWriter({
  text,
  speed = 28,
  className,
  onDone,
}: {
  text: string
  speed?: number
  className?: string
  onDone?: () => void
}) {
  const [shown, setShown] = useState('')

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text)
      onDone?.()
      return
    }
    setShown('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(id)
        onDone?.()
      }
    }, speed)
    return () => clearInterval(id)
    // onDone is intentionally excluded: callers pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed])

  return (
    <span className={className}>
      {shown}
      <span className="animate-blink text-term">_</span>
    </span>
  )
}

/** A framed block of monospace output, used for story and system messages. */
export function TerminalBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border-l-2 border-term/50 bg-black/40 py-3 pr-4 pl-4 text-xs leading-relaxed text-term/85',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Full-screen loader shown while the silent session refresh runs. */
export function BootScreen({ message = 'ESTABLISHING CORE CONNECTION' }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="font-display text-2xl tracking-[0.3em] text-term text-glow">CIT: 404</div>
      <div className="text-[11px] tracking-[0.2em] text-term/60 uppercase">
        <TypeWriter text={message} />
      </div>
    </div>
  )
}

/** Consistent "nothing here yet" state instead of a bare paragraph. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-edge px-4 py-10 text-center text-xs text-term/40">
      {children}
    </div>
  )
}
