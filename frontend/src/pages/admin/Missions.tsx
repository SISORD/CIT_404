import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Clock, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiError } from '@/lib/api'
import { countdown, stars, timeAgo } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, Tbody, Td, Th, Thead, TableWrap, Tr } from '@/components/ui/table'
import { EmptyState } from '@/components/fx'

interface PendingRow {
  id: number
  purchased_at: string
  deadline_at: string | null
  has_insurance: boolean
  paid_amount: number
  team_name: string
  team_id: number
  mission_name: string
  reward: number
}

interface MissionRow {
  id: number
  code: string
  mission_name: string
  entry_cost: number
  difficulty_stars: number
  reward: number
  core_energy: number
  purchases: number
  completed: number
  failed: number
  in_progress: number
}

export function AdminMissions() {
  const queryClient = useQueryClient()

  const { data: pending } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: () => apiGet<PendingRow[]>('/admin/missions/pending'),
    refetchInterval: 5_000,
  })

  const { data: missions } = useQuery({
    queryKey: ['admin-missions'],
    queryFn: () => apiGet<MissionRow[]>('/admin/missions'),
    refetchInterval: 15_000,
  })

  const resolve = useMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome: 'COMPLETED' | 'FAILED' }) =>
      apiPost(`/admin/missions/${id}/resolve`, { outcome }),
    onSuccess: (_r, { outcome }) => {
      toast(outcome === 'COMPLETED' ? 'MISSION VALIDATED' : 'MISSION FAILED', {
        description: 'Payout and ledger entry written.',
      })
      queryClient.invalidateQueries({ queryKey: ['admin-pending'] })
      queryClient.invalidateQueries({ queryKey: ['admin-missions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-teams'] })
    },
    onError: (err) =>
      toast('ACTION DENIED', {
        description: err instanceof ApiError ? err.message : 'REQUEST FAILED.',
      }),
  })

  return (
    <div className="space-y-4">
      {/* Field validation queue — the one screen the game master watches. */}
      <Card>
        <CardHeader>
          <CardTitle>Awaiting field validation</CardTitle>
          <Badge variant="warn">{pending?.length ?? 0} pending</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {!pending?.length ? (
            <div className="p-4">
              <EmptyState>NO MISSIONS AWAITING VALIDATION.</EmptyState>
            </div>
          ) : (
            <TableWrap>
              <Table>
                <Thead>
                  <tr>
                    <Th>Team</Th>
                    <Th>Mission</Th>
                    <Th className="text-right">Paid</Th>
                    <Th className="text-right">Reward</Th>
                    <Th>Insurance</Th>
                    <Th className="text-right">Time left</Th>
                    <Th className="text-right">Resolve</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {pending.map((row) => {
                    const left = countdown(row.deadline_at)
                    return (
                      <Tr key={row.id}>
                        <Td>
                          <Link
                            to={`/admin/teams/${row.team_id}`}
                            className="font-bold text-term hover:underline"
                          >
                            {row.team_name}
                          </Link>
                        </Td>
                        <Td>{row.mission_name}</Td>
                        <Td className="text-right tabular-nums text-alert/70">{row.paid_amount}</Td>
                        <Td className="text-right tabular-nums text-term">{row.reward}</Td>
                        <Td>{row.has_insurance ? <Badge variant="info">Insured</Badge> : '--'}</Td>
                        <Td className="text-right">
                          {left ? (
                            <span
                              className={`inline-flex items-center gap-1 tabular-nums ${
                                left === 'EXPIRED' ? 'text-alert' : 'text-warn'
                              }`}
                            >
                              <Clock className="size-3" />
                              {left}
                            </span>
                          ) : (
                            <span className="text-term/25">{timeAgo(row.purchased_at)}</span>
                          )}
                        </Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              disabled={resolve.isPending}
                              onClick={() => resolve.mutate({ id: row.id, outcome: 'COMPLETED' })}
                            >
                              <Check /> Pass
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={resolve.isPending}
                              onClick={() => resolve.mutate({ id: row.id, outcome: 'FAILED' })}
                            >
                              <X /> Fail
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mission catalogue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Mission</Th>
                  <Th>Difficulty</Th>
                  <Th className="text-right">Cost</Th>
                  <Th className="text-right">Reward</Th>
                  <Th className="text-right">Energy</Th>
                  <Th className="text-right">Bought</Th>
                  <Th className="text-right">Done</Th>
                  <Th className="text-right">Failed</Th>
                  <Th className="text-right">Active</Th>
                </tr>
              </Thead>
              <Tbody>
                {missions?.map((m) => (
                  <Tr key={m.id}>
                    <Td className="font-bold">{m.mission_name}</Td>
                    <Td className="text-warn">{stars(m.difficulty_stars)}</Td>
                    <Td className="text-right tabular-nums text-warn">{m.entry_cost}</Td>
                    <Td className="text-right tabular-nums text-term">{m.reward}</Td>
                    <Td className="text-right tabular-nums text-info">{m.core_energy}</Td>
                    <Td className="text-right tabular-nums">{m.purchases}</Td>
                    <Td className="text-right tabular-nums text-term">{m.completed}</Td>
                    <Td className="text-right tabular-nums text-alert">{m.failed}</Td>
                    <Td className="text-right tabular-nums text-warn">{m.in_progress}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  )
}
