import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import DashboardStats from '@/components/clinic/DashboardStats'
import RecentActivity from '@/components/clinic/RecentActivity'
import SystemAlerts from '@/components/clinic/SystemAlerts'
import { ClinicDashboardStats, UserRole } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function ClinicDashboard() {
  const { data: session } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<ClinicDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [session])

  const fetchDashboardData = async () => {
    if (!session?.accessToken) return

    try {
      const response = await api.get('/clinic/dashboard', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setStats(response.data)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = (action: string) => {
    const actions: Record<string, string> = {
      create_patient: '/patients/create',
      upload_documents: '/documents/upload',
      view_reports: '/reports',
      clinic_settings: '/clinic/settings'
    }

    if (actions[action]) {
      router.push(actions[action])
    }
  }

  const handleAlertAction = (action: string) => {
    const alertActions: Record<string, string> = {
      view_failed_documents: '/documents?status=failed',
      manage_storage: '/clinic/storage',
      process_documents: '/documents?status=uploaded'
    }

    if (alertActions[action]) {
      router.push(alertActions[action])
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]}>
      <Head>
        <title>Clinic Dashboard - MediKeep</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header with Profile Dropdown */}
        <Navbar
          title="Clinic Dashboard"
          subtitle="Welcome back! Here's what's happening in your clinic."
          showRefresh={true}
          onRefresh={fetchDashboardData}
        />

        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {stats && (
            <>
              {/* Statistics Cards */}
              <DashboardStats stats={stats} />

              {/* Quick Actions */}
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => handleQuickAction('create_patient')}
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
                  >
                    <div className="text-2xl mb-2">👤</div>
                    <div className="font-medium">Add Patient</div>
                    <div className="text-sm text-gray-600">Register new patient</div>
                  </button>

                  <button
                    onClick={() => handleQuickAction('upload_documents')}
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
                  >
                    <div className="text-2xl mb-2">📤</div>
                    <div className="font-medium">Upload Documents</div>
                    <div className="text-sm text-gray-600">Add medical documents</div>
                  </button>

                  <Link
                    href="/patients"
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left block"
                  >
                    <div className="text-2xl mb-2">📋</div>
                    <div className="font-medium">View Patients</div>
                    <div className="text-sm text-gray-600">Manage patient records</div>
                  </Link>

                  <Link
                    href="/documents"
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left block"
                  >
                    <div className="text-2xl mb-2">📄</div>
                    <div className="font-medium">Manage Documents</div>
                    <div className="text-sm text-gray-600">View and organize files</div>
                  </Link>
                </div>
              </div>

              {/* Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recent Activity */}
                <RecentActivity activities={stats.recent_activity} />

                {/* System Alerts */}
                <SystemAlerts
                  alerts={stats.system_alerts}
                  onActionClick={handleAlertAction}
                />
              </div>

              {/* Charts Section */}
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Document Types Chart */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Document Types Distribution
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(stats.popular_document_types).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">
                          {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                        <span className="text-sm text-gray-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Patient Demographics */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Patient Demographics
                  </h3>

                  {stats.patient_demographics.gender_distribution && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">By Gender</h4>
                      <div className="space-y-2">
                        {Object.entries(stats.patient_demographics.gender_distribution).map(([gender, count]) => (
                          <div key={gender} className="flex justify-between">
                            <span className="text-sm">{gender.replace('_', ' ')}</span>
                            <span className="text-sm font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stats.patient_demographics.age_distribution && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">By Age Group</h4>
                      <div className="space-y-2">
                        {Object.entries(stats.patient_demographics.age_distribution).map(([ageGroup, count]) => (
                          <div key={ageGroup} className="flex justify-between">
                            <span className="text-sm">{ageGroup} years</span>
                            <span className="text-sm font-medium">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}