import React, { useState } from 'react'
import { useSession } from 'next-auth/react'
import FileUpload from './FileUpload'
import { Patient, DocumentType, FileUploadProgress } from '@/types'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface DocumentUploadProps {
  patients?: Patient[]
  selectedPatientId?: number
  onUploadComplete?: () => void
}

export default function DocumentUpload({ 
  patients = [], 
  selectedPatientId, 
  onUploadComplete 
}: DocumentUploadProps) {
  const { data: session } = useSession()
  const [selectedPatient, setSelectedPatient] = useState<number | undefined>(selectedPatientId)
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleUpload = async (
    files: File[], 
    metadata: { patient_id?: number; document_type?: DocumentType; notes?: string }
  ) => {
    setIsUploading(true)
    
    const uploads: FileUploadProgress[] = files.map(file => ({
      id: Math.random().toString(),
      file,
      progress: 0,
      status: 'pending'
    }))
    
    setUploadProgress(uploads)

    try {
      for (let i = 0; i < uploads.length; i++) {
        const upload = uploads[i]
        
        // Update status to uploading
        setUploadProgress(prev => prev.map(u => 
          u.id === upload.id ? { ...u, status: 'uploading' as const } : u
        ))

        const formData = new FormData()
        formData.append('file', upload.file)
        
        if (selectedPatient || metadata.patient_id) {
          formData.append('patient_id', String(selectedPatient || metadata.patient_id))
        }
        if (metadata.document_type) {
          formData.append('document_type', metadata.document_type)
        }
        if (metadata.notes) {
          formData.append('notes', metadata.notes)
        }

        try {
          await api.post('/documents/upload', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              'Authorization': `Bearer ${session?.accessToken}`
            },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                setUploadProgress(prev => prev.map(u => 
                  u.id === upload.id ? { ...u, progress } : u
                ))
              }
            }
          })

          // Success
          setUploadProgress(prev => prev.map(u => 
            u.id === upload.id ? { ...u, status: 'success' as const, progress: 100 } : u
          ))
          
        } catch (error: any) {
          // Error
          const errorMessage = error.response?.data?.detail || 'Upload failed'
          setUploadProgress(prev => prev.map(u => 
            u.id === upload.id ? { ...u, status: 'error' as const, error: errorMessage } : u
          ))
          toast.error(`Failed to upload ${upload.file.name}: ${errorMessage}`)
        }
      }

      // Check if all uploads were successful
      const allSuccess = uploadProgress.every(u => u.status === 'success')
      if (allSuccess) {
        toast.success('All files uploaded successfully!')
        onUploadComplete?.()
        setUploadProgress([])
      }

    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Patient Selection */}
      {patients.length > 0 && !selectedPatientId && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assign to Patient (Optional)
          </label>
          <select
            value={selectedPatient || ''}
            onChange={(e) => setSelectedPatient(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No assignment (can assign later)</option>
            {patients.map(patient => (
              <option key={patient.id} value={patient.id}>
                {patient.patient_id} - {patient.user_first_name || 'Unknown'} {patient.user_last_name || 'Patient'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* File Upload Component */}
      <FileUpload
        onUpload={handleUpload}
        patientId={selectedPatient}
        allowMultiple={true}
      />

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Upload Progress</h3>
          {uploadProgress.map(upload => (
            <div key={upload.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {upload.file.name}
                </span>
                <span className={`text-sm ${
                  upload.status === 'success' ? 'text-green-600' :
                  upload.status === 'error' ? 'text-red-600' :
                  'text-blue-600'
                }`}>
                  {upload.status === 'success' ? 'Complete' :
                   upload.status === 'error' ? 'Failed' :
                   upload.status === 'uploading' ? `${upload.progress}%` :
                   'Pending'}
                </span>
              </div>
              
              {upload.status === 'uploading' && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${upload.progress}%` }}
                  ></div>
                </div>
              )}
              
              {upload.error && (
                <p className="text-sm text-red-600 mt-1">{upload.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}