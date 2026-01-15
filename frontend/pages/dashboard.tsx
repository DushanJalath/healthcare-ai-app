import { useSession, signOut } from 'next-auth/react'
import Head from 'next/head'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { UserRole } from '@/types'

export default function DashboardPage() {
  const { data: session } = useSession()

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' })
  }

  return (
    <ProtectedRoute>
      <Head>
        <title>Dashboard - Healthcare AI</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-xl font-semibold text-gray-900">
                  Healthcare AI Dashboard
                </h1>
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  Welcome, {session?.user?.name}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {session?.user?.role}
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Welcome to Healthcare AI
                </h2>
                <p className="text-gray-600 mb-6">
                  Your role: <span className="font-semibold">{session?.user?.role}</span>
                </p>
                <p className="text-gray-500">
                  Dashboard features coming in Day 3-4 implementation
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}