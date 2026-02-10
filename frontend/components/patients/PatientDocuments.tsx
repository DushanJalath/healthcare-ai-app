import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { Document, DocumentType, DocumentStatus } from '@/types'
import api from '@/utils/api'
import toast from 'react-hot-toast'

export default function PatientDocuments() {
  const { data: session } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: '',
    document_type: ''
  })
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchDocuments()
  }, [session?.accessToken, filters.status, filters.document_type, page])

  // Helper function to clear session and redirect to landing page
  const clearSessionAndRedirect = async () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    await signOut({ redirect: false })
    router.push('/')
  }

  const fetchDocuments = async () => {
    if (!session?.accessToken) return
    
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '20'
      })
      
      if (filters.status) params.append('status', filters.status)
      if (filters.document_type) params.append('document_type', filters.document_type)

      const response = await api.get(`/patient-dashboard/documents?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      
      setDocuments(response.data)
    } catch (error: any) {
      const status = error.response?.status
      
      // If patient profile not found (404) or access denied (403), clear session and redirect
      if (status === 404 || status === 403) {
        toast.error('Patient profile not found. Redirecting to home page...')
        await clearSessionAndRedirect()
        return
      }
      
      toast.error(error.response?.data?.detail || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (document: Document) => {
    try {
      const response = await api.get(`/documents/${document.id}/download`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        responseType: 'blob'
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = window.document.createElement('a')
      link.href = url
      link.setAttribute('download', document.original_filename)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      toast.success('Document downloaded successfully')
    } catch (error) {
      toast.error('Failed to download document')
    }
  }

  const getStatusBadge = (status: DocumentStatus) => {
    const styles = {
      [DocumentStatus.UPLOADED]: 'bg-blue-100 text-blue-800',
      [DocumentStatus.PROCESSING]: 'bg-yellow-100 text-yellow-800',
      [DocumentStatus.PROCESSED]: 'bg-green-100 text-green-800',
      [DocumentStatus.FAILED]: 'bg-red-100 text-red-800'
    }

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }

  const getTypeDisplay = (type: DocumentType) => {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Filter Documents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value={DocumentStatus.UPLOADED}>Uploaded</option>
              <option value={DocumentStatus.PROCESSING}>Processing</option>
              <option value={DocumentStatus.PROCESSED}>Processed</option>
              <option value={DocumentStatus.FAILED}>Failed</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type
            </label>
            <select
              value={filters.document_type}
              onChange={(e) => setFilters(prev => ({ ...prev, document_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value={DocumentType.LAB_REPORT}>Lab Report</option>
              <option value={DocumentType.PRESCRIPTION}>Prescription</option>
              <option value={DocumentType.MEDICAL_RECORD}>Medical Record</option>
              <option value={DocumentType.IMAGING_REPORT}>Imaging Report</option>
              <option value={DocumentType.DISCHARGE_SUMMARY}>Discharge Summary</option>
              <option value={DocumentType.OTHER}>Other</option>
            </select>
          </div>
        </div>
        
        <div className="mt-4">
          <button
            onClick={() => {
              setFilters({ status: '', document_type: '' })
              setPage(1)
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            My Documents ({documents.length})
          </h3>
        </div>
        
        {loading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-300 rounded w-1/4"></div>
                    <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📄</div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Documents Found</h4>
            <p className="text-gray-600">
              {Object.values(filters).some(f => f) 
                ? 'Try adjusting your filters to see more documents.'
                : 'Your medical documents will appear here once they are uploaded by your clinic.'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {documents.map((document) => (
              <div key={document.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">
                      {document.original_filename}
                    </h4>
                    <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                      <span>{getTypeDisplay(document.document_type)}</span>
                      <span>•</span>
                      <span>{new Date(document.upload_date).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{(document.file_size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    {document.notes && (
                      <p className="mt-1 text-sm text-gray-600">{document.notes}</p>
                    )}
                    {document.status === DocumentStatus.FAILED && document.processing_error && (
                      <p className="mt-1 text-xs text-red-600" title={document.processing_error}>
                        Reason: {document.processing_error.length > 80 ? document.processing_error.slice(0, 80) + '…' : document.processing_error}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    {getStatusBadge(document.status)}
                    <button
                      onClick={() => handleDownload(document)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}