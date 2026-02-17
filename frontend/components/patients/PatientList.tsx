import React, { useState } from 'react'
import { Patient, Gender } from '@/types'
import Link from 'next/link'

interface PatientListProps {
  patients: Patient[]
  loading?: boolean
  onEdit?: (patient: Patient) => void
  onDelete?: (patientId: number) => void
  onViewDocuments?: (patientId: number) => void
  showActions?: boolean
}

export default function PatientList({
  patients,
  loading = false,
  onEdit,
  onDelete,
  onViewDocuments,
  showActions = true
}: PatientListProps) {
  const [sortField, setSortField] = useState<keyof Patient>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: keyof Patient) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedPatients = [...patients].sort((a, b) => {
    const aValue = a[sortField]
    const bValue = b[sortField]
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  const calculateAge = (dateOfBirth?: string) => {
    if (!dateOfBirth) return 'N/A'
    
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    
    return age
  }

  const formatGender = (gender?: Gender) => {
    if (!gender) return 'Not specified'
    
    const genderMap = {
      [Gender.MALE]: 'Male',
      [Gender.FEMALE]: 'Female',
      [Gender.OTHER]: 'Other',
      [Gender.PREFER_NOT_TO_SAY]: 'Prefer not to say'
    }
    
    return genderMap[gender] || 'Not specified'
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg overflow-hidden">
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
      </div>
    )
  }

  if (patients.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-8">
          <div className="text-gray-400 text-6xl mb-4">👤</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No patients found</h3>
          <p className="text-gray-600 mb-4">Get started by adding your first patient</p>
          {showActions && (
            <Link
              href="/patients/create"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add First Patient
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('patient_id')}
              >
                <div className="flex items-center gap-1">
                  Patient ID
                  {sortField === 'patient_id' && (
                    <span className="text-blue-600">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Age
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Gender
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Phone
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Documents
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center gap-1">
                  Created
                  {sortField === 'created_at' && (
                    <span className="text-blue-600">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
              {showActions && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedPatients.map((patient) => (
              <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {patient.patient_id}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {patient.user_first_name && patient.user_last_name
                        ? `${patient.user_first_name} ${patient.user_last_name}`
                        : 'No user linked'}
                    </div>
                    {patient.user_email && (
                      <div className="text-xs text-gray-500 mt-1">
                        {patient.user_email}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  {calculateAge(patient.date_of_birth)}
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  {formatGender(patient.gender)}
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  {patient.phone || 'Not provided'}
                </td>
                <td className="px-4 py-4">
                  <button
                    onClick={() => onViewDocuments?.(patient.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                  >
                    {patient.documents_count || 0} docs
                  </button>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                  {new Date(patient.created_at).toLocaleDateString()}
                </td>
                {showActions && (
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/patients/${patient.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        View
                      </Link>
                      {onEdit && (
                        <button
                          onClick={() => onEdit(patient)}
                          className="text-green-600 hover:text-green-800 font-medium transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {onViewDocuments && (
                        <button
                          onClick={() => onViewDocuments(patient.id)}
                          className="text-purple-600 hover:text-purple-800 font-medium transition-colors"
                        >
                          Documents
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(patient.id)}
                          className="text-red-600 hover:text-red-800 font-medium transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}