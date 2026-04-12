import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import { UserRole } from '@/types'
import { forceBrowserLogoutToLogin } from '@/utils/auth-cleanup'

/** Max time to wait for NextAuth session (e.g. JWT refresh calling the API); avoids an endless spinner if the backend is down. */
const SESSION_LOADING_MAX_MS = 18_000

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
  redirectTo?: string
}

export default function ProtectedRoute({
  children,
  allowedRoles = [],
  redirectTo = '/'
}: ProtectedRouteProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const logoutStarted = useRef(false)

  useEffect(() => {
    if (status !== 'loading') return
    const t = window.setTimeout(() => {
      if (logoutStarted.current) return
      logoutStarted.current = true
      void forceBrowserLogoutToLogin()
    }, SESSION_LOADING_MAX_MS)
    return () => window.clearTimeout(t)
  }, [status])

  useEffect(() => {
    if (session?.error === 'RefreshAccessTokenError' && !logoutStarted.current) {
      logoutStarted.current = true
      void forceBrowserLogoutToLogin()
    }
  }, [session?.error])

  useEffect(() => {
    if (status === 'loading') return // Still loading

    if (!session) {
      router.push(redirectTo)
      return
    }

    if (session.error === 'RefreshAccessTokenError') {
      return
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(session.user.role as UserRole)) {
      router.push('/unauthorized')
      return
    }

    if (!session.user.isActive) {
      router.push('/account-inactive')
      return
    }
  }, [session, status, router, allowedRoles, redirectTo])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(session.user.role as UserRole)) {
    return null
  }

  if (session.error === 'RefreshAccessTokenError') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return <>{children}</>
}