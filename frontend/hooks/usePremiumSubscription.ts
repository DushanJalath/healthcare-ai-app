import { useCallback, useEffect, useState } from 'react'
import type { PremiumPlan } from '@/utils/premiumSubscription'
import {
  mergePremiumIntoStoredUser,
  readPremiumState,
  writePremiumState,
} from '@/utils/premiumSubscription'

/**
 * Client-side premium flag (dummy checkout). Persists per signed-in user email.
 */
export function usePremiumSubscription(userKey: string | undefined) {
  const [isPremium, setIsPremium] = useState(false)
  const [plan, setPlan] = useState<PremiumPlan | null>(null)
  const [subscribedAt, setSubscribedAt] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!userKey) {
      setIsPremium(false)
      setPlan(null)
      setSubscribedAt(null)
      return
    }
    const s = readPremiumState(userKey)
    if (s?.active) {
      setIsPremium(true)
      setPlan(s.plan)
      setSubscribedAt(s.subscribedAt)
    } else {
      setIsPremium(false)
      setPlan(null)
      setSubscribedAt(null)
    }
  }, [userKey])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activatePremium = useCallback(
    (nextPlan: PremiumPlan) => {
      if (!userKey) return
      const at = new Date().toISOString()
      writePremiumState(userKey, { active: true, plan: nextPlan, subscribedAt: at })
      mergePremiumIntoStoredUser(nextPlan)
      setIsPremium(true)
      setPlan(nextPlan)
      setSubscribedAt(at)
    },
    [userKey]
  )

  return { isPremium, plan, subscribedAt, activatePremium, refresh }
}
