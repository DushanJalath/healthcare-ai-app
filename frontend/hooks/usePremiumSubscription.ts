import { useCallback, useEffect, useState } from 'react'
import type { PremiumPlan, PremiumSubscriptionState } from '@/utils/premiumSubscription'
import {
  cancelPremiumSubscription,
  computePeriodEnd,
  mergePremiumIntoStoredUser,
  readPremiumState,
  resumePremiumSubscription,
  writePremiumState,
} from '@/utils/premiumSubscription'

/**
 * Client-side premium (demo checkout). Persists per signed-in user email.
 * Access lasts until `currentPeriodEnd`; cancel keeps benefits until that date.
 */
export function usePremiumSubscription(userKey: string | undefined) {
  const [state, setState] = useState<PremiumSubscriptionState | null>(null)

  const refresh = useCallback(() => {
    if (!userKey) {
      setState(null)
      return
    }
    setState(readPremiumState(userKey))
  }, [userKey])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activatePremium = useCallback(
    (nextPlan: PremiumPlan) => {
      if (!userKey) return
      const now = new Date()
      const next: PremiumSubscriptionState = {
        plan: nextPlan,
        subscribedAt: now.toISOString(),
        currentPeriodEnd: computePeriodEnd(now, nextPlan).toISOString(),
        cancelAtPeriodEnd: false,
      }
      writePremiumState(userKey, next)
      mergePremiumIntoStoredUser(nextPlan)
      setState(next)
    },
    [userKey]
  )

  const cancelSubscription = useCallback(() => {
    if (!userKey) return { ok: false as const }
    const result = cancelPremiumSubscription(userKey)
    if (result.ok) refresh()
    return result
  }, [userKey, refresh])

  const resumeSubscription = useCallback(() => {
    if (!userKey) return false
    const ok = resumePremiumSubscription(userKey)
    if (ok) refresh()
    return ok
  }, [userKey, refresh])

  const isPremium = state != null

  return {
    isPremium,
    plan: state?.plan ?? null,
    subscribedAt: state?.subscribedAt ?? null,
    currentPeriodEnd: state?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: state?.cancelAtPeriodEnd ?? false,
    activatePremium,
    cancelSubscription,
    resumeSubscription,
    refresh,
  }
}
