import { NavLink, Outlet } from 'react-router-dom'
import { Backpack, LogOut, Users, Zap } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/store/auth-context'
import { useGame } from '@/store/game-context'
import { cn, formatCIT } from '@/lib/utils'
import { Badge, itemTypeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { StatMeter } from '@/components/ui/progress'
import { EmptyState, ItemIcon } from '@/components/fx'

const TABS = [
  { to: '/', label: 'HOME', end: true },
  { to: '/challenges', label: 'CHALLENGES' },
  { to: '/missions', label: 'MISSIONS' },
  { to: '/market', label: 'MARKET' },
  { to: '/story', label: 'STORY' },
]

const PHASE_LABEL: Record<string, string> = {
  LOBBY: 'STANDBY',
  PHASE_I: 'PHASE I — DIGITAL ARENA',
  PHASE_II: 'PHASE II — FIELD OPERATIONS',
  ENDGAME: 'RECOVERY PROTOCOL: FINAL',
  CLOSED: 'NETWORK LOCKED',
}

export function OperatorLayout() {
  const { team, logout } = useAuth()
  const { wallet, inventory, state, onlineOperators } = useGame()
  const [openPanel, setOpenPanel] = useState<'team' | 'inventory' | null>(null)

  const solved = state?.solvedChallenges ?? []
  const count = (c: string) => solved.filter((s) => s.category === c).length
  const itemCount = inventory.reduce((sum, i) => sum + i.quantity, 0)
  const phase = state?.phase.phase ?? 'LOBBY'

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      {/* ---------------- HEADER ---------------- */}
      <header className="sticky top-0 z-40 border-b border-term/30 bg-black/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => setOpenPanel('team')}
            className="group flex items-center gap-3 text-left"
            aria-label="Open team panel"
          >
            <span className="flex size-11 shrink-0 items-center justify-center border border-warn/60 bg-black text-warn transition-colors group-hover:border-warn">
              <Users className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm tracking-[0.16em] text-term">
                {team?.teamName ?? 'TEAM --'}
              </span>
              <span className="block text-xs tabular-nums text-term/70">{formatCIT(wallet.balance)}</span>
            </span>
          </button>

          <div className="hidden text-center sm:block">
            <div className="text-[10px] tracking-[0.2em] text-term/40 uppercase">Protocol status</div>
            <div className="text-[11px] tracking-[0.14em] text-term/80">{PHASE_LABEL[phase]}</div>
          </div>

          <button
            onClick={() => setOpenPanel('inventory')}
            className="group flex items-center gap-3 text-right"
            aria-label="Open inventory"
          >
            <span className="leading-tight">
              <span className="block font-display text-sm tracking-[0.16em] text-term">INVENTORY</span>
              <span className="block text-xs tabular-nums text-term/70">{itemCount} items</span>
            </span>
            <span className="relative flex size-11 shrink-0 items-center justify-center border border-item/60 bg-black text-item transition-colors group-hover:border-item">
              <Backpack className="size-5" />
              {itemCount > 0 && (
                <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center border border-item bg-black text-[10px] font-bold text-item">
                  {itemCount}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* ---------------- NAV ---------------- */}
        <nav className="mx-auto flex max-w-6xl border-t border-edge">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'flex-1 border-r border-edge px-2 py-2.5 text-center text-[11px] font-bold tracking-[0.14em] uppercase transition-colors last:border-r-0',
                  isActive
                    ? 'bg-term/10 text-term text-glow shadow-[inset_0_-2px_0_0_var(--color-term)]'
                    : 'text-term/45 hover:bg-term/5 hover:text-term/80'
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-edge px-4 py-3 text-center text-[10px] tracking-[0.16em] text-term/30 uppercase">
        CIT: 404 — Recovery Protocol · Operator {team?.nickname}
      </footer>

      {/* ---------------- TEAM PANEL ---------------- */}
      <Dialog open={openPanel === 'team'} onOpenChange={(o) => setOpenPanel(o ? 'team' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{team?.teamName}</DialogTitle>
            <DialogDescription>Shared account · {team?.nickname}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-edge bg-black/40 p-3">
                <div className="text-[10px] tracking-[0.14em] text-term/50 uppercase">Wallet</div>
                <div className="mt-1 font-display text-xl tabular-nums text-term text-glow">
                  {wallet.balance.toLocaleString()}
                </div>
                <div className="text-[10px] text-term/40">CIT$</div>
              </div>
              <div className="border border-edge bg-black/40 p-3">
                <div className="text-[10px] tracking-[0.14em] text-term/50 uppercase">Core Energy</div>
                <div className="mt-1 flex items-center gap-1 font-display text-xl tabular-nums text-info">
                  <Zap className="size-4" />
                  {wallet.coreEnergy}
                </div>
                <div className="text-[10px] text-term/40">Restoration progress</div>
              </div>
            </div>

            <div className="space-y-3">
              <StatMeter label="CP Challenges" value={count('CP')} max={4} />
              <StatMeter label="CTF Challenges" value={count('CTF')} max={4} tone="info" />
              <StatMeter label="Data Fragments" value={count('DATA')} max={4} tone="warn" />
              <StatMeter
                label="Missions Deployed"
                value={state?.missions.length ?? 0}
                max={5}
                tone="item"
              />
            </div>

            {onlineOperators.length > 0 && (
              <div>
                <div className="mb-2 text-[10px] tracking-[0.14em] text-term/50 uppercase">
                  Operators online
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {onlineOperators.map((n) => (
                    <Badge key={n}>{n}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Button variant="danger" className="w-full" onClick={logout}>
              <LogOut /> Disconnect operator
            </Button>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ---------------- INVENTORY PANEL ---------------- */}
      <Dialog open={openPanel === 'inventory'} onOpenChange={(o) => setOpenPanel(o ? 'inventory' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inventory</DialogTitle>
            <DialogDescription>
              Shared across all three operators · stored server-side
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {inventory.length === 0 ? (
              <EmptyState>NO ASSETS ACQUIRED. VISIT THE MARKET.</EmptyState>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {inventory.map((item) => (
                  <li key={item.id} className="flex gap-3 border border-edge bg-black/40 p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center border border-edge text-term/70">
                      <ItemIcon name={item.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold">{item.name}</span>
                        <span className="text-xs font-bold tabular-nums text-term">×{item.quantity}</span>
                      </div>
                      <Badge variant={itemTypeVariant(item.item_type)} className="mt-1">
                        {item.item_type}
                      </Badge>
                      <p className="mt-1.5 text-[11px] leading-snug text-term/50">{item.effect}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
