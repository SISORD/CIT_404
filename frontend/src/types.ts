export type Phase = 'LOBBY' | 'PHASE_I' | 'PHASE_II' | 'ENDGAME' | 'CLOSED'
export type ItemType = 'HINT' | 'INSURANCE' | 'BOOST' | 'ACCESS'
export type Category = 'CP' | 'CTF' | 'DATA'

export type LedgerKind =
  | 'CHALLENGE_REWARD' | 'ITEM_PURCHASE' | 'ITEM_USE' | 'MISSION_PURCHASE'
  | 'MISSION_REWARD' | 'INSURANCE_REFUND' | 'ADMIN_ADJUST' | 'SEED'

export interface TeamSubject {
  kind: 'team'
  teamId: number
  teamName: string
  operatorId: number
  nickname: string
}

export interface AdminSubject {
  kind: 'admin'
  adminId: number
  username: string
  role: 'admin' | 'superadmin'
}

export type Subject = TeamSubject | AdminSubject

export interface Team {
  id: number
  team_name: string
  cit_balance: number
  core_energy: number
}

export interface Wallet {
  balance: number
  coreEnergy: number
}

export interface InventoryEntry {
  id: number
  code: string
  name: string
  item_type: ItemType
  icon: string
  cost: number
  effect: string
  payload: Record<string, unknown>
  quantity: number
  total_bought: number
  total_used: number
}

export interface MarketItem {
  id: number
  code: string
  name: string
  item_type: ItemType
  cost: number
  icon: string
  effect: string
  payload: Record<string, unknown>
  max_per_team: number | null
  stock: number | null
  owned: number
  total_bought: number
}

export interface Challenge {
  id: number
  code: string
  category: Category
  difficulty: number
  reward: number
  title: string
  description: string | null
  solved: boolean
}

export interface Mission {
  id: number
  code: string
  mission_name: string
  entry_cost: number
  difficulty_stars: number
  reward: number
  core_energy: number
  time_limit_min: number | null
  description: string
  required_items: string[]
  capacity: number | null
  team_status: 'PURCHASED' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | null
  deadline_at: string | null
  has_insurance: boolean | null
}

export interface GameState {
  team: Team
  phase: { phase: Phase; phase_ends_at: string | null }
  inventory: InventoryEntry[]
  solvedChallenges: { id: number; code: string; category: Category }[]
  missions: {
    id: number
    status: string
    has_insurance: boolean
    paid_amount: number
    purchased_at: string
    deadline_at: string | null
    code: string
    mission_name: string
  }[]
}

export interface LedgerRow {
  id: number
  kind: LedgerKind
  amount: number
  balance_after: number
  quantity: number
  note: string | null
  created_at: string
  operator: string | null
  item_name?: string | null
  team_name?: string
}

export interface LeaderboardRow {
  team_name: string
  core_energy: number
  total_solved: number
  missions_completed: number
  rank: number
}

export interface TeamStats {
  id: number
  team_name: string
  cit_balance: number
  core_energy: number
  is_locked: boolean
  solved_cp: number
  solved_ctf: number
  solved_data: number
  total_attempts: number
  wrong_attempts: number
  missions_bought: number
  missions_completed: number
  missions_failed: number
  items_held: number
  items_bought: number
  total_earned: number
  total_spent: number
  last_activity_at: string | null
  operator_count: number
}

export interface TeamItemRow {
  team_id: number
  team_name: string
  item_id: number
  code: string
  name: string
  item_type: ItemType
  icon: string
  cost: number
  quantity: number
  total_bought: number
  total_used: number
  updated_at: string
}

export interface AdminOverview {
  totals: {
    teams: number
    operators: number
    circulating: number
    total_issued: number
    total_spent: number
    solves: number
    attempts: number
    missions_bought: number
    active_sessions: number
  }
  phase: { phase: Phase; phase_ends_at: string | null }
  byCategory: { category: Category; solves: number; attempts: number }[]
  itemsSold: {
    code: string; name: string; item_type: ItemType
    units_sold: number; revenue: number; teams_owning: number
  }[]
  timeline: { t: string; earned: number | null; spent: number | null }[]
}

export interface TeamDetail {
  team: TeamStats
  items: TeamItemRow[]
  ledger: LedgerRow[]
  missions: {
    id: number; status: string; has_insurance: boolean; paid_amount: number
    purchased_at: string; deadline_at: string | null; resolved_at: string | null
    mission_name: string; code: string; reward: number
  }[]
  operators: { id: number; nickname: string; created_at: string }[]
  sessions: { id: string; user_agent: string | null; ip: string | null; created_at: string; expires_at: string }[]
  submissions: { code: string; category: Category; reward: number; is_correct: boolean; submitted_at: string; nickname: string | null }[]
}
