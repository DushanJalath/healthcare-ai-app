import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Document, DocumentStatus, DocumentType, Patient } from '@/types'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface DocumentListProps {
  patientId?: number
  refreshTrigger?: number
}

export default function DocumentList({ patientId, refreshTrigger }: DocumentListProps) {
  const { data: session } = useSession()
  const [documents, setDocuments] = useState<Document[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedDocument, setSelectedDocument] = useState<number | null>(null)
  const [assigningTo, setAssigningTo] = useState<number | null>(null)

  const perPage = 10

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString()
      })
      
      if (patientId) {
        params.append('patient_id', patientId.toString())
      }

      const response = await api.get(`/documents?${params}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })

      setDocuments(response.data.documents)
      setTotal(response.data.total)
    } catch (error) {
      toast.error('Failed to fetch documents')
    } finally {
      setLoading(false)
    }
  }

  const fetchPatients = async () => {
    try {
      const response = await api.get('/patients', {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      setPatients(response.data.patients)
    } catch (error) {
      console.error('Failed to fetch patients')
    }
  }

  useEffect(() => {
    if (session?.accessToken) {
      fetchDocuments()
      if (!patientId) {
        fetchPatients()
      }
    }
  }, [session, page, patientId, refreshTrigger])

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
    } catch (error) {
      toast.error('Failed to download document')
    }
  }

  const handleAssignToPatient = async (documentId: number, patientId: number) => {
    try {
      await api.put(`/documents/${documentId}/assign`, {
        document_id: documentId,
        patient_id: patientId
      }, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      
      toast.success('Document assigned successfully')
      fetchDocuments()
      setSelectedDocument(null)
    } catch (error) {
      toast.error('Failed to assign document')
    }
  }

  const handleDelete = async (document: Document) => {
    const confirmed = window.confirm(`Delete ${document.original_filename}? This action cannot be undone.`)
    if (!confirmed || !session?.accessToken) return

    try {
      setDeletingId(document.id)
      const { data } = await api.delete(`/documents/${document.id}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })

      if (data?.vector_cleanup_success === false) {
        toast.success('Document deleted, but re-indexing will run shortly.')
      } else {
        toast.success('Document deleted successfully')
      }

      await fetchDocuments()
    } catch (error) {
      toast.error('Failed to delete document')
    } finally {
      setDeletingId(null)
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

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Documents Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Documents ({total})
          </h3>
          
          {documents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No documents found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Upload Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {document.original_filename}
                          </div>
                          {document.notes && (
                            <div className="text-sm text-gray-500">
                              {document.notes}
                            </div>
                          )}
                          {document.status === 'failed' && document.processing_error && (
                            <div className="text-xs text-red-600 mt-1" title={document.processing_error}>
                              Reason: {document.processing_error.length > 60 ? document.processing_error.slice(0, 60) + '…' : document.processing_error}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getTypeDisplay(document.document_type)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(document.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(document.upload_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {(document.file_size / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleDownload(document)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Download
                        </button>

                        <button
                          onClick={() => handleDelete(document)}
                          disabled={deletingId === document.id}
                          className={`text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {deletingId === document.id ? 'Deleting…' : 'Delete'}
                        </button>
                        
                        {!patientId && !document.patient_id && patients.length > 0 && (
                          <button
                            onClick={() => setSelectedDocument(document.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {total > perPage && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((page - 1) * perPage) + 1} to {Math.min(page * perPage, total)} of {total} results
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * perPage >= total}
                  className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Assign Document to Patient
            </h3>
            
            <div className="space-y-4">
              {patients.map(patient => (
                <button
                  key={patient.id}
                  onClick={() => handleAssignToPatient(selectedDocument, patient.id)}
                  className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="font-medium">{patient.patient_id}</div>
                  <div className="text-sm text-gray-600">
                    {patient.user_first_name} {patient.user_last_name}
                  </div>
                </button>
              ))}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setSelectedDocument(null)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}