import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import { UserRole } from '@/types'
import { usePremiumSubscription } from '@/hooks/usePremiumSubscription'
import { formatPremiumAccessEnd, type PremiumPlan } from '@/utils/premiumSubscription'
import toast, { Toaster } from 'react-hot-toast'

const MONTHLY_LKR = 2000
const ANNUAL_LKR = 20000

function formatLkr(amount: number) {
  return `${amount.toLocaleString('en-LK')} LKR`
}

export default function PatientPremiumSubscribePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userKey = session?.user?.email ?? ''
  const {
    isPremium,
    plan,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    activatePremium,
    cancelSubscription,
    resumeSubscription,
  } = usePremiumSubscription(userKey)
  const [billing, setBilling] = useState<PremiumPlan>('monthly')
  const [step, setStep] = useState<'plans' | 'payment'>('plans')
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [processing, setProcessing] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)

  useEffect(() => {
    if (isPremium) setStep('plans')
  }, [isPremium])

  useEffect(() => {
    if (!cancelModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCancelModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelModalOpen])

  const price = billing === 'monthly' ? MONTHLY_LKR : ANNUAL_LKR
  const periodLabel = billing === 'monthly' ? 'per month' : 'per year'
  const priceLabel = formatLkr(price)

  const accessEndLabel =
    currentPeriodEnd != null ? formatPremiumAccessEnd(currentPeriodEnd) : ''

  const handleSubscribe = () => {
    if (isPremium) {
      router.push('/patients/dashboard')
      return
    }
    setStep('payment')
  }

  const handleDummyPay = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = cardName.trim()
    const digits = cardNumber.replace(/\s/g, '')
    const expTrim = expiry.trim()
    const cvvTrim = cvv.trim()

    if (!name) {
      toast.error('Name on card is required')
      return
    }
    if (digits.length < 12 || digits.length > 19 || !/^\d+$/.test(digits)) {
      toast.error('Enter a valid card number (12–19 digits)')
      return
    }
    const expMatch = expTrim.match(/^(\d{2})\/(\d{2})$/)
    if (!expMatch) {
      toast.error('Expiry is required (MM/YY)')
      return
    }
    const mm = parseInt(expMatch[1], 10)
    if (mm < 1 || mm > 12) {
      toast.error('Expiry month must be between 01 and 12')
      return
    }
    if (cvvTrim.length < 3 || cvvTrim.length > 4 || !/^\d+$/.test(cvvTrim)) {
      toast.error('CVV must be 3 or 4 digits')
      return
    }
    setProcessing(true)
    await new Promise((r) => setTimeout(r, 900))
    activatePremium(billing)
    toast.success('Your subscription is active.')
    setProcessing(false)
    router.replace('/patients/dashboard')
  }

  const handleConfirmCancel = async () => {
    setCancelSubmitting(true)
    await new Promise((r) => setTimeout(r, 400))
    const result = cancelSubscription()
    setCancelSubmitting(false)
    setCancelModalOpen(false)
    if (result.ok && result.accessUntil) {
      toast.success(
        `Subscription cancelled. Premium access remains until ${formatPremiumAccessEnd(result.accessUntil)}.`
      )
    } else {
      toast.error('Could not update subscription. Please try again.')
    }
  }

  const handleResume = () => {
    if (resumeSubscription()) {
      toast.success('Welcome back — your subscription is no longer scheduled to cancel.')
    }
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.PATIENT]} redirectTo="/patient/login">
      <Head>
        <title>Subscription &amp; plans - MediKeep</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Subscription"
          subtitle="Plans, billing, and included features"
          patientPremium={
            isPremium ? { variant: 'active' } : { variant: 'cta', href: '/patients/premium' }
          }
        />

        <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          {isPremium && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 mb-8">
              <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-7 text-white">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  MediKeep Premium
                </p>
                <h1 className="text-2xl font-bold mt-1">Your subscription</h1>
                <p className="mt-2 text-sm text-white/85">
                  Manage billing and see when your current benefits period ends.
                </p>
              </div>

              <div className="p-6 space-y-5">
                {cancelAtPeriodEnd ? (
                  <div
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                    role="status"
                  >
                    <p className="font-semibold text-amber-900">Cancellation scheduled</p>
                    <p className="mt-1 text-amber-900/90">
                      Your subscription will not renew. You keep full Premium access—including health
                      trends and premium chat models—until{' '}
                      <span className="font-medium">{accessEndLabel}</span>.
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-950"
                    role="status"
                  >
                    <p className="font-semibold text-green-900">Premium is active</p>
                    <p className="mt-1 text-green-900/90">
                      Your current access period runs through{' '}
                      <span className="font-medium">{accessEndLabel}</span>. You can cancel anytime;
                      you will not lose access before that date.
                    </p>
                  </div>
                )}

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border border-gray-100 rounded-lg p-4 bg-gray-50/80">
                  <div>
                    <dt className="text-gray-500">Plan</dt>
                    <dd className="font-semibold text-gray-900 mt-0.5 capitalize">
                      {plan === 'annual' ? 'Annual' : 'Monthly'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Premium access until</dt>
                    <dd className="font-semibold text-gray-900 mt-0.5">{accessEndLabel}</dd>
                  </div>
                </dl>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  {cancelAtPeriodEnd ? (
                    <button
                      type="button"
                      onClick={handleResume}
                      className="flex-1 py-2.5 rounded-lg bg-medical-600 text-white text-sm font-semibold hover:bg-medical-700"
                    >
                      Resume subscription
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCancelModalOpen(true)}
                      className="flex-1 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-semibold hover:bg-gray-50"
                    >
                      Cancel subscription
                    </button>
                  )}
                  <Link
                    href="/patients/dashboard"
                    className="flex-1 py-2.5 rounded-lg border border-transparent text-center text-sm font-semibold text-medical-700 hover:text-medical-800 hover:bg-medical-50"
                  >
                    Back to dashboard
                  </Link>
                </div>
              </div>
            </div>
          )}

          {!isPremium && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
              <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-8 text-white">
                <h1 className="text-2xl font-bold">Choose your plan</h1>
                <p className="mt-2 text-white/90 text-sm">
                  Track vitals over time, customize what you monitor, and use premium assistant models in
                  chat (UI labels; responses use MediKeep&apos;s standard pipeline).
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
                        <span className="text-3xl font-bold text-gray-900">{priceLabel}</span>
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
                      className="w-full py-3 rounded-lg bg-medical-600 text-white font-semibold hover:bg-medical-700"
                    >
                      Subscribe
                    </button>
                  </>
                )}

                {step === 'payment' && (
                  <form onSubmit={handleDummyPay} className="space-y-4">
                    <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                      Paying <span className="font-semibold">{priceLabel}</span> {periodLabel} (
                      {billing})
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Name on card
                      </label>
                      <input
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Jane Doe"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Card number
                      </label>
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
          )}

          {/* <p className="mt-6 text-center text-sm text-gray-500">
            <Link href="/patients/dashboard" className="text-medical-600 hover:text-medical-700">
              Back to dashboard
            </Link>
          </p> */}
        </div>
      </div>

      {cancelModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
          role="presentation"
          onClick={() => !cancelSubmitting && setCancelModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-100"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-subscription-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="cancel-subscription-title"
              className="text-lg font-semibold text-gray-900"
            >
              Cancel subscription?
            </h2>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              If you continue, your subscription will not renew. You will{' '}
              <span className="font-medium text-gray-800">keep every Premium feature</span> until the
              end of your current period
              {accessEndLabel ? (
                <>
                  {' '}
                  (<span className="font-medium">{accessEndLabel}</span>).
                </>
              ) : (
                '.'
              )}
            </p>
            <ul className="mt-4 text-sm text-gray-600 space-y-2 list-disc list-inside">
              <li>Health trends and premium chat models stay available until that date.</li>
              <li>You can resume your subscription before then if you change your mind.</li>
            </ul>
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                disabled={cancelSubmitting}
                onClick={() => setCancelModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Keep subscription
              </button>
              <button
                type="button"
                disabled={cancelSubmitting}
                onClick={handleConfirmCancel}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {cancelSubmitting ? 'Updating…' : 'Cancel subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
