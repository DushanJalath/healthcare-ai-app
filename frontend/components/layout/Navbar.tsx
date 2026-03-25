import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Image from 'next/image'
import NotificationBell from './NotificationBell'

interface Clinic {
  id: number
  name: string
}

interface NavbarProps {
  title?: string
  subtitle?: string
  clinics?: Clinic[]
  selectedClinicId?: number | null
  onClinicChange?: (clinicId: number | null) => void
}

export default function Navbar({
  title = 'Dashboard',
  subtitle,
  clinics = [],
  selectedClinicId = null,
  onClinicChange
}: NavbarProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
