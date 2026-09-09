import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiGet } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TableWrap } from '@/components/ui/table'
import { EmptyState, ItemIcon } from '@/components/fx'
import type { TeamItemRow } from '@/types'

/**
 * The "who owns what" matrix — teams down the side, items across the top.
 * This is the question the admin platform exists to answer at a glance.
 */
export function Inventory() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-inventory'],
    queryFn: () => apiGet<TeamItemRow[]>('/admin/inventory'),
    refetchInterval: 10_000,
  })

  if (isLoading) return <EmptyState>BUILDING INVENTORY MATRIX…</EmptyState>
  if (!data?.length) return <EmptyState>NO TEAM OWNS ANY ITEM YET.</EmptyState>

  const teams = [...new Map(data.map((r) => [r.team_id, r.team_name])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { numeric: true })
  )
  const items = [...new Map(data.map((r) => [r.code, r])).values()].sort((a, b) =>
    a.item_type.localeCompare(b.item_type)
  )

  const lookup = new Map(data.map((r) => [`${r.team_id}:${r.code}`, r.quantity]))
  const maxQty = Math.max(...data.map((r) => r.quantity))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory matrix</CardTitle>
        <Badge variant="item">{data.length} holdings</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <TableWrap>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-term/30">
                <th className="sticky left-0 z-10 bg-panel px-3 py-2 text-left text-[10px] tracking-[0.14em] text-term/60 uppercase">
                  Team
                </th>
                {items.map((item) => (
                  <th key={item.code} className="px-2 py-2 text-center align-bottom">
                    <div className="flex flex-col items-center gap-1">
                      <ItemIcon name={item.icon} className="size-4 text-term/50" />
                      <span className="text-[9px] leading-tight text-term/40">
                        {item.name.split(' ').map((w, i) => (
                          <span key={i} className="block">
                            {w}
                          </span>
                        ))}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-[10px] tracking-[0.14em] text-term/60 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {teams.map(([teamId, teamName]) => {
                const total = items.reduce((s, i) => s + (lookup.get(`${teamId}:${i.code}`) ?? 0), 0)
                return (
                  <tr key={teamId} className="transition-colors hover:bg-term/5">
                    <td className="sticky left-0 z-10 bg-panel px-3 py-2">
                      <Link to={`/admin/teams/${teamId}`} className="font-bold text-term hover:underline">
                        {teamName}
                      </Link>
                    </td>
                    {items.map((item) => {
                      const qty = lookup.get(`${teamId}:${item.code}`) ?? 0
                      return (
                        <td key={item.code} className="px-2 py-2 text-center">
                          <span
                            className={cn(
                              'inline-flex size-7 items-center justify-center border text-[11px] font-bold tabular-nums',
                              qty === 0
                                ? 'border-edge/50 text-term/15'
                                : 'border-item/60 text-item'
                            )}
                            style={
                              qty > 0
                                ? { background: `rgba(255,79,163,${0.06 + (qty / maxQty) * 0.22})` }
                                : undefined
                            }
                          >
                            {qty || '·'}
                          </span>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-term">{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      </CardContent>
    </Card>
  )
}
