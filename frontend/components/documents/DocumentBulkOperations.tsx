import React, { useState } from 'react'
import { Patient, DocumentType, DocumentStatus } from '@/types'

interface DocumentBulkOperationsProps {
  selectedCount: number
  onBulkOperation: (operation: string, parameters?: any) => void
  patients?: Patient[]
}

export default function DocumentBulkOperations({
  selectedCount,
  onBulkOperation,
  patients = []
}: DocumentBulkOperationsProps) {
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState('')
  const [updateType, setUpdateType] = useState('')
  const [updateStatus, setUpdateStatus] = useState('')

  const handleAssignToPatient = () => {
    if (!selectedPatient) return
    
    onBulkOperation('assign', { patient_id: parseInt(selectedPatient) })
    setShowAssignModal(false)
    setSelectedPatient('')
  }

  const handleUpdateDocuments = () => {
    const parameters: any = {}
    if (updateType) parameters.document_type = updateType
    if (updateStatus) parameters.status = updateStatus
    
    if (Object.keys(parameters).length === 0) return
    
    onBulkOperation('update', parameters)
    setShowUpdateModal(false)
    setUpdateType('')
    setUpdateStatus('')
  }

  const handleDeleteSelected = () => {
    if (confirm(`Are you sure you want to delete ${selectedCount} documents? This action cannot be undone.`)) {
      onBulkOperation('delete')
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-blue-900">
          {selectedCount} document{selectedCount !== 1 ? 's' : ''} selected
        </div>
        
        <div className="flex space-x-2">
          {patients.length > 0 && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Assign to Patient
            </button>
          )}
          
          <button
            onClick={() => setShowUpdateModal(true)}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            Update
          </button>
          
          <button
            onClick={handleDeleteSelected}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Assign {selectedCount} Documents to Patient
            </h3>
            
            <select
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
            >
              <option value="">Select Patient</option>
              {patients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {patient.patient_id} - {patient.user_first_name} {patient.user_last_name}
                </option>
              ))}
            </select>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignToPatient}
                disabled={!selectedPatient}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Update {selectedCount} Documents
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type
                </label>
                <select
                  value={updateType}
                  onChange={(e) => setUpdateType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Don't Change</option>
                  <option value={DocumentType.LAB_REPORT}>Lab Report</option>
                  <option value={DocumentType.PRESCRIPTION}>Prescription</option>
                  <option value={DocumentType.MEDICAL_RECORD}>Medical Record</option>
                  <option value={DocumentType.IMAGING_REPORT}>Imaging Report</option>
                  <option value={DocumentType.DISCHARGE_SUMMARY}>Discharge Summary</option>
                  <option value={DocumentType.OTHER}>Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Don't Change</option>
                  <option value={DocumentStatus.UPLOADED}>Uploaded</option>
                  <option value={DocumentStatus.PROCESSING}>Processing</option>
                  <option value={DocumentStatus.PROCESSED}>Processed</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateDocuments}
                disabled={!updateType && !updateStatus}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}