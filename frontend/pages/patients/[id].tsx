import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PatientForm from '@/components/patients/PatientForm'
import { PatientDetailResponse, UserRole, Gender } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function PatientDetailPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { id } = router.query
  const [patient, setPatient] = useState<PatientDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const patientId = typeof id === 'string' ? parseInt(id) : null

  const isClinicUser = session?.user?.role === UserRole.CLINIC_ADMIN || 
                     session?.user?.role === UserRole.CLINIC_STAFF

  useEffect(() => {
    if (session?.accessToken && patientId) {
      fetchPatient()
    }
  }, [session, patientId])

  const fetchPatient = async () => {
    if (!session?.accessToken || !patientId) return
    
    try {
      setLoading(true)
      const response = await api.get(`/patients/${patientId}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setPatient(response.data)
    } catch (error: any) {
      const status = error.response?.status
      if (status === 404) {
        toast.error('Patient not found')
        router.push('/patients')
      } else if (status === 403) {
        toast.error('Access denied')
        router.push('/patients')
      } else {
        toast.error(error.response?.data?.detail || 'Failed to load patient')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePatient = async (patientData: any) => {
    if (!patient) return
    
    try {
      const response = await api.put(`/patients/${patient.id}`, patientData, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      
      setPatient(response.data)
      setEditing(false)
      toast.success('Patient updated successfully!')
    } catch (error: any) {
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          const errorMessages = detail.map((err: any) => 
            `${err.loc?.join('.')}: ${err.msg}`
          ).join(', ')
          toast.error(`Validation error: ${errorMessages}`)
        } else if (typeof detail === 'string') {
          toast.error(detail)
        } else {
          toast.error('Failed to update patient')
        }
      } else {
        toast.error('Failed to update patient')
      }
    }
  }

  const formatGender = (gender?: Gender) => {
    if (!gender) return 'Not specified'
    
    const genderMap = {
      [Gender.MALE]: 'Male',
      [Gender.FEMALE]: 'Female',
      [Gender.OTHER]: 'Other',
      [Gender.PREFER_NOT_TO_SAY]: 'Prefer not to say'
    }
    
    return genderMap[gender] || 'Not specified'
  }

  const calculateAge = (dateOfBirth?: string) => {
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

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!patient) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Patient Not Found</h2>
            <p className="text-gray-600 mt-2">The requested patient could not be found.</p>
            <Link href="/patients" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
              Back to Patients
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Head>
        <title>Patient: {patient.patient_id} - Healthcare AI</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <nav className="mb-2">
                  <Link href="/patients" className="text-blue-600 hover:text-blue-800">
                    ← Back to Patients
                  </Link>
                </nav>
                <h1 className="text-3xl font-bold text-gray-900">
                  Patient: {patient.patient_id}
                </h1>
                <p className="mt-2 text-gray-600">
                  {patient.user_first_name && patient.user_last_name
                    ? `${patient.user_first_name} ${patient.user_last_name}`
                    : 'No user linked'}
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                {isClinicUser && (
                  <>
                    {!editing && (
                      <button
                        onClick={() => setEditing(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Edit Patient
                      </button>
                    )}
                    <Link
                      href={`/patients/${patient.id}/documents`}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      View Documents ({patient.documents_count || 0})
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {editing && isClinicUser ? (
            /* Edit Form */
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Edit Patient: {patient.patient_id}
                </h2>
                <button
                  onClick={() => setEditing(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <PatientForm
                patient={patient}
                onSubmit={handleUpdatePatient}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            /* Patient Details View */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Information */}
              <div className="lg:col-span-2 space-y-6">
                {/* Basic Information */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Basic Information</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Patient ID</label>
                      <p className="mt-1 text-sm text-gray-900">{patient.patient_id}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Date of Birth</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.date_of_birth 
                          ? new Date(patient.date_of_birth).toLocaleDateString()
                          : 'Not provided'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Age</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.date_of_birth ? `${calculateAge(patient.date_of_birth)} years` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Gender</label>
                      <p className="mt-1 text-sm text-gray-900">{formatGender(patient.gender)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Phone</label>
                      <p className="mt-1 text-sm text-gray-900">{patient.phone || 'Not provided'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Address</label>
                      <p className="mt-1 text-sm text-gray-900">{patient.address || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Emergency Contact</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Contact Name</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.emergency_contact_name || 'Not provided'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Contact Phone</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.emergency_contact_phone || 'Not provided'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Medical Information */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Medical Information</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Medical History</label>
                      <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                        {patient.medical_history || 'No medical history recorded'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Allergies</label>
                      <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                        {patient.allergies || 'No known allergies'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Current Medications</label>
                      <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                        {patient.current_medications || 'No current medications'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* User Information */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">User Account</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Name</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.user_first_name && patient.user_last_name
                          ? `${patient.user_first_name} ${patient.user_last_name}`
                          : 'No user linked'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.user_email || 'Not available'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Clinic Information */}
                {patient.clinic_name && (
                  <div className="bg-white shadow rounded-lg p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Clinic</h2>
                    <p className="text-sm text-gray-900">{patient.clinic_name}</p>
                  </div>
                )}

                {/* Statistics */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Statistics</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Total Documents</label>
                      <p className="mt-1 text-2xl font-bold text-gray-900">
                        {patient.documents_count || 0}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Last Visit</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.last_visit
                          ? new Date(patient.last_visit).toLocaleDateString()
                          : 'No visits recorded'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Created</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Date(patient.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Last Updated</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {patient.updated_at
                          ? new Date(patient.updated_at).toLocaleDateString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
