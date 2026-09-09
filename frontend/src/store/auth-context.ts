import { createContext, useContext } from 'react'
import type { AdminSubject, Subject, TeamSubject } from '@/types'

/**
 * The context and its hook live apart from the provider component.
 * React Fast Refresh can only preserve a module that exports components
 * alone; mixing a hook in makes every edit to an imported file rebuild the
 * context object and crash the tree with "must be used inside a provider".
 */
export interface AuthContextValue {
  subject: Subject | null
  team: TeamSubject | null
  admin: AdminSubject | null
  /** True only while the initial silent refresh is in flight. */
  booting: boolean
  loginTeam: (input: { teamName: string; joinCode: string; nickname: string }) => Promise<void>
  loginAdmin: (input: { username: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
