import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PatientList from '@/components/patients/PatientList'
import PatientForm from '@/components/patients/PatientForm'
import PatientStatsOverview from '@/components/patients/PatientStatsOverview'
import { Patient, UserRole, PatientStatsResponse } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function PatientsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [patientStats, setPatientStats] = useState<PatientStatsResponse | null>(null)
  const [showStats, setShowStats] = useState(false)

  const isClinicUser = session?.user?.role === UserRole.CLINIC_ADMIN || 
                     session?.user?.role === UserRole.CLINIC_STAFF

  useEffect(() => {
    fetchPatients()
    if (isClinicUser) {
      fetchPatientStats()
    }
  }, [session, searchQuery])

  const fetchPatients = async () => {
    if (!session?.accessToken) return
    
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: '1', per_page: '100' })
      if (searchQuery) {
        params.append('search', searchQuery)
      }

      const response = await api.get(`/patients?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setPatients(response.data.patients)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load patients')
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePatient = async (patientData: any) => {
    try {
      await api.post('/patients', patientData, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      
      toast.success('Patient created successfully!')
      setShowCreateForm(false)
      fetchPatients()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create patient')
    }
  }

  const handleUpdatePatient = async (patientData: any) => {
    if (!editingPatient) return
    
    try {
      await api.put(`/patients/${editingPatient.id}`, patientData, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      
      toast.success('Patient updated successfully!')
      setEditingPatient(null)
      fetchPatients()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update patient')
    }
  }

  const handleDeletePatient = async (patientId: number) => {
    if (!confirm('Are you sure you want to delete this patient? This action cannot be undone.')) {
      return
    }
    
    try {
      await api.delete(`/patients/${patientId}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      
      toast.success('Patient deleted successfully!')
      fetchPatients()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete patient')
    }
  }

  const handleViewDocuments = (patientId: number) => {
    router.push(`/patients/${patientId}/documents`)
  }

  const fetchPatientStats = async () => {
    if (!session?.accessToken || !isClinicUser) return
    
    try {
      const response = await api.get('/patients/stats', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setPatientStats(response.data)
    } catch (error: any) {
      // Silently fail - stats are optional
      console.error('Failed to load patient stats:', error)
    }
  }

  // Use patients directly since backend handles filtering
  const filteredPatients = patients

  return (
    <ProtectedRoute>
      <Head>
        <title>Patients - MediKeep</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Patients</h1>
                <p className="mt-2 text-gray-600">
                  {isClinicUser ? 'Manage patient records and information' : 'Your patient profile'}
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                {isClinicUser && (
                  <>
                    <button
                      onClick={() => setShowStats(!showStats)}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      {showStats ? 'Hide Stats' : 'Show Stats'}
                    </button>
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Add Patient
                    </button>
                  </>
                )}
                <Link
                  href="/dashboard"
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Patient Stats */}
          {showStats && isClinicUser && patientStats && (
            <div className="mb-8">
              <PatientStatsOverview stats={patientStats} />
            </div>
          )}

          {/* Search Bar */}
          {isClinicUser && (
            <div className="mb-6">
              <div className="max-w-md">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patients..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Create Form Modal */}
          {showCreateForm && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-8 mx-auto max-w-4xl bg-white rounded-lg shadow-lg">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Add New Patient</h2>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                      ×
                    </button>
                  </div>
                  
                  <PatientForm
                    onSubmit={handleCreatePatient}
                    onCancel={() => setShowCreateForm(false)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Edit Form Modal */}
          {editingPatient && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-8 mx-auto max-w-4xl bg-white rounded-lg shadow-lg">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">
                      Edit Patient: {editingPatient.patient_id}
                    </h2>
                    <button
                      onClick={() => setEditingPatient(null)}
                      className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                      ×
                    </button>
                  </div>
                  
                  <PatientForm
                    patient={editingPatient}
                    onSubmit={handleUpdatePatient}
                    onCancel={() => setEditingPatient(null)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Patient List */}
          <PatientList
            patients={filteredPatients}
            loading={loading}
            onEdit={isClinicUser ? setEditingPatient : undefined}
            onDelete={isClinicUser ? handleDeletePatient : undefined}
            onViewDocuments={handleViewDocuments}
            showActions={isClinicUser}
          />
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}