import React, { useState, useEffect } from 'react'
import { DocumentType, DocumentStatus, Patient } from '@/types'

interface DocumentSearchProps {
  onFiltersChange: (filters: any) => void
  patients?: Patient[]
}

export default function DocumentSearch({ onFiltersChange, patients = [] }: DocumentSearchProps) {
  const [filters, setFilters] = useState({
    query: '',
    document_type: '',
    status: '',
    patient_id: '',
    date_from: '',
    date_to: ''
  })

  useEffect(() => {
    // Debounce filter changes
    const timeoutId = setTimeout(() => {
      const activeFilters = Object.entries(filters)
        .filter(([key, value]) => value !== '')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
      
      onFiltersChange(activeFilters)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [filters, onFiltersChange])

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      query: '',
      document_type: '',
      status: '',
      patient_id: '',
      date_from: '',
      date_to: ''
    })
  }

  const hasActiveFilters = Object.values(filters).some(value => value !== '')

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">Search & Filter</h3>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Text Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            type="text"
            value={filters.query}
            onChange={(e) => handleFilterChange('query', e.target.value)}
            placeholder="Search filenames, notes..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Document Type Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Document Type
          </label>
          <select
            value={filters.document_type}
            onChange={(e) => handleFilterChange('document_type', e.target.value)}
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

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value={DocumentStatus.UPLOADED}>Uploaded</option>
            <option value={DocumentStatus.PROCESSING}>Processing</option>
            <option value={DocumentStatus.PROCESSED}>Processed</option>
            <option value={DocumentStatus.FAILED}>Failed</option>
          </select>
        </div>

        {/* Patient Filter */}
        {patients.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patient
            </label>
            <select
              value={filters.patient_id}
              onChange={(e) => handleFilterChange('patient_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Patients</option>
              {patients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {patient.patient_id} - {patient.user_first_name} {patient.user_last_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date From */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            From Date
          </label>
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => handleFilterChange('date_from', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            To Date
          </label>
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => handleFilterChange('date_to', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            {Object.entries(filters)
              .filter(([key, value]) => value !== '')
              .map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {key.replace('_', ' ')}: {value}
                  <button
                    onClick={() => handleFilterChange(key, '')}
                    className="ml-1 hover:text-blue-600"
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}