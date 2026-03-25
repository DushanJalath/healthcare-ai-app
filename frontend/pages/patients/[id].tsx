import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
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
  const [historyEntries, setHistoryEntries] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showAddHistory, setShowAddHistory] = useState(false)
  const [savingHistory, setSavingHistory] = useState(false)
  const [historyForm, setHistoryForm] = useState({
    title: '', condition: '', description: '', medications: '',
    treating_doctor: '', clinic_name: '', start_date: '', end_date: '',
    status: 'resolved' as 'ongoing' | 'resolved' | 'chronic',
  })

  const patientId = typeof id === 'string' ? parseInt(id) : null

  const isClinicUser = session?.user?.role === UserRole.CLINIC_ADMIN || 
                     session?.user?.role === UserRole.CLINIC_STAFF

  useEffect(() => {
    if (session?.accessToken && patientId) {
      fetchPatient()
      fetchHistoryEntries()
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
        router.push('/clinic/users')
      } else if (status === 403) {
        toast.error('Access denied')
        router.push('/clinic/users')
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

  const fetchHistoryEntries = async () => {
    if (!session?.accessToken || !patientId) return
    try {
      setHistoryLoading(true)
      const response = await api.get(`/medical-history/patient/${patientId}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setHistoryEntries(response.data.entries)
    } catch {
      // Silently fail for history - page still usable
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleAddHistoryEntry = async () => {
    if (!session?.accessToken || !patientId) return
    if (!historyForm.title.trim() || !historyForm.start_date) {
      toast.error('Title and start date are required')
      return
    }
    try {
      setSavingHistory(true)
      await api.post(`/medical-history/patient/${patientId}`, {
        ...historyForm,
        condition: historyForm.condition || null,
        description: historyForm.description || null,
        medications: historyForm.medications || null,
        treating_doctor: historyForm.treating_doctor || null,
        clinic_name: historyForm.clinic_name || null,
        end_date: historyForm.end_date || null,
      }, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      toast.success('Medical history entry added')
      setShowAddHistory(false)
      setHistoryForm({
        title: '', condition: '', description: '', medications: '',
        treating_doctor: '', clinic_name: '', start_date: '', end_date: '',
        status: 'resolved',
      })
      fetchHistoryEntries()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add entry')
    } finally {
      setSavingHistory(false)
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!patient) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Patient Not Found</h2>
            <p className="text-gray-600 mt-2">The requested patient could not be found.</p>
            <Link href="/clinic/users" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
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
        <title>Patient: {patient.patient_id} - MediKeep</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <Navbar
          title={`Patient: ${patient.patient_id}`}
          subtitle={patient.user_first_name || patient.user_last_name ? `${patient.user_first_name || ''} ${patient.user_last_name || ''}`.trim() : 'View and manage patient record'}
        />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <Link href="/clinic/users" className="text-blue-600 hover:text-blue-800">
              ← Back to Patients
            </Link>
            {isClinicUser && (
              <div className="flex items-center space-x-2">
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
              </div>
            )}
          </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                {/* Sickness & Treatment History */}
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900">Sickness &amp; Treatment History</h2>
                    {isClinicUser && (
                      <button
                        type="button"
                        onClick={() => setShowAddHistory(!showAddHistory)}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                      >
                        + Add Entry
                      </button>
                    )}
                  </div>

                  {/* Add form */}
                  {showAddHistory && (
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Add Medical History Entry</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                          <input type="text" value={historyForm.title}
                            onChange={(e) => setHistoryForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Flu Treatment"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Condition</label>
                          <input type="text" value={historyForm.condition}
                            onChange={(e) => setHistoryForm(f => ({ ...f, condition: e.target.value }))}
                            placeholder="e.g. Influenza"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Medications</label>
                          <textarea value={historyForm.medications}
                            onChange={(e) => setHistoryForm(f => ({ ...f, medications: e.target.value }))}
                            placeholder="e.g. Paracetamol 500mg twice daily" rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                          <textarea value={historyForm.description}
                            onChange={(e) => setHistoryForm(f => ({ ...f, description: e.target.value }))}
                            rows={2} placeholder="Additional notes..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Doctor</label>
                          <input type="text" value={historyForm.treating_doctor}
                            onChange={(e) => setHistoryForm(f => ({ ...f, treating_doctor: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Clinic</label>
                          <input type="text" value={historyForm.clinic_name}
                            onChange={(e) => setHistoryForm(f => ({ ...f, clinic_name: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
                          <input type="date" value={historyForm.start_date}
                            onChange={(e) => setHistoryForm(f => ({ ...f, start_date: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                            style={{ colorScheme: 'light' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                          <input type="date" value={historyForm.end_date}
                            onChange={(e) => setHistoryForm(f => ({ ...f, end_date: e.target.value }))}
                            disabled={historyForm.status === 'ongoing'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                            style={{ colorScheme: 'light' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                          <select value={historyForm.status}
                            onChange={(e) => {
                              const val = e.target.value as 'ongoing' | 'resolved' | 'chronic'
                              setHistoryForm(f => ({ ...f, status: val, end_date: val === 'ongoing' ? '' : f.end_date }))
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                            style={{ colorScheme: 'light' }}>
                            <option value="resolved">Resolved</option>
                            <option value="ongoing">Ongoing</option>
                            <option value="chronic">Chronic</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex space-x-3 mt-4">
                        <button type="button" onClick={handleAddHistoryEntry} disabled={savingHistory}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                          {savingHistory ? 'Saving...' : 'Save Entry'}
                        </button>
                        <button type="button" onClick={() => setShowAddHistory(false)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Timeline entries */}
                  {historyLoading ? (
                    <div className="animate-pulse space-y-4">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="h-20 bg-gray-100 rounded" />
                      ))}
                    </div>
                  ) : historyEntries.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">No medical history entries recorded yet.</p>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-[0.35rem] top-0 bottom-0 w-0.5 bg-gray-200" />
                      <div className="space-y-4">
                        {historyEntries.map((entry: any) => (
                          <div key={entry.id} className="relative flex gap-3 ml-0">
                            <div className={`relative z-10 flex-shrink-0 w-3 h-3 mt-1.5 rounded-full border-2 ${
                              entry.status === 'ongoing' ? 'bg-green-500 border-green-300' :
                              entry.status === 'chronic' ? 'bg-orange-500 border-orange-300' :
                              'bg-blue-500 border-blue-300'
                            }`} />
                            <div className="flex-1 bg-gray-50 rounded-lg border p-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="text-sm font-semibold text-gray-900">{entry.title}</h5>
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                  entry.status === 'ongoing' ? 'bg-green-100 text-green-800' :
                                  entry.status === 'chronic' ? 'bg-orange-100 text-orange-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                                </span>
                              </div>
                              {entry.condition && <p className="text-xs text-gray-600 mt-0.5">Diagnosis: {entry.condition}</p>}
                              <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(entry.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                {' - '}
                                {entry.end_date ? new Date(entry.end_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Present'}
                              </p>
                              {(entry.clinic_name || entry.treating_doctor) && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {entry.treating_doctor && `Dr. ${entry.treating_doctor}`}
                                  {entry.treating_doctor && entry.clinic_name && ' at '}
                                  {entry.clinic_name}
                                </p>
                              )}
                              {entry.medications && (
                                <div className="mt-2 p-2 bg-green-50 rounded border border-green-100">
                                  <p className="text-xs font-medium text-green-800 mb-0.5">Medications</p>
                                  <p className="text-xs text-gray-700 whitespace-pre-line">{entry.medications}</p>
                                </div>
                              )}
                              {entry.description && <p className="mt-1 text-xs text-gray-600 whitespace-pre-line">{entry.description}</p>}
                              {entry.created_by_name && (
                                <p className="mt-1 text-xs text-gray-400">Added by: {entry.created_by_name}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                {(patient.clinic_names && patient.clinic_names.length > 0) || patient.clinic_name ? (
                  <div className="bg-white shadow rounded-lg p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                      {patient.clinic_names && patient.clinic_names.length > 1 ? 'Clinics' : 'Clinic'}
                    </h2>
                    {patient.clinic_names && patient.clinic_names.length > 0 ? (
                      <div className="space-y-2">
                        {patient.clinic_names.map((clinicName, index) => (
                          <div
                            key={index}
                            className="flex items-center text-sm text-gray-900 bg-blue-50 px-3 py-2 rounded-md"
                          >
                            <svg
                              className="w-5 h-5 text-blue-600 mr-2"
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
                      patient.clinic_name && (
                        <p className="text-sm text-gray-900">{patient.clinic_name}</p>
                      )
                    )}
                  </div>
                ) : null}

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
