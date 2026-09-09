import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Flag, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { cn, stars } from '@/lib/utils'
import { useGame } from '@/store/game-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/fx'
import type { Challenge, Category } from '@/types'

const CATEGORIES: { key: Category; title: string; blurb: string; tone: 'default' | 'info' | 'warn' }[] = [
  { key: 'CP',   title: 'Computational Problems', blurb: 'Logical and algorithmic problems. Harder problems pay more.', tone: 'default' },
  { key: 'CTF',  title: 'Capture the Flag',       blurb: 'Explore, analyze, exploit, recover the hidden flags.',        tone: 'info' },
  { key: 'DATA', title: 'Data Challenges',        blurb: 'Analyze corrupted fragments and recover the information.',    tone: 'warn' },
]

export function Challenges() {
  const { state } = useGame()
  const phase = state?.phase.phase ?? 'LOBBY'
  const arenaOpen = phase === 'PHASE_I' || phase === 'PHASE_II' || phase === 'ENDGAME'

  const { data, isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: () => apiGet<Challenge[]>('/game/challenges'),
    enabled: arenaOpen,
  })

  const [open, setOpen] = useState<Category | null>('CP')

  if (!arenaOpen) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Challenges — Phase I</CardTitle>
          <Badge variant="alert">
            <Lock className="size-3" /> Locked
          </Badge>
        </CardHeader>
        <CardContent>
          <EmptyState>THE DIGITAL ARENA HAS NOT OPENED YET. STAND BY, OPERATOR.</EmptyState>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg tracking-[0.18em] text-term uppercase">
          Challenges · Phase I
        </h2>
        <Badge>
          {data?.filter((c) => c.solved).length ?? 0} / {data?.length ?? 0} recovered
        </Badge>
      </div>

      {CATEGORIES.map((cat) => {
        const list = data?.filter((c) => c.category === cat.key) ?? []
        const isOpen = open === cat.key
        return (
          <Card key={cat.key}>
            <button
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-term/5"
              onClick={() => setOpen(isOpen ? null : cat.key)}
              aria-expanded={isOpen}
            >
              <div>
                <div className="font-display text-sm tracking-[0.16em] text-term uppercase">
                  {cat.title}
                </div>
                <div className="mt-0.5 text-[11px] text-term/45">{cat.blurb}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={cat.tone}>
                  {list.filter((c) => c.solved).length}/{list.length}
                </Badge>
                <ChevronDown
                  className={cn('size-4 text-term/50 transition-transform', isOpen && 'rotate-180')}
                />
              </div>
            </button>

            {isOpen && (
              <CardContent className="space-y-2 border-t border-edge pt-4">
                {isLoading ? (
                  <EmptyState>DECRYPTING CHALLENGE INDEX…</EmptyState>
                ) : list.length === 0 ? (
                  <EmptyState>NO {cat.key} CHALLENGES AVAILABLE.</EmptyState>
                ) : (
                  list.map((c) => <ChallengeCard key={c.id} challenge={c} />)
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const queryClient = useQueryClient()
  const [flag, setFlag] = useState('')

  const submit = useMutation({
    mutationFn: () =>
      apiPost<{ success: boolean; reward: number }>('/game/submit-flag', {
        challengeCode: challenge.code,
        flag,
      }),
    onSuccess: (res) => {
      toast('FRAGMENT RECOVERED', { description: `+${res.reward} CIT$ — ${challenge.title}` })
      setFlag('')
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
    },
    onError: (err) => {
      toast('SUBMISSION REJECTED', {
        description: err instanceof ApiError ? err.message : 'INVALID FLAG OR CORRUPTED DATA.',
      })
    },
  })

  return (
    <div
      className={cn(
        'border bg-black/40 p-3 transition-colors',
        challenge.solved ? 'border-term/40 bg-term/5' : 'border-edge'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.14em] text-term/40">{challenge.code}</span>
            {challenge.solved && (
              <Badge>
                <Check className="size-3" /> Recovered
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-sm font-bold text-term">{challenge.title}</div>
          {challenge.description && (
            <p className="mt-1 text-[11px] leading-snug text-term/55">{challenge.description}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-warn">{stars(challenge.difficulty)}</div>
          <div className="mt-0.5 font-display text-sm tabular-nums text-term">
            +{challenge.reward}
          </div>
          <div className="text-[10px] text-term/35">CIT$</div>
        </div>
      </div>

      {!challenge.solved && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (flag.trim()) submit.mutate()
          }}
        >
          <Input
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            placeholder="CIT{...}"
            className="h-9 flex-1"
            autoComplete="off"
            aria-label={`Flag for ${challenge.code}`}
          />
          <Button type="submit" size="sm" disabled={submit.isPending || !flag.trim()}>
            <Flag /> {submit.isPending ? '…' : 'Submit'}
          </Button>
        </form>
      )}
    </div>
  )
}
