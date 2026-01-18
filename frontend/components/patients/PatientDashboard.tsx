import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { Patient, Document, DocumentType, DocumentStatus } from '@/types'
import PatientStats from './PatientStats'
import PatientTimeline from './PatientTimeline'
import PatientDocuments from './PatientDocuments'
import Navbar from '@/components/layout/Navbar'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface PatientDashboardData {
  patient_profile: Patient
  stats: {
    total_documents: number
    recent_documents: number
    processed_documents: number
    pending_documents: number
    storage_used: number
    last_upload: string | null
    document_types: Record<string, number>
  }
  recent_documents: Document[]
  timeline_events: Array<{
    date: string
    type: string
    title: string
    description: string
    icon: string
    color: string
    metadata?: any
  }>
}

export default function PatientDashboard() {
  const { data: session } = useSession()
  const router = useRouter()
  const [dashboardData, setDashboardData] = useState<PatientDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'timeline' | 'profile'>('overview')
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [session?.accessToken, selectedClinicId])

  // Helper function to clear session and redirect to landing page
  const clearSessionAndRedirect = async () => {
    // Clear localStorage
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')

    // Sign out from NextAuth session and redirect to landing page
    await signOut({ redirect: false })
    router.push('/')
  }

  const fetchDashboardData = async () => {
    if (!session?.accessToken) return

    try {
      const params = new URLSearchParams()
      if (selectedClinicId) {
        params.append('clinic_id', selectedClinicId.toString())
      }
      const queryString = params.toString()
      const url = `/patient-dashboard/${queryString ? '?' + queryString : ''}`
      const response = await api.get(url, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setDashboardData(response.data)
      
      // Set default selected clinic if not set and clinics are available
      if (!selectedClinicId && response.data.patient_profile.clinic_ids && response.data.patient_profile.clinic_ids.length > 0) {
        setSelectedClinicId(response.data.patient_profile.clinic_ids[0])
      }
    } catch (error: any) {
      const status = error.response?.status

      // If patient profile not found (404) or access denied (403), clear session and redirect
      if (status === 404 || status === 403) {
        toast.error('Patient profile not found. Redirecting to home page...')
        await clearSessionAndRedirect()
        return
      }

      toast.error(error.response?.data?.detail || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard Unavailable</h2>
          <p className="text-gray-600 mt-2">Unable to load your dashboard data</p>
          <button
            onClick={fetchDashboardData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Get clinic list with IDs for selector
  const clinics = dashboardData?.patient_profile.clinic_ids && dashboardData?.patient_profile.clinic_names
    ? dashboardData.patient_profile.clinic_ids.map((id, index) => ({
        id,
        name: dashboardData.patient_profile.clinic_names?.[index] || `Clinic ${id}`
      }))
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Profile Dropdown */}
      <Navbar
        title="My Health Dashboard"
        subtitle={`Patient ID: ${dashboardData.patient_profile.patient_id}`}
        showRefresh={true}
        onRefresh={fetchDashboardData}
        clinics={clinics}
        selectedClinicId={selectedClinicId}
        onClinicChange={setSelectedClinicId}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow p-6 text-white mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">
                Welcome, {dashboardData.patient_profile.user_first_name}!
              </h2>
              <p className="mt-2 opacity-90">
                Here's an overview of your medical documents and health records
              </p>
            </div>
            <div className="text-6xl opacity-20">
              🏥
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <PatientStats stats={dashboardData.stats} />

        {/* Tab Navigation */}
        <div className="mb-6">
          <nav className="flex space-x-8 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'documents'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Documents ({dashboardData.stats.total_documents})
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'timeline'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'profile'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Profile
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Documents */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Documents</h3>
              <div className="space-y-4">
                {dashboardData.recent_documents.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between border-b pb-3">
                    <div>
                      <p className="font-medium text-gray-900">{doc.original_filename}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(doc.upload_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${doc.status === DocumentStatus.PROCESSED
                      ? 'bg-green-100 text-green-800'
                      : doc.status === DocumentStatus.PROCESSING
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                      }`}>
                      {doc.status}
                    </span>
                  </div>
                ))}
                {dashboardData.recent_documents.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No documents yet</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setActiveTab('documents')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">📄</div>
                    <div>
                      <div className="font-medium">View All Documents</div>
                      <div className="text-sm text-gray-500">Browse your medical records</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('timeline')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">📅</div>
                    <div>
                      <div className="font-medium">View Timeline</div>
                      <div className="text-sm text-gray-500">See your medical history</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('profile')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">👤</div>
                    <div>
                      <div className="font-medium">Update Profile</div>
                      <div className="text-sm text-gray-500">Manage your information</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <PatientDocuments />
        )}

        {activeTab === 'timeline' && (
          <PatientTimeline events={dashboardData.timeline_events} />
        )}

        {activeTab === 'profile' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Patient Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Patient ID</label>
                <p className="mt-1 text-sm text-gray-900">{dashboardData.patient_profile.patient_id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                <p className="mt-1 text-sm text-gray-900">
                  {dashboardData.patient_profile.date_of_birth
                    ? new Date(dashboardData.patient_profile.date_of_birth).toLocaleDateString()
                    : 'Not provided'
                  }
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <p className="mt-1 text-sm text-gray-900">{dashboardData.patient_profile.phone || 'Not provided'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Emergency Contact</label>
                <p className="mt-1 text-sm text-gray-900">
                  {dashboardData.patient_profile.emergency_contact_name || 'Not provided'}
                </p>
              </div>
            </div>
            
            {/* Clinics Section */}
            {(dashboardData.patient_profile.clinic_names && dashboardData.patient_profile.clinic_names.length > 0) || dashboardData.patient_profile.clinic_name ? (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-md font-semibold text-gray-900 mb-3">
                  {dashboardData.patient_profile.clinic_names && dashboardData.patient_profile.clinic_names.length > 1 ? 'My Clinics' : 'My Clinic'}
                </h4>
                {dashboardData.patient_profile.clinic_names && dashboardData.patient_profile.clinic_names.length > 0 ? (
                  <div className="space-y-2">
                    {dashboardData.patient_profile.clinic_names.map((clinicName: string, index: number) => (
                      <div
                        key={index}
                        className="flex items-center text-sm text-gray-900 bg-blue-50 px-4 py-2 rounded-md border border-blue-100"
                      >
                        <svg
                          className="w-5 h-5 text-blue-600 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                        <span className="font-medium">{clinicName}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  dashboardData.patient_profile.clinic_name && (
                    <p className="text-sm text-gray-900 bg-blue-50 px-4 py-2 rounded-md border border-blue-100">
                      {dashboardData.patient_profile.clinic_name}
                    </p>
                  )
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}