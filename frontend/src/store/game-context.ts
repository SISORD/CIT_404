import { createContext, useContext } from 'react'
import type { GameState, InventoryEntry, Wallet } from '@/types'

/** See the note in auth-context.ts: kept apart so Fast Refresh works. */
export interface GameContextValue {
  state: GameState | undefined
  wallet: Wallet
  inventory: InventoryEntry[]
  loading: boolean
  onlineOperators: string[]
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>')
  return ctx
}
