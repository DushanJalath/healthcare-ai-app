import React, { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { Document, DocumentType, DocumentStatus, ClinicListItem } from '@/types'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface EnrolledClinic {
  id: number
  name: string
}

export default function PatientDocuments() {
  const { data: session } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', document_type: '' })
  const [page, setPage] = useState(1)

  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDocType, setUploadDocType] = useState<string>('')
  const [uploadNotes, setUploadNotes] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [viewingText, setViewingText] = useState<{
    documentId: number
    text: string
    status: string
  } | null>(null)

  // Share with clinic state
  const [enrolledClinics, setEnrolledClinics] = useState<EnrolledClinic[]>([])
  const [shareModal, setShareModal] = useState<Document | null>(null)
  const [selectedClinicId, setSelectedClinicId] = useState<number | 0>(0)
  const [sharingDocId, setSharingDocId] = useState<number | null>(null)
  const [revokingDocId, setRevokingDocId] = useState<number | null>(null)

  useEffect(() => {
    fetchDocuments()
  }, [session?.accessToken, filters.status, filters.document_type, page])

  useEffect(() => {
    fetchEnrolledClinics()
  }, [session?.accessToken])

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
      const params = new URLSearchParams({ page: page.toString(), per_page: '50' })
      if (filters.status) params.append('status', filters.status)
      if (filters.document_type) params.append('document_type', filters.document_type)

      const response = await api.get(`/patient-dashboard/documents?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setDocuments(response.data)
    } catch (error: any) {
      const s = error.response?.status
      if (s === 404 || s === 403) {
        toast.error('Patient profile not found. Redirecting to home page...')
        await clearSessionAndRedirect()
        return
      }
      toast.error(error.response?.data?.detail || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const fetchEnrolledClinics = async () => {
    if (!session?.accessToken) return
    try {
      const response = await api.get('/clinic-enrollment/clinics', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      const enrolled = response.data.clinics
        .filter((c: ClinicListItem) => c.is_enrolled)
        .map((c: ClinicListItem) => ({ id: c.id, name: c.name }))
      setEnrolledClinics(enrolled)
    } catch {
      // silent — clinics list is supplementary
    }
  }

  const handleUpload = async () => {
    if (!session?.accessToken || !uploadFile) return
    try {
      setUploading(true)
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (uploadDocType) formData.append('document_type', uploadDocType)
      if (uploadNotes.trim()) formData.append('notes', uploadNotes.trim())

      await api.post('/patient-dashboard/my-uploads', formData, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      })
      toast.success('Document uploaded successfully! Text extraction will begin shortly.')
      setUploadFile(null)
      setUploadDocType('')
      setUploadNotes('')
      setShowUploadForm(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchDocuments()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteOwnUpload = async (docId: number) => {
    if (!session?.accessToken) return
    if (!confirm('Are you sure you want to delete this document?')) return
    try {
      setDeletingId(docId)
      await api.delete(`/patient-dashboard/my-uploads/${docId}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      toast.success('Document deleted')
      fetchDocuments()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete document')
    } finally {
      setDeletingId(null)
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
      link.setAttribute('download', document.original_filename || document.filename)
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Document downloaded successfully')
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
        toast('Text extraction is still in progress. Please try again later.', { icon: 'info' })
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

  const handleShareWithClinic = async () => {
    if (!session?.accessToken || !shareModal || !selectedClinicId) return
    try {
      setSharingDocId(shareModal.id)
      await api.post(
        `/patient-dashboard/my-uploads/${shareModal.id}/share-with-clinic`,
        { clinic_id: selectedClinicId },
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      const clinicName = enrolledClinics.find(c => c.id === selectedClinicId)?.name || 'clinic'
      toast.success(`Document shared with ${clinicName}`)
      setShareModal(null)
      setSelectedClinicId(0)
      fetchDocuments()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to share document')
    } finally {
      setSharingDocId(null)
    }
  }

  const handleRevokeClinicAccess = async (docId: number) => {
    if (!session?.accessToken) return
    if (!confirm('Revoke clinic access? The clinic will no longer see this document.')) return
    try {
      setRevokingDocId(docId)
      await api.post(
        `/patient-dashboard/my-uploads/${docId}/revoke-clinic-access`,
        {},
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      toast.success('Clinic access revoked')
      fetchDocuments()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to revoke access')
    } finally {
      setRevokingDocId(null)
    }
  }

  const getStatusBadge = (status: DocumentStatus) => {
    const styles: Record<string, string> = {
      [DocumentStatus.UPLOADED]: 'bg-blue-100 text-blue-800',
      [DocumentStatus.PROCESSING]: 'bg-yellow-100 text-yellow-800',
      [DocumentStatus.PROCESSED]: 'bg-green-100 text-green-800',
      [DocumentStatus.FAILED]: 'bg-red-100 text-red-800'
    }
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }

  const getTypeDisplay = (type: DocumentType) =>
    type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())

  const getClinicNameById = (clinicId: number | null | undefined) => {
    if (!clinicId) return null
    return enrolledClinics.find(c => c.id === clinicId)?.name || `Clinic #${clinicId}`
  }

  const clinicDocs = documents.filter(d => !d.is_patient_upload)
  const patientDocs = documents.filter(d => d.is_patient_upload)

  const renderDocRow = (doc: Document, allowDelete: boolean) => {
    const isPersonal = doc.is_patient_upload
    const sharedClinicName = isPersonal && doc.clinic_id ? getClinicNameById(doc.clinic_id) : null

    return (
      <div key={doc.id} className="p-4 sm:p-6 hover:bg-gray-50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {doc.original_filename || doc.filename}
              </h4>
              {isPersonal && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                  My Upload
                </span>
              )}
              {sharedClinicName && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700">
                  Shared with {sharedClinicName}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
              <span>{getTypeDisplay(doc.document_type)}</span>
              <span>{doc.upload_date ? new Date(doc.upload_date).toLocaleDateString() : ''}</span>
              <span>{(doc.file_size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            {doc.notes && <p className="mt-1 text-sm text-gray-600">{doc.notes}</p>}
            {doc.status === DocumentStatus.FAILED && doc.processing_error && (
              <p className="mt-1 text-xs text-red-600" title={doc.processing_error}>
                Reason: {doc.processing_error.length > 80 ? doc.processing_error.slice(0, 80) + '\u2026' : doc.processing_error}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {getStatusBadge(doc.status)}
            <button onClick={() => handleDownload(doc)} className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap">
              Download
            </button>
            {doc.status === DocumentStatus.PROCESSED && (
              <button onClick={() => handleViewText(doc)} className="text-green-600 hover:text-green-800 text-sm font-medium whitespace-nowrap">
                View Text
              </button>
            )}
            {/* Share with clinic / Revoke for personal uploads */}
            {isPersonal && !sharedClinicName && enrolledClinics.length > 0 && (
              <button
                onClick={() => { setShareModal(doc); setSelectedClinicId(0) }}
                className="text-teal-600 hover:text-teal-800 text-sm font-medium whitespace-nowrap"
              >
                Share with Clinic
              </button>
            )}
            {isPersonal && sharedClinicName && (
              <button
                onClick={() => handleRevokeClinicAccess(doc.id)}
                disabled={revokingDocId === doc.id}
                className="text-orange-600 hover:text-orange-800 text-sm font-medium whitespace-nowrap disabled:opacity-50"
              >
                {revokingDocId === doc.id ? 'Revoking...' : 'Revoke Access'}
              </button>
            )}
            {allowDelete && (
              <button
                onClick={() => handleDeleteOwnUpload(doc.id)}
                disabled={deletingId === doc.id}
                className="text-red-600 hover:text-red-800 text-sm font-medium whitespace-nowrap disabled:opacity-50"
              >
                {deletingId === doc.id ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Upload Your Records</h3>
            <p className="text-sm text-gray-500">
              Upload your own medical records, prescriptions, or other documents. You can then share them with any clinic you are enrolled in.
            </p>
          </div>
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex-shrink-0 self-start sm:self-auto"
          >
            {showUploadForm ? 'Cancel' : '+ Upload Document'}
          </button>
        </div>

        {showUploadForm && (
          <div className="mt-4 border-t pt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-gray-500">PDF, JPEG, PNG, TIFF, BMP (max 50 MB)</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  style={{ colorScheme: 'light' }}
                >
                  <option value="" className="bg-white text-gray-900">Other</option>
                  <option value={DocumentType.LAB_REPORT} className="bg-white text-gray-900">Lab Report</option>
                  <option value={DocumentType.PRESCRIPTION} className="bg-white text-gray-900">Prescription</option>
                  <option value={DocumentType.MEDICAL_RECORD} className="bg-white text-gray-900">Medical Record</option>
                  <option value={DocumentType.IMAGING_REPORT} className="bg-white text-gray-900">Imaging Report</option>
                  <option value={DocumentType.DISCHARGE_SUMMARY} className="bg-white text-gray-900">Discharge Summary</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g. Blood test from March 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="inline-flex items-center px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading...
                  </>
                ) : (
                  'Upload'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Filter Documents</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            value={filters.status}
            onChange={(e) => { setFilters(prev => ({ ...prev, status: e.target.value })); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 text-sm"
            style={{ colorScheme: 'light' }}
          >
            <option value="" className="bg-white text-gray-900">All Status</option>
            <option value={DocumentStatus.UPLOADED} className="bg-white text-gray-900">Uploaded</option>
            <option value={DocumentStatus.PROCESSING} className="bg-white text-gray-900">Processing</option>
            <option value={DocumentStatus.PROCESSED} className="bg-white text-gray-900">Processed</option>
            <option value={DocumentStatus.FAILED} className="bg-white text-gray-900">Failed</option>
          </select>
          <select
            value={filters.document_type}
            onChange={(e) => { setFilters(prev => ({ ...prev, document_type: e.target.value })); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 text-sm"
            style={{ colorScheme: 'light' }}
          >
            <option value="" className="bg-white text-gray-900">All Types</option>
            <option value={DocumentType.LAB_REPORT} className="bg-white text-gray-900">Lab Report</option>
            <option value={DocumentType.PRESCRIPTION} className="bg-white text-gray-900">Prescription</option>
            <option value={DocumentType.MEDICAL_RECORD} className="bg-white text-gray-900">Medical Record</option>
            <option value={DocumentType.IMAGING_REPORT} className="bg-white text-gray-900">Imaging Report</option>
            <option value={DocumentType.DISCHARGE_SUMMARY} className="bg-white text-gray-900">Discharge Summary</option>
            <option value={DocumentType.OTHER} className="bg-white text-gray-900">Other</option>
          </select>
        </div>
        {(filters.status || filters.document_type) && (
          <button
            onClick={() => { setFilters({ status: '', document_type: '' }); setPage(1) }}
            className="mt-3 text-sm text-blue-600 hover:text-blue-800"
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex space-x-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-lg shadow text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📄</div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Documents Found</h4>
          <p className="text-gray-600">
            {Object.values(filters).some(f => f)
              ? 'Try adjusting your filters to see more documents.'
              : 'Upload your own records above, or documents uploaded by your clinic will appear here.'}
          </p>
        </div>
      ) : (
        <>
          {/* Clinic-uploaded documents */}
          {clinicDocs.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-lg">🏥</span>
                <h3 className="text-base font-medium text-gray-900">
                  Clinic Records ({clinicDocs.length})
                </h3>
                <span className="text-xs text-gray-500">Uploaded by your clinic staff</span>
              </div>
              <div className="divide-y divide-gray-100">
                {clinicDocs.map(doc => renderDocRow(doc, false))}
              </div>
            </div>
          )}

          {/* Patient-uploaded documents */}
          {patientDocs.length > 0 && (
            <div className="bg-white rounded-lg shadow border-l-4 border-purple-400">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-lg">📤</span>
                <h3 className="text-base font-medium text-gray-900">
                  My Uploads ({patientDocs.length})
                </h3>
                <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">Personal</span>
              </div>
              <div className="divide-y divide-gray-100">
                {patientDocs.map(doc => renderDocRow(doc, true))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Share with Clinic Modal */}
      {shareModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setShareModal(null)}
            />
            <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Share with Clinic</h3>
                <button onClick={() => setShareModal(null)} className="text-gray-400 hover:text-gray-500">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 p-3 bg-teal-50 rounded-lg border border-teal-100">
                <p className="text-sm text-teal-800">
                  Share <span className="font-semibold">{shareModal.original_filename || shareModal.filename}</span> with a clinic you are enrolled in. The clinic staff will be notified and can view this document.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Clinic</label>
                {enrolledClinics.length === 0 ? (
                  <p className="text-sm text-gray-500">You are not enrolled in any clinics. Go to "Find Clinics" to enroll first.</p>
                ) : (
                  <select
                    value={selectedClinicId}
                    onChange={(e) => setSelectedClinicId(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-gray-900 text-sm"
                    style={{ colorScheme: 'light' }}
                  >
                    <option value={0}>-- Choose a clinic --</option>
                    {enrolledClinics.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShareModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShareWithClinic}
                  disabled={!selectedClinicId || sharingDocId === shareModal.id}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {sharingDocId === shareModal.id ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sharing...
                    </span>
                  ) : (
                    'Share Document'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extracted Text Modal */}
      {viewingText && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setViewingText(null)}
            />
            <div className="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Extracted Text</h3>
                <button onClick={() => setViewingText(null)} className="text-gray-400 hover:text-gray-500">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-4 max-h-96 overflow-y-auto">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">{viewingText.text}</pre>
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
