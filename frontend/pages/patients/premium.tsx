import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import { UserRole } from '@/types'
import { usePremiumSubscription } from '@/hooks/usePremiumSubscription'
import type { PremiumPlan } from '@/utils/premiumSubscription'
import toast, { Toaster } from 'react-hot-toast'

const MONTHLY_USD = 16
const ANNUAL_USD = 150

export default function PatientPremiumSubscribePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userKey = session?.user?.email ?? ''
  const { isPremium, activatePremium } = usePremiumSubscription(userKey)
  const [billing, setBilling] = useState<PremiumPlan>('monthly')
  const [step, setStep] = useState<'plans' | 'payment'>('plans')
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [processing, setProcessing] = useState(false)

  const price = billing === 'monthly' ? MONTHLY_USD : ANNUAL_USD
  const periodLabel = billing === 'monthly' ? 'per month' : 'per year'

  const handleSubscribe = () => {
    if (isPremium) {
      router.push('/patients/dashboard')
      return
    }
    setStep('payment')
  }

  const handleDummyPay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cardName.trim() || cardNumber.replace(/\s/g, '').length < 12) {
      toast.error('Enter dummy card details to continue.')
      return
    }
    setProcessing(true)
    await new Promise((r) => setTimeout(r, 900))
    activatePremium(billing)
    toast.success('Your subscription is active.')
    setProcessing(false)
    router.replace('/patients/dashboard')
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.PATIENT]}>
      <Head>
        <title>Subscription &amp; plans - MediKeep</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Subscription"
          subtitle="Plans, billing, and included features"
          patientPremium={
            isPremium
              ? { variant: 'active' }
              : { variant: 'cta', href: '/patients/premium' }
          }
        />

        <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          {isPremium && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
              You already have an active subscription.{' '}
              <Link href="/patients/dashboard" className="font-medium underline">
                Go to your dashboard
              </Link>
              .
            </div>
          )}

          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-8 text-white">
              <h1 className="text-2xl font-bold">Choose your plan</h1>
              <p className="mt-2 text-white/90 text-sm">
                Track vitals over time, customize what you monitor, and use premium assistant models in chat (UI
                labels; responses use MediKeep&apos;s standard pipeline).
              </p>
            </div>

            <div className="p-6 space-y-6">
              {step === 'plans' && (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Billing</p>
                    <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                      <button
                        type="button"
                        onClick={() => setBilling('monthly')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          billing === 'monthly'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Monthly
                      </button>
                      <button
                        type="button"
                        onClick={() => setBilling('annual')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          billing === 'annual'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Annual
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-3xl font-bold text-gray-900">${price}</span>
                      <span className="text-sm text-gray-600">{periodLabel}</span>
                    </div>
                    {billing === 'annual' && (
                      <p className="mt-2 text-xs text-amber-900/80">
                        Save compared to twelve months at the monthly rate.
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2 text-sm text-gray-700">
                    <li className="flex gap-2">
                      <span className="text-green-600">✓</span> Health trends chart
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-600">✓</span> Choose which metric to visualize
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-600">✓</span> Additional model options in chat
                    </li>
                  </ul>

                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={isPremium}
                    className="w-full py-3 rounded-lg bg-medical-600 text-white font-semibold hover:bg-medical-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPremium ? 'Already subscribed' : 'Subscribe'}
                  </button>
                </>
              )}

              {step === 'payment' && !isPremium && (
                <form onSubmit={handleDummyPay} className="space-y-4">
                  <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    Paying <span className="font-semibold">${price}</span> {periodLabel} ({billing})
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name on card</label>
                    <input
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Jane Doe"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Card number</label>
                    <input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="4242 4242 4242 4242"
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Expiry</label>
                      <input
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="MM/YY"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">CVV</label>
                      <input
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="123"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Dummy payment gateway: submitting completes subscription in this demo only.
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('plans')}
                      className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={processing}
                      className="flex-1 py-2.5 rounded-lg bg-medical-600 text-white text-sm font-semibold hover:bg-medical-700 disabled:opacity-60"
                    >
                      {processing ? 'Processing…' : 'Pay & complete'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            <Link href="/patients/dashboard" className="text-medical-600 hover:text-medical-700">
              Back to dashboard
            </Link>
          </p>
        </div>
      </div>
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
