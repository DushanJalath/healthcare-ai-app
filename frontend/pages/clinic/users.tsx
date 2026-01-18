import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import { PatientDetailResponse, UserRole, Gender } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function ClinicPatientsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [patients, setPatients] = useState<PatientDetailResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch patients function
  const fetchPatients = useCallback(async (search: string = '') => {
    if (!session?.accessToken) return

    try {
      setLoading(true)
      const params = new URLSearchParams({ page: '1', per_page: '100' })
      if (search) {
        params.append('search', search)
      }

      const response = await api.get(`/patients?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setPatients(response.data.patients || [])
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load clinic patients')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken])

  // Initial load - only when session is available
  useEffect(() => {
    if (session?.accessToken) {
      fetchPatients(searchQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken])

  // Debounced search - wait 500ms after user stops typing
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (session?.accessToken) {
        fetchPatients(searchQuery)
      }
    }, 500)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])


  const formatGender = (gender: Gender) => {
    return gender.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const calculateAge = (dateOfBirth: string) => {
    if (!dateOfBirth) return 'N/A'
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  const handleViewPatient = (patientId: number) => {
    router.push(`/patients/${patientId}`)
  }

  const handleViewDocuments = (patientId: number) => {
    router.push(`/patients/${patientId}/documents`)
  }

  if (loading && patients.length === 0) {
    return (
      <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading clinic patients...</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]}>
      <Head>
        <title>Clinic Patients - MediKeep</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Clinic Patients"
          subtitle="View all patients associated with your clinic"
        />

        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">All Clinic Patients</h2>
              <p className="mt-1 text-sm text-gray-600">
                Total: {patients.length} {patients.length === 1 ? 'patient' : 'patients'}
              </p>
            </div>
            <button
              onClick={() => router.push('/clinic/dashboard')}
              className="text-medical-600 hover:text-medical-700 font-medium"
            >
              ← Back to Dashboard
            </button>
          </div>

          {/* Search Bar */}
          <div className="mb-6">
            <div className="max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by patient ID, name, or address..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Patients List */}
          {patients.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-400 text-6xl mb-4">🏥</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No patients found</h3>
              <p className="text-gray-600">
                {searchQuery 
                  ? 'No patients match your search criteria.'
                  : 'There are no patients associated with your clinic yet.'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Age / Gender
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Documents
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Registered
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {patients.map((patient) => (
                      <tr key={patient.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-medical-500 to-tech-500 flex items-center justify-center text-white font-semibold text-sm">
                              {patient.patient_id.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {patient.patient_id}
                              </div>
                              {(patient.user_first_name || patient.user_last_name) && (
                                <div className="text-sm text-gray-500">
                                  {patient.user_first_name} {patient.user_last_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {patient.date_of_birth ? `${calculateAge(patient.date_of_birth)} years` : 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatGender(patient.gender)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{patient.phone || 'N/A'}</div>
                          {patient.address && (
                            <div className="text-sm text-gray-500 truncate max-w-xs" title={patient.address}>
                              {patient.address}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {patient.documents_count || 0} document{(patient.documents_count || 0) !== 1 ? 's' : ''}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(patient.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <button
                            onClick={() => handleViewPatient(patient.id)}
                            className="text-medical-600 hover:text-medical-900"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleViewDocuments(patient.id)}
                            className="text-tech-600 hover:text-tech-900"
                          >
                            Documents
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
