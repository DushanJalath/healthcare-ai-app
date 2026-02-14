import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { UserRole } from '@/types'

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

  useEffect(() => {
    if (status === 'loading') return // Still loading

    if (!session) {
      router.push(redirectTo)
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

  return <>{children}</>
}