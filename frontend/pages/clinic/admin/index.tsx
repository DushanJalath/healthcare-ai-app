import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import DashboardStats from '@/components/clinic/DashboardStats'
import ClinicInsightsChat from '@/components/clinic/ClinicInsightsChat'
import RecentActivity from '@/components/clinic/RecentActivity'
import SystemAlerts from '@/components/clinic/SystemAlerts'
import { ClinicDashboardStats, UserRole } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function ClinicAdminPortal() {
  const { data: session } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<ClinicDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboardData = useCallback(async () => {
    if (!session?.accessToken) return

    try {
      const dashRes = await api.get<ClinicDashboardStats>('/clinic/dashboard', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setStats(dashRes.data)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load clinic data')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken])

  useEffect(() => {
    if (session?.accessToken) {
      fetchDashboardData()
    }
  }, [session?.accessToken, fetchDashboardData])

  const handleQuickAction = (action: string) => {
    const actions: Record<string, string> = {
      create_patient: '/patients/create',
      view_patients: '/clinic/users',
      view_staff: '/clinic/admin/staff',
      clinic_details: '/clinic/admin/details',
      upload_documents: '/documents/upload',
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
      <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN]}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN]}>
      <Head>
        <title>{session?.user?.clinicName ? `${session.user.clinicName} - MediKeep` : 'Clinic Admin - MediKeep'}</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <Navbar
          title={session?.user?.clinicName?.trim() || 'Clinic'}
          subtitle="Manage patients and staff for your clinic"
        />

        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {stats && (
            <>
              <DashboardStats stats={stats} showStaffCount />

              {session?.accessToken && <ClinicInsightsChat accessToken={session.accessToken} />}

              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Admin actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <button
                    type="button"
                    onClick={() => handleQuickAction('view_patients')}
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
                  >
                    <div className="text-2xl mb-2">👥</div>
                    <div className="font-medium">All patients</div>
                    <div className="text-sm text-gray-600">Patients in your clinic</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickAction('view_staff')}
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
                  >
                    <div className="text-2xl mb-2">🧑‍⚕️</div>
                    <div className="font-medium">Clinic staff</div>
                    <div className="text-sm text-gray-600">View, add, and manage staff</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickAction('create_patient')}
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
                  >
                    <div className="text-2xl mb-2">➕</div>
                    <div className="font-medium">Register patient</div>
                    <div className="text-sm text-gray-600">Add a new patient to your clinic</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickAction('clinic_details')}
                    className="p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow text-left"
                  >
                    <div className="text-2xl mb-2">📋</div>
                    <div className="font-medium">Clinic details</div>
                    <div className="text-sm text-gray-600">Clinic details</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <RecentActivity activities={stats.recent_activity} />
                <SystemAlerts alerts={stats.system_alerts} onActionClick={handleAlertAction} />
              </div>

              <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Document types</h3>
                  <div className="space-y-3">
                    {Object.entries(stats.popular_document_types).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">
                          {type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                        <span className="text-sm text-gray-900">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Patient demographics</h3>

                  {stats.patient_demographics?.gender_distribution &&
                    Object.keys(stats.patient_demographics.gender_distribution).length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">By gender</h4>
                        <div className="space-y-2">
                          {Object.entries(stats.patient_demographics.gender_distribution).map(([gender, count]) => (
                            <div key={gender || 'not-specified'} className="flex justify-between">
                              <span className="text-sm text-gray-800">
                                {gender === 'not_specified'
                                  ? 'Not specified'
                                  : String(gender).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                              </span>
                              <span className="text-sm font-medium text-gray-900">{Number(count) || 0}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {stats.patient_demographics?.age_distribution &&
                    Object.keys(stats.patient_demographics.age_distribution).length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">By age group</h4>
                        <div className="space-y-2">
                          {Object.entries(stats.patient_demographics.age_distribution).map(([ageGroup, count]) => (
                            <div key={ageGroup} className="flex justify-between">
                              <span className="text-sm text-gray-800">{ageGroup} years</span>
                              <span className="text-sm font-medium text-gray-900">{Number(count) || 0}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {(!stats.patient_demographics?.gender_distribution ||
                    Object.keys(stats.patient_demographics.gender_distribution).length === 0) &&
                    (!stats.patient_demographics?.age_distribution ||
                      Object.keys(stats.patient_demographics.age_distribution).length === 0) && (
                    <p className="text-sm text-gray-500">
                      No demographic data yet. Enroll patients with your clinic to see breakdown by gender and age.
                    </p>
                  )}
                </div>
              </div>

              <p className="mt-8 text-center text-sm text-gray-500">
                Clinic staff use the{' '}
                <Link href="/clinic/login" className="text-medical-600 hover:text-medical-700">
                  same clinic sign-in page
                </Link>
                ; they are routed to the staff portal after login.
              </p>
            </>
          )}
        </div>
      </div>

      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
