import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import DocumentList from '@/components/documents/DocumentList'
import DocumentUpload from '@/components/documents/DocumentUpload'
import { Patient, UserRole } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function PatientDocumentsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { id } = router.query
  const [patient, setPatient] = useState<Patient | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [loading, setLoading] = useState(true)

  const patientId = typeof id === 'string' ? parseInt(id) : null

  useEffect(() => {
    const fetchPatient = async () => {
      if (!session?.accessToken || !patientId) return
      
      try {
        const response = await api.get(`/patients/${patientId}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` }
        })
        setPatient(response.data)
      } catch (error) {
        toast.error('Failed to load patient information')
        router.push('/clinic/users')
      } finally {
        setLoading(false)
      }
    }

    fetchPatient()
  }, [session, patientId, router])

  const handleUploadComplete = () => {
    setShowUpload(false)
    setRefreshTrigger(prev => prev + 1)
    toast.success('Documents uploaded successfully!')
  }

  const isClinicUser = session?.user?.role === UserRole.CLINIC_ADMIN || 
                     session?.user?.role === UserRole.CLINIC_STAFF

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Patient Not Found</h2>
          <p className="text-gray-600 mt-2">The requested patient could not be found.</p>
          <Link href="/clinic/users" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
            Back to Patients
          </Link>
        </div>
      </div>
    )
  }

  const patientName = [((patient as { user_first_name?: string }).user_first_name), ((patient as { user_last_name?: string }).user_last_name)].filter(Boolean).join(' ') || patient.patient_id

  return (
    <ProtectedRoute>
      <Head>
        <title>Documents - MediKeep</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Documents"
          subtitle={`Manage documents for ${patientName}`}
        />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Patient Header */}
          <div className="mb-8">
            <nav className="mb-4">
              <Link href="/clinic/users" className="text-blue-600 hover:text-blue-800">
                ← Back to Patients
              </Link>
            </nav>
            
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Patient: {patient.patient_id}
                  </h1>
                  <p className="text-gray-600 mt-1">
                    {patient.user_first_name} {patient.user_last_name}
                  </p>
                  {patient.date_of_birth && (
                    <p className="text-sm text-gray-500">
                      DOB: {new Date(patient.date_of_birth).toLocaleDateString()}
                    </p>
                  )}
                </div>
                
                {isClinicUser && (
                  <button
                    onClick={() => setShowUpload(!showUpload)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {showUpload ? 'Cancel Upload' : 'Upload Documents'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Upload Section */}
          {showUpload && isClinicUser && (
            <div className="mb-8 bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Upload Documents for {patient.patient_id}
              </h2>
              <DocumentUpload
                selectedPatientId={patientId!}
                onUploadComplete={handleUploadComplete}
              />
            </div>
          )}

          {/* Documents List */}
          <DocumentList 
            patientId={patientId!}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}