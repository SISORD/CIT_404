import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Lock, Rocket, Shield, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, countdown, stars } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/fx'
import type { Mission } from '@/types'

const INSURANCE_COST = 100

export function Missions() {
  const { wallet, inventory } = useGame()

  const { data, isLoading } = useQuery({
    queryKey: ['missions'],
    queryFn: () => apiGet<{ locked: boolean; missions: Mission[] }>('/game/missions'),
    refetchInterval: 30_000,
  })

  if (isLoading) return <EmptyState>SCANNING TERRITORY FOR RECOVERY MISSIONS…</EmptyState>

  if (data?.locked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Missions — Phase II</CardTitle>
          <Badge variant="alert">
            <Lock className="size-3" /> Locked
          </Badge>
        </CardHeader>
        <CardContent>
          <EmptyState>
            THE CORE CANNOT BE RESTORED REMOTELY.
            <br />
            FIELD OPERATIONS OPEN WHEN THE DIGITAL ARENA CLOSES.
          </EmptyState>
        </CardContent>
      </Card>
    )
  }

  const held = new Set(inventory.filter((i) => i.quantity > 0).map((i) => i.code))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-lg tracking-[0.18em] text-term uppercase">
            Field Missions · Phase II
          </h2>
          <p className="mt-0.5 text-[11px] text-term/45">
            CIT$ is deducted the moment a mission is purchased.
          </p>
        </div>
        <Badge>{wallet.balance.toLocaleString()} CIT$</Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {data?.missions.map((m) => (
          <MissionCard key={m.id} mission={m} balance={wallet.balance} held={held} />
        ))}
      </div>
    </div>
  )
}

function MissionCard({
  mission, balance, held,
}: { mission: Mission; balance: number; held: Set<string> }) {
  const queryClient = useQueryClient()
  const [insure, setInsure] = useState(false)
  const [, tick] = useState(0)

  // Refresh the countdown every second while a mission is running.
  useEffect(() => {
    if (mission.team_status !== 'PURCHASED' || !mission.deadline_at) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [mission.team_status, mission.deadline_at])

  const buy = useMutation({
    mutationFn: () =>
      apiPost('/game/missions/purchase', { missionCode: mission.code, withInsurance: insure }),
    onSuccess: () => {
      toast('MISSION DEPLOYED', { description: `${mission.mission_name} — check your instructions.` })
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
    },
    onError: (err) =>
      toast('ACQUISITION DENIED', {
        description: err instanceof ApiError ? err.message : 'TRANSACTION FAILED.',
      }),
  })

  const total = mission.entry_cost + (insure ? INSURANCE_COST : 0)
  const missingItems = mission.required_items.filter((code) => !held.has(code))
  const owned = mission.team_status === 'PURCHASED' || mission.team_status === 'COMPLETED'
  const canBuy = !owned && balance >= total && missingItems.length === 0

  return (
    <Card className={cn(owned && 'border-term/50')}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">{mission.mission_name}</CardTitle>
          <div className="mt-0.5 text-[11px] text-warn">{stars(mission.difficulty_stars)}</div>
        </div>
        {mission.team_status === 'COMPLETED' ? (
          <Badge>Complete</Badge>
        ) : mission.team_status === 'PURCHASED' ? (
          <Badge variant="warn">Deployed</Badge>
        ) : (
          <Badge variant="muted">{mission.entry_cost} CIT$</Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-[11px] leading-relaxed text-term/60">{mission.description}</p>

        <div className="grid grid-cols-3 gap-2 border-y border-edge py-2 text-center">
          <Meta label="Cost" value={String(mission.entry_cost)} />
          <Meta label="Reward" value={String(mission.reward)} tone="text-term" />
          <Meta
            label="Energy"
            value={String(mission.core_energy)}
            tone="text-info"
            icon={<Zap className="size-3" />}
          />
        </div>

        {mission.required_items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-term/40 uppercase">Requires:</span>
            {mission.required_items.map((code) => (
              <Badge key={code} variant={held.has(code) ? 'default' : 'alert'}>
                {code}
              </Badge>
            ))}
          </div>
        )}

        {owned ? (
          <div className="border border-term/40 bg-term/5 p-3 text-center">
            <div className="text-[11px] tracking-[0.14em] text-term uppercase">
              {mission.team_status === 'COMPLETED' ? 'Mission complete' : 'Mission active'}
            </div>
            {mission.deadline_at && mission.team_status === 'PURCHASED' && (
              <div className="mt-1 flex items-center justify-center gap-1.5 font-display text-xl tabular-nums text-warn">
                <Clock className="size-4" />
                {countdown(mission.deadline_at)}
              </div>
            )}
            {mission.has_insurance && (
              <Badge variant="info" className="mt-2">
                <Shield className="size-3" /> Insured
              </Badge>
            )}
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2 border border-edge bg-black/40 p-2.5 text-[11px] transition-colors hover:border-info/50">
              <input
                type="checkbox"
                checked={insure}
                onChange={(e) => setInsure(e.target.checked)}
                className="size-3.5 accent-[#00e5ff]"
              />
              <Shield className="size-3.5 text-info" />
              <span className="text-term/70">
                Add insurance — recover 50% of the entry cost on failure
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-info">+{INSURANCE_COST}</span>
            </label>

            <Button
              className="w-full"
              variant={canBuy ? 'default' : 'outline'}
              disabled={!canBuy || buy.isPending}
              onClick={() => buy.mutate()}
            >
              <Rocket />
              {missingItems.length > 0
                ? `Requires ${missingItems[0]}`
                : balance < total
                  ? 'Insufficient CIT$'
                  : `Deploy — ${total} CIT$`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Meta({
  label, value, tone = 'text-term/80', icon,
}: { label: string; value: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.12em] text-term/35 uppercase">{label}</div>
      <div className={cn('mt-0.5 flex items-center justify-center gap-1 font-display text-sm tabular-nums', tone)}>
        {icon}
        {value}
      </div>
    </div>
  )
}
