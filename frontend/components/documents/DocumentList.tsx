import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Document, DocumentStatus, DocumentType, Patient } from '@/types'
import api from '@/utils/api'
import toast from 'react-hot-toast'
import ConfirmDialog from '../common/ConfirmDialog'
import DocumentExplanationsModal from '@/components/documents/DocumentExplanationsModal'

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

  const [explanationsModal, setExplanationsModal] = useState<{
    documentId: number
    loading: boolean
    summary: string
    explanations: string[]
    error: string | null
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
    setExplanationsModal({
      documentId: document.id,
      loading: true,
      summary: '',
      explanations: [],
      error: null
    })
    try {
      const response = await api.get(`/documents/${document.id}/explanations`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })

      if (response.data.status === 'processing') {
        toast.info('Text extraction is still in progress. Please try again later.')
        setExplanationsModal(null)
        return
      }

      if (response.data.status === 'not_available') {
        toast.error('No extracted text available for this document.')
        setExplanationsModal(null)
        return
      }

      setExplanationsModal({
        documentId: document.id,
        loading: false,
        summary: response.data.summary || '',
        explanations: Array.isArray(response.data.explanations) ? response.data.explanations : [],
        error: null
      })
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Failed to load explanations.'
      setExplanationsModal({
        documentId: document.id,
        loading: false,
        summary: '',
        explanations: [],
        error: typeof detail === 'string' ? detail : 'Failed to load explanations.'
      })
    }
  }

  const handleCopyExplanations = () => {
    if (!explanationsModal || explanationsModal.loading || explanationsModal.error) return
    const lines = [
      'Summary',
      explanationsModal.summary,
      '',
      'Explanations',
      ...explanationsModal.explanations.map((e) => `• ${e}`)
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Copied to clipboard')
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
            <div className="overflow-x-auto -mx-4 sm:-mx-6">
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
                              title="View explanations"
                            >
                              View explanations
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="relative top-20 mx-2 sm:mx-auto p-5 border w-auto max-w-sm sm:max-w-md shadow-lg rounded-md bg-white">
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

      <DocumentExplanationsModal
        open={!!explanationsModal}
        loading={explanationsModal?.loading ?? false}
        summary={explanationsModal?.summary ?? ''}
        explanations={explanationsModal?.explanations ?? []}
        error={explanationsModal?.error ?? null}
        onClose={() => setExplanationsModal(null)}
        onCopy={handleCopyExplanations}
      />
    </div>
  )
}