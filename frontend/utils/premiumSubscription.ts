import type { User } from '@/types'

export type PremiumPlan = 'monthly' | 'annual'

export interface PremiumSubscriptionState {
  active: boolean
  plan: PremiumPlan
  subscribedAt: string
}

const STORAGE_PREFIX = 'medikeep_premium_v1'

export function premiumStorageKey(userKey: string): string {
  return `${STORAGE_PREFIX}_${userKey}`
}

export function readPremiumState(userKey: string): PremiumSubscriptionState | null {
  if (typeof window === 'undefined' || !userKey) return null
  try {
    const raw = localStorage.getItem(premiumStorageKey(userKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PremiumSubscriptionState
    if (!parsed?.active || !parsed.plan) return null
    return parsed
  } catch {
    return null
  }
}

export function writePremiumState(userKey: string, state: PremiumSubscriptionState): void {
  if (typeof window === 'undefined' || !userKey) return
  localStorage.setItem(premiumStorageKey(userKey), JSON.stringify(state))
}

export function mergePremiumIntoStoredUser(plan: PremiumPlan): void {
  if (typeof window === 'undefined') return
  const raw = localStorage.getItem('user')
  if (!raw) return
  try {
    const user = JSON.parse(raw) as User
    user.is_premium = true
    user.premium_plan = plan
    localStorage.setItem('user', JSON.stringify(user))
  } catch {
    // ignore
  }
}
