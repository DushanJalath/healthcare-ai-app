import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import NotificationBell from './NotificationBell'

interface Clinic {
  id: number
  name: string
}

export type PatientPremiumNav =
  | { variant: 'none' }
  | { variant: 'cta'; href: string }
  | { variant: 'active' }

interface NavbarProps {
  title?: string
  subtitle?: string
  clinics?: Clinic[]
  selectedClinicId?: number | null
  onClinicChange?: (clinicId: number | null) => void
  /** Patient portal: subscription CTA link or subscribed badge */
  patientPremium?: PatientPremiumNav
  /** Clinic portal: promo strip for patient Premium pricing (demo UI) */
  clinicPremiumPromo?: boolean
}

const PREMIUM_MONTHLY = 16
const PREMIUM_ANNUAL = 150

export default function Navbar({
  title = 'Dashboard',
  subtitle,
  clinics = [],
  selectedClinicId = null,
  onClinicChange,
  patientPremium = { variant: 'none' },
  clinicPremiumPromo = false
}: NavbarProps) {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [clinicBilling, setClinicBilling] = useState<'monthly' | 'annual'>('monthly')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    await signOut({ callbackUrl: '/' })
  }

  const getUserDisplayName = () => {
    if (session?.user?.firstName && session?.user?.lastName) {
      return `${session.user.firstName} ${session.user.lastName}`
    }
    return session?.user?.name || session?.user?.email || 'User'
  }

  const getUserInitials = () => {
    const name = getUserDisplayName()
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  const getRoleBadgeColor = () => {
    switch (session?.user?.role) {
      case 'clinic_admin':
        return 'bg-medical-100 text-medical-800'
      case 'patient':
        return 'bg-tech-100 text-tech-800'
      case 'admin':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatRole = (role: string | undefined) => {
    if (!role) return 'User'
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <div className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-3 sm:py-4">
          {/* Left side - Logo and Title */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <Link href="/" className="flex-shrink-0">
              <Image
                src="/medikeep.png"
                alt="MediKeep Logo"
                width={84}
                height={84}
                className="object-contain w-12 h-12 sm:w-16 sm:h-16 lg:w-[84px] lg:h-[84px]"
              />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 truncate">{title}</h1>
              {subtitle && (
                <p className="mt-0.5 text-xs sm:text-sm text-gray-600 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Center - Clinic Selector (hidden on mobile, shown on md+) */}
          {clinics.length > 0 && onClinicChange && (
            <div className="hidden md:flex items-center space-x-2 mx-4 flex-shrink-0">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider mr-2">
                My Clinics:
              </span>
              <div className="flex items-center space-x-2 flex-wrap">
                {clinics.length > 1 && (
                  <button
                    onClick={() => onClinicChange(null)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${selectedClinicId === null
                      ? 'bg-medical-50 text-medical-700 border border-medical-200'
                      : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                      }`}
                  >
                    All Clinics
                  </button>
                )}
                {clinics.map((clinic) => (
                  <button
                    key={clinic.id}
                    onClick={() => onClinicChange(clinic.id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors truncate max-w-[140px] ${selectedClinicId === clinic.id
                      ? 'bg-medical-50 text-medical-700 border border-medical-200'
                      : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                      }`}
                  >
                    {clinic.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Right side - Actions & Profile */}
          <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
            {clinicPremiumPromo && (
              <div className="hidden lg:flex flex-col items-end gap-1 mr-1 border-r border-gray-200 pr-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                  Premium features
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 whitespace-nowrap">
                    {clinicBilling === 'monthly' ? 'Monthly' : 'Annual'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={clinicBilling === 'annual'}
                    onClick={() => setClinicBilling((b) => (b === 'monthly' ? 'annual' : 'monthly'))}
                    className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-medical-500 focus:ring-offset-1"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                        clinicBilling === 'annual' ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <span className="text-sm font-bold text-gray-900">
                  ${clinicBilling === 'monthly' ? PREMIUM_MONTHLY : PREMIUM_ANNUAL}
                  <span className="text-xs font-normal text-gray-500">
                    {clinicBilling === 'monthly' ? '/mo' : '/yr'}
                  </span>
                </span>
              </div>
            )}

            {patientPremium.variant === 'cta' && (
              <Link
                href={patientPremium.href}
                className="hidden sm:inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-amber-600 hover:to-orange-700"
              >
                View plans
              </Link>
            )}
            {patientPremium.variant === 'active' && (
              <span className="hidden sm:inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 border border-violet-200">
                Subscribed
              </span>
            )}

            {/* Notification Bell */}
            {session?.user && <NotificationBell />}

            {/* Profile Dropdown (desktop) */}
            <div className="relative hidden sm:block" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center space-x-2 sm:space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-medical-500 to-tech-500 flex items-center justify-center text-white font-semibold text-sm">
                  {getUserInitials()}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {getUserDisplayName()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatRole(session?.user?.role)}
                  </p>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">
                      {getUserDisplayName()}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {session?.user?.email}
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${getRoleBadgeColor()}`}>
                      {formatRole(session?.user?.role)}
                    </span>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/profile"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Profile & Settings
                    </Link>
                  </div>

                  <div className="border-t border-gray-100 py-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Hamburger Menu Button (mobile only) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 py-3 space-y-3">
            {clinicPremiumPromo && (
              <div className="px-2 pb-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-amber-800 mb-2">Premium features (patients)</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600">{clinicBilling === 'monthly' ? 'Monthly' : 'Annual'}</span>
                  <button
                    type="button"
                    onClick={() => setClinicBilling((b) => (b === 'monthly' ? 'annual' : 'monthly'))}
                    className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full bg-gray-200"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 mt-0.5 transform rounded-full bg-white shadow transition ${
                        clinicBilling === 'annual' ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-sm font-bold text-gray-900">
                    ${clinicBilling === 'monthly' ? PREMIUM_MONTHLY : PREMIUM_ANNUAL}
                  </span>
                </div>
              </div>
            )}
            {patientPremium.variant === 'cta' && (
              <Link
                href={patientPremium.href}
                className="block mx-2 text-center rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-2 text-sm font-semibold text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                View plans
              </Link>
            )}
            {patientPremium.variant === 'active' && (
              <div className="mx-2 text-center rounded-lg bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-800 border border-violet-200">
                Subscribed
              </div>
            )}
            {/* Clinic Selector (mobile) */}
            {clinics.length > 0 && onClinicChange && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">My Clinics</p>
                <div className="flex flex-wrap gap-2">
                  {clinics.length > 1 && (
                    <button
                      onClick={() => { onClinicChange(null); setMobileMenuOpen(false) }}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${selectedClinicId === null
                        ? 'bg-medical-50 text-medical-700 border border-medical-200'
                        : 'text-gray-700 hover:bg-gray-50 border border-gray-200'
                        }`}
                    >
                      All Clinics
                    </button>
                  )}
                  {clinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => { onClinicChange(clinic.id); setMobileMenuOpen(false) }}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${selectedClinicId === clinic.id
                        ? 'bg-medical-50 text-medical-700 border border-medical-200'
                        : 'text-gray-700 hover:bg-gray-50 border border-gray-200'
                        }`}
                    >
                      {clinic.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* User info + actions */}
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex items-center space-x-3 px-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-medical-500 to-tech-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {getUserInitials()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{getUserDisplayName()}</p>
                  <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
                </div>
                <span className={`ml-auto px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${getRoleBadgeColor()}`}>
                  {formatRole(session?.user?.role)}
                </span>
              </div>

              <Link
                href="/profile"
                className="flex items-center px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile & Settings
              </Link>

              <button
                onClick={handleLogout}
                className="flex items-center w-full px-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
              >
                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
