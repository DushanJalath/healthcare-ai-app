import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import DocumentUpload from '@/components/documents/DocumentUpload'
import { Patient, UserRole } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

export default function DocumentUploadPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPatients = async () => {
      if (!session?.accessToken) return
      
      try {
        const response = await api.get('/patients', {
          headers: { Authorization: `Bearer ${session.accessToken}` }
        })
        setPatients(response.data.patients)
      } catch (error) {
        console.error('Failed to fetch patients:', error)
        toast.error('Failed to load patients')
      } finally {
        setLoading(false)
      }
    }

    fetchPatients()
  }, [session])

  const handleUploadComplete = () => {
    toast.success('Upload completed! Redirecting to documents...')
    setTimeout(() => {
      router.push('/documents')
    }, 1500)
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN, UserRole.CLINIC_STAFF]}>
      <Head>
        <title>Upload Documents - Healthcare AI</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Upload Documents</h1>
            <p className="mt-2 text-gray-600">
              Upload medical documents and assign them to patients
            </p>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <DocumentUpload
                patients={patients}
                onUploadComplete={handleUploadComplete}
              />
            )}
          </div>
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}