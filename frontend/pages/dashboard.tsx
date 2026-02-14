import { useSession, signOut } from 'next-auth/react'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import { UserRole } from '@/types'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Redirect based on user role
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role) {
      const role = session.user.role
      
      if (role === UserRole.PATIENT) {
        router.replace('/patients/dashboard')
      } else if (role === UserRole.CLINIC_ADMIN || role === UserRole.CLINIC_STAFF) {
        router.replace('/clinic/dashboard')
      } else if (role === UserRole.ADMIN) {
        // Admin stays on main dashboard or goes to admin dashboard
        // For now, stay on this page
      }
    }
  }, [status, session, router])

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' })
  }

  // Show loading while redirecting
  if (status === 'loading' || (status === 'authenticated' && 
      (session?.user?.role === UserRole.PATIENT || 
       session?.user?.role === UserRole.CLINIC_ADMIN || 
       session?.user?.role === UserRole.CLINIC_STAFF))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <Head>
        <title>Dashboard - MediKeep</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <Navbar title="Dashboard" subtitle="MediKeep - Choose your destination" />
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Welcome to MediKeep
                </h2>
                <p className="text-gray-600 mb-6">
                  Your role: <span className="font-semibold">{session?.user?.role}</span>
                </p>
                <p className="text-gray-500">
                  Admin Dashboard - Manage your chronic care platform
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}