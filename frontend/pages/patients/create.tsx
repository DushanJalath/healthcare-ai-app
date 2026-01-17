import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PatientForm from '@/components/patients/PatientForm'
import Navbar from '@/components/layout/Navbar'
import { UserRole } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function CreatePatientPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleCreatePatient = async (patientData: any) => {
    if (!session?.accessToken) {
      toast.error('Not authenticated')
      return
    }

    try {
      setLoading(true)
      const response = await api.post('/patients', patientData, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      
      toast.success('Patient created successfully!')
      
      // Redirect to patient details or patients list
      if (response.data?.id) {
        router.push(`/patients/${response.data.id}`)
      } else {
        router.push('/patients')
      }
    } catch (error: any) {
      // Handle validation errors from FastAPI
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          // FastAPI validation errors are arrays
          const errorMessages = detail.map((err: any) => 
            `${err.loc?.join('.')}: ${err.msg}`
          ).join(', ')
          toast.error(`Validation error: ${errorMessages}`)
        } else if (typeof detail === 'string') {
          toast.error(detail)
        } else {
          toast.error('Failed to create patient')
        }
      } else {
        toast.error('Failed to create patient')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]}>
      <Head>
        <title>Create Patient - Healthcare AI</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <Navbar 
          title="Create New Patient"
          subtitle="Register a new patient in your clinic"
        />

        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link 
              href="/patients"
              className="text-blue-600 hover:text-blue-800 inline-flex items-center"
            >
              ← Back to Patients
            </Link>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <PatientForm
              onSubmit={handleCreatePatient}
              onCancel={() => router.push('/patients')}
              loading={loading}
            />
          </div>
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
