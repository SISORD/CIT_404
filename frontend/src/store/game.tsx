import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { formatCIT } from '@/lib/utils'
import { GameContext, type GameContextValue } from './game-context'
import type { GameState, InventoryEntry, Wallet } from '@/types'

/**
 * Three operators share one wallet, so the balance shown on each phone has
 * to be the server's number, not a local guess. REST gives the first value;
 * the socket keeps it true after that. Optimistic local arithmetic is
 * deliberately avoided — two simultaneous purchases would drift apart.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [wallet, setWallet] = useState<Wallet>({ balance: 0, coreEnergy: 0 })
  const [inventory, setInventory] = useState<InventoryEntry[]>([])
  const [onlineOperators, setOnlineOperators] = useState<string[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['game-state'],
    queryFn: () => apiGet<GameState>('/game/state'),
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (!data) return
    setWallet({ balance: data.team.cit_balance, coreEnergy: data.team.core_energy })
    setInventory(data.inventory)
  }, [data])

  useEffect(() => {
    const socket = connectSocket()

    socket.on('wallet_update', (payload: Wallet) => setWallet(payload))
    socket.on('inventory_update', ({ inventory: inv }: { inventory: InventoryEntry[] }) => setInventory(inv))

    socket.on('phase_change', () => {
      queryClient.invalidateQueries({ queryKey: ['game-state'] })
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      toast('SYSTEM MESSAGE', { description: 'THE CORE HAS CHANGED THE PROTOCOL PHASE.' })
    })

    socket.on('mission_resolved', ({ outcome, missionName }: { outcome: string; missionName: string }) => {
      queryClient.invalidateQueries({ queryKey: ['missions'] })
      toast(outcome === 'COMPLETED' ? 'MISSION COMPLETE' : 'MISSION FAILED', { description: missionName })
    })

    socket.on('team_locked', ({ locked }: { locked: boolean }) => {
      toast(locked ? 'ACCOUNT FROZEN' : 'ACCOUNT RESTORED', {
        description: locked ? 'THE CORE HAS SUSPENDED YOUR TEAM.' : 'ACCESS REESTABLISHED.',
      })
    })

    socket.on('operator_online', ({ nickname }: { nickname: string }) =>
      setOnlineOperators((prev) => (prev.includes(nickname) ? prev : [...prev, nickname]))
    )
    socket.on('operator_offline', ({ nickname }: { nickname: string }) =>
      setOnlineOperators((prev) => prev.filter((n) => n !== nickname))
    )

    return () => {
      socket.off('wallet_update')
      socket.off('inventory_update')
      socket.off('phase_change')
      socket.off('mission_resolved')
      socket.off('team_locked')
      socket.off('operator_online')
      socket.off('operator_offline')
      disconnectSocket()
    }
  }, [queryClient])

  // A teammate spending money is worth a heads-up, not a silent number change.
  const [lastBalance, setLastBalance] = useState<number | null>(null)
  useEffect(() => {
    if (lastBalance !== null && wallet.balance !== lastBalance) {
      const delta = wallet.balance - lastBalance
      toast(delta > 0 ? 'CREDIT RECEIVED' : 'DEBIT REGISTERED', {
        description: `${delta > 0 ? '+' : ''}${delta} CIT$ — balance ${formatCIT(wallet.balance)}`,
      })
    }
    setLastBalance(wallet.balance)
    // lastBalance is the previous-value ref; including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.balance])

  const value = useMemo<GameContextValue>(
    () => ({ state: data, wallet, inventory, loading: isLoading, onlineOperators }),
    [data, wallet, inventory, isLoading, onlineOperators]
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
