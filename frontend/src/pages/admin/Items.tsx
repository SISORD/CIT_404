import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, itemTypeVariant } from '@/components/ui/badge'
import { Table, Tbody, Td, Th, Thead, TableWrap, Tr } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { EmptyState, ItemIcon } from '@/components/fx'
import type { ItemType } from '@/types'

interface AdminItem {
  id: number
  code: string
  name: string
  item_type: ItemType
  cost: number
  icon: string
  effect: string
  max_per_team: number | null
  stock: number | null
  is_active: boolean
  units_sold: string | number
  revenue: string | number
  teams_owning: string | number
}

export function Items() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-items'],
    queryFn: () => apiGet<AdminItem[]>('/admin/items'),
    refetchInterval: 15_000,
  })

  if (isLoading) return <EmptyState>LOADING MARKET CATALOGUE…</EmptyState>

  const maxSold = Math.max(1, ...(data ?? []).map((i) => Number(i.units_sold)))
  const totalRevenue = (data ?? []).reduce((s, i) => s + Number(i.revenue), 0)

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Item catalogue</CardTitle>
          <p className="mt-0.5 text-[11px] text-term/45">
            Definitions live in <code className="text-term/70">items</code>; what each team owns lives in{' '}
            <code className="text-term/70">team_inventory</code>.
          </p>
        </div>
        <Badge variant="item">{totalRevenue.toLocaleString()} CIT$ absorbed</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <TableWrap>
          <Table>
            <Thead>
              <tr>
                <Th>Item</Th>
                <Th>Type</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Sold</Th>
                <Th className="w-40">Demand</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Teams</Th>
                <Th className="text-right">Limits</Th>
              </tr>
            </Thead>
            <Tbody>
              {data?.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ItemIcon name={item.icon} className="size-4 text-term/60" />
                      <div>
                        <div className="font-bold">{item.name}</div>
                        <div className="max-w-64 truncate text-[10px] text-term/35">{item.effect}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={itemTypeVariant(item.item_type)}>{item.item_type}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums text-warn">{item.cost}</Td>
                  <Td className="text-right font-bold tabular-nums">{item.units_sold}</Td>
                  <Td>
                    <Progress
                      value={Number(item.units_sold)}
                      max={maxSold}
                      tone="item"
                      label={`${item.name} demand`}
                    />
                  </Td>
                  <Td className="text-right tabular-nums text-item">
                    {Number(item.revenue).toLocaleString()}
                  </Td>
                  <Td className="text-right tabular-nums text-term/50">{item.teams_owning}</Td>
                  <Td className="text-right text-[10px] text-term/35">
                    {item.max_per_team !== null ? `max ${item.max_per_team}` : '∞'}
                    {item.stock !== null && ` · stock ${item.stock}`}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableWrap>
      </CardContent>
    </Card>
  )
}
