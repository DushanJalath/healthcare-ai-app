import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { DocumentType } from '@/types'
import toast from 'react-hot-toast'

interface FileUploadProps {
  onUpload: (files: File[], metadata: { patient_id?: number; document_type?: DocumentType; notes?: string }) => void
  patientId?: number
  allowMultiple?: boolean
  maxSize?: number
}

export default function FileUpload({ 
  onUpload, 
  patientId, 
  allowMultiple = true, 
  maxSize = 10 * 1024 * 1024 // 10MB
}: FileUploadProps) {
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.OTHER)
  const [notes, setNotes] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      rejectedFiles.forEach(({ file, errors }) => {
        errors.forEach((error: any) => {
          if (error.code === 'file-too-large') {
            toast.error(`File ${file.name} is too large`)
          } else if (error.code === 'file-invalid-type') {
            toast.error(`File ${file.name} has invalid type`)
          } else {
            toast.error(`Error with file ${file.name}`)
          }
        })
      })
    }

    if (acceptedFiles.length > 0) {
      if (allowMultiple) {
        setSelectedFiles(prev => [...prev, ...acceptedFiles])
      } else {
        setSelectedFiles(acceptedFiles)
      }
      toast.success(`${acceptedFiles.length} file(s) selected. Click "Upload Files" to proceed.`)
    }
  }, [allowMultiple])

  const handleUpload = () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select files to upload')
      return
    }

    onUpload(selectedFiles, { 
      patient_id: patientId, 
      document_type: documentType, 
      notes: notes.trim() || undefined 
    })
    
    // Clear selected files after upload starts
    setSelectedFiles([])
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp']
    },
    multiple: allowMultiple,
    maxSize
  })

  return (
    <div className="space-y-6">
      {/* Upload Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Document Type
          </label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as DocumentType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={DocumentType.OTHER}>Other</option>
            <option value={DocumentType.LAB_REPORT}>Lab Report</option>
            <option value={DocumentType.PRESCRIPTION}>Prescription</option>
            <option value={DocumentType.MEDICAL_RECORD}>Medical Record</option>
            <option value={DocumentType.IMAGING_REPORT}>Imaging Report</option>
            <option value={DocumentType.DISCHARGE_SUMMARY}>Discharge Summary</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes about this document"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}
          ${isDragReject ? 'border-red-400 bg-red-50' : ''}
          hover:border-blue-400 hover:bg-blue-50
        `}
      >
        <input {...getInputProps()} />
        
        <div className="space-y-4">
          <div className="text-4xl text-gray-400">
            📁
          </div>
          
          {isDragActive ? (
            <p className="text-blue-600 font-medium">
              Drop the files here...
            </p>
          ) : (
            <div>
              <p className="text-gray-600 font-medium">
                Drag & drop files here, or click to select
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Supports PDF, JPG, PNG, GIF, TIFF, BMP (max {Math.round(maxSize / 1024 / 1024)}MB each)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">
            Selected Files ({selectedFiles.length})
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-white p-3 rounded border border-gray-200">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <span className="text-lg">📄</span>
                  <span className="text-sm text-gray-700 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveFile(index)
                  }}
                  className="ml-3 text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Button */}
      {selectedFiles.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium transition-colors"
          >
            Upload Files ({selectedFiles.length})
          </button>
        </div>
      )}
    </div>
  )
}