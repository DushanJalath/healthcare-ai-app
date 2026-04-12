import type { User } from '@/types'

export type PremiumPlan = 'monthly' | 'annual'

export interface PremiumSubscriptionState {
  plan: PremiumPlan
  subscribedAt: string
  /** ISO timestamp — premium features available until this moment (exclusive of instant after). */
  currentPeriodEnd: string
  /** True if the user cancelled but still has access until `currentPeriodEnd`. */
  cancelAtPeriodEnd: boolean
}

const STORAGE_PREFIX = 'medikeep_premium_v1'

export function premiumStorageKey(userKey: string): string {
  return `${STORAGE_PREFIX}_${userKey}`
}

export function computePeriodEnd(from: Date, plan: PremiumPlan): Date {
  const d = new Date(from.getTime())
  if (plan === 'monthly') {
    d.setMonth(d.getMonth() + 1)
  } else {
    d.setFullYear(d.getFullYear() + 1)
  }
  return d
}

/** Long date for UI, e.g. "March 17, 2026" */
export function formatPremiumAccessEnd(iso: string, locale = 'en-LK'): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function normalizePremiumPayload(parsed: unknown): PremiumSubscriptionState | null {
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const plan = o.plan as PremiumPlan
  if (plan !== 'monthly' && plan !== 'annual') return null

  const subscribedAt =
    typeof o.subscribedAt === 'string' ? o.subscribedAt : new Date().toISOString()
  let currentPeriodEnd =
    typeof o.currentPeriodEnd === 'string' ? o.currentPeriodEnd : ''
  const cancelAtPeriodEnd = Boolean(o.cancelAtPeriodEnd)

  // Legacy: { active: true, plan, subscribedAt }
  if (!currentPeriodEnd && o.active === true) {
    currentPeriodEnd = computePeriodEnd(new Date(subscribedAt), plan).toISOString()
  }

  if (!currentPeriodEnd) return null

  return { plan, subscribedAt, currentPeriodEnd, cancelAtPeriodEnd }
}

export function clearPremiumFromStoredUser(): void {
  if (typeof window === 'undefined') return
  const raw = localStorage.getItem('user')
  if (!raw) return
  try {
    const user = JSON.parse(raw) as User
    delete user.is_premium
    delete user.premium_plan
    localStorage.setItem('user', JSON.stringify(user))
  } catch {
    // ignore
  }
}

export function readPremiumState(userKey: string): PremiumSubscriptionState | null {
  if (typeof window === 'undefined' || !userKey) return null
  try {
    const raw = localStorage.getItem(premiumStorageKey(userKey))
    if (!raw) return null
    const state = normalizePremiumPayload(JSON.parse(raw))
    if (!state) return null
    if (Date.now() >= new Date(state.currentPeriodEnd).getTime()) {
      localStorage.removeItem(premiumStorageKey(userKey))
      clearPremiumFromStoredUser()
      return null
    }
    return state
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

export function cancelPremiumSubscription(userKey: string): { ok: boolean; accessUntil?: string } {
  const state = readPremiumState(userKey)
  if (!state) return { ok: false }
  if (state.cancelAtPeriodEnd) {
    return { ok: true, accessUntil: state.currentPeriodEnd }
  }
  writePremiumState(userKey, { ...state, cancelAtPeriodEnd: true })
  return { ok: true, accessUntil: state.currentPeriodEnd }
}

export function resumePremiumSubscription(userKey: string): boolean {
  const state = readPremiumState(userKey)
  if (!state || !state.cancelAtPeriodEnd) return false
  writePremiumState(userKey, { ...state, cancelAtPeriodEnd: false })
  return true
}
