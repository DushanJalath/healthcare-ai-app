import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Document, DocumentStatus, DocumentType, Patient } from '@/types'
import api from '@/utils/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '../common/ConfirmDialog'

interface DocumentListProps {
  // Standalone mode props
  patientId?: number
  refreshTrigger?: number
  // Managed mode props (when used with DocumentManager)
  documents?: Document[]
  patients?: Patient[]
  onRefresh?: () => void
  loading?: boolean
}

export default function DocumentList({ 
  patientId, 
  refreshTrigger,
  documents: propDocuments,
  patients: propPatients,
  onRefresh,
  loading: propLoading
}: DocumentListProps) {
  const { data: session } = useSession()
  const [documents, setDocuments] = useState<Document[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedDocument, setSelectedDocument] = useState<number | null>(null)
  const [assigningTo, setAssigningTo] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; document: Document | null }>({ open: false, document: null })

  // Determine if we're in managed mode (props provided) or standalone mode
  const isManagedMode = propDocuments !== undefined
  const displayDocuments = isManagedMode ? propDocuments : documents
  const displayPatients = isManagedMode && propPatients ? propPatients : patients
  const displayLoading = isManagedMode && propLoading !== undefined ? propLoading : loading

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
    // Only fetch if not in managed mode
    if (!isManagedMode && session?.accessToken) {
      fetchDocuments()
      if (!patientId) {
        fetchPatients()
      }
    }
  }, [session, page, patientId, refreshTrigger, isManagedMode])

  const [viewingText, setViewingText] = useState<{
    documentId: number;
    text: string;
    status: string;
  } | null>(null)

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

  const handleViewText = async (document: Document) => {
    try {
      const response = await api.get(`/documents/${document.id}/extracted-text`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })

      if (response.data.status === 'processing') {
        toast.info('Text extraction is still in progress. Please try again later.')
        return
      }

      if (response.data.status === 'not_available') {
        toast.error('No extracted text available for this document.')
        return
      }

      setViewingText({
        documentId: document.id,
        text: response.data.extracted_text,
        status: response.data.status
      })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to retrieve extracted text')
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
      if (isManagedMode && onRefresh) {
        onRefresh()
      } else {
        fetchDocuments()
      }
      setSelectedDocument(null)
    } catch (error) {
      toast.error('Failed to assign document')
    }
  }

  const handleDeleteClick = (document: Document) => {
    setDeleteConfirm({ open: true, document })
  }

  const handleDeleteConfirm = async () => {
    const document = deleteConfirm.document
    if (!document || !session?.accessToken) return

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

      if (isManagedMode && onRefresh) {
        onRefresh()
      } else {
        await fetchDocuments()
      }
    } catch (error) {
      toast.error('Failed to delete document')
    } finally {
      setDeletingId(null)
      setDeleteConfirm({ open: false, document: null })
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

  if (displayLoading) {
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
          {!isManagedMode && (
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Documents ({total})
            </h3>
          )}
          
          {displayDocuments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No documents found</p>
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      File Name
                    </th>
                    {!patientId && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Patient
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Upload Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayDocuments.map((document) => (
                    <tr key={document.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="max-w-md">
                          <div className="text-sm font-medium text-gray-900 truncate" title={document.original_filename}>
                            {document.original_filename}
                          </div>
                          {document.notes && (
                            <div className="text-xs text-gray-500 mt-1 truncate" title={document.notes}>
                              {document.notes}
                            </div>
                          )}
                          {document.status === 'failed' && document.processing_error && (
                            <div className="text-xs text-red-600 mt-1 truncate" title={document.processing_error}>
                              Error: {document.processing_error}
                            </div>
                          )}
                        </div>
                      </td>
                      {!patientId && (
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {document.patient_id_number || '—'}
                          </div>
                          {document.patient_name && (
                            <div className="text-xs text-gray-500 mt-1">
                              {document.patient_name}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {getTypeDisplay(document.document_type)}
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(document.status)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(document.upload_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleDownload(document)}
                            className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                            title="Download"
                          >
                            Download
                          </button>

                          {document.status === DocumentStatus.PROCESSED && (
                            <button
                              onClick={() => handleViewText(document)}
                              className="text-green-600 hover:text-green-800 font-medium transition-colors"
                              title="View Text"
                            >
                              View Text
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteClick(document)}
                            disabled={deletingId === document.id}
                            className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            title="Delete"
                          >
                            {deletingId === document.id ? 'Deleting…' : 'Delete'}
                          </button>
                          
                          {!patientId && !document.patient_id && displayPatients.length > 0 && (
                            <button
                              onClick={() => setSelectedDocument(document.id)}
                              className="text-purple-600 hover:text-purple-800 font-medium transition-colors"
                              title="Assign to Patient"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination - only show in standalone mode */}
        {!isManagedMode && total > perPage && (
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
              {displayPatients.map(patient => (
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, document: null })}
        onConfirm={handleDeleteConfirm}
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteConfirm.document?.original_filename}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700 text-white"
        isLoading={deletingId !== null}
      />

      {/* Extracted Text Modal */}
      {viewingText && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setViewingText(null)}
            ></div>

            {/* Modal panel */}
            <div className="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Extracted Text
                </h3>
                <button
                  onClick={() => setViewingText(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 max-h-96 overflow-y-auto">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                    {viewingText.text}
                  </pre>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(viewingText.text)
                    toast.success('Text copied to clipboard')
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setViewingText(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}