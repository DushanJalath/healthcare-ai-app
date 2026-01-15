import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Patient, Gender } from '@/types'
import toast from 'react-hot-toast'

interface PatientFormProps {
  patient?: Patient
  onSubmit: (data: any) => void
  onCancel?: () => void
  loading?: boolean
}

interface PatientFormData {
  patient_id: string
  date_of_birth: string
  gender: Gender | ''
  phone: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  medical_history: string
  allergies: string
  current_medications: string
}

export default function PatientForm({ patient, onSubmit, onCancel, loading = false }: PatientFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<PatientFormData>({
    defaultValues: patient ? {
      patient_id: patient.patient_id,
      date_of_birth: patient.date_of_birth ? new Date(patient.date_of_birth).toISOString().split('T')[0] : '',
      gender: patient.gender || '',
      phone: patient.phone || '',
      address: patient.address || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      medical_history: patient.medical_history || '',
      allergies: patient.allergies || '',
      current_medications: patient.current_medications || ''
    } : {
      patient_id: '',
      date_of_birth: '',
      gender: '',
      phone: '',
      address: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      medical_history: '',
      allergies: '',
      current_medications: ''
    }
  })

  const handleFormSubmit = (data: PatientFormData) => {
    // Transform data for API
    const submitData = {
      ...data,
      gender: data.gender || null,
      date_of_birth: data.date_of_birth || null,
      // Remove empty strings
      phone: data.phone || null,
      address: data.address || null,
      emergency_contact_name: data.emergency_contact_name || null,
      emergency_contact_phone: data.emergency_contact_phone || null,
      medical_history: data.medical_history || null,
      allergies: data.allergies || null,
      current_medications: data.current_medications || null
    }
    onSubmit(submitData)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Basic Information */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Patient ID *
            </label>
            <input
              {...register('patient_id', {
                required: 'Patient ID is required',
                pattern: {
                  value: /^[a-zA-Z0-9._-]+$/,
                  message: 'Only letters, numbers, dots, dashes and underscores allowed'
                },
                maxLength: {
                  value: 20,
                  message: 'Patient ID must be 20 characters or less'
                }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., P001, PAT-2024-001"
            />
            {errors.patient_id && (
              <p className="mt-1 text-sm text-red-600">{errors.patient_id.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              {...register('date_of_birth')}
              type="date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gender
            </label>
            <select
              {...register('gender')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select gender</option>
              <option value={Gender.MALE}>Male</option>
              <option value={Gender.FEMALE}>Female</option>
              <option value={Gender.OTHER}>Other</option>
              <option value={Gender.PREFER_NOT_TO_SAY}>Prefer not to say</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              {...register('phone', {
                pattern: {
                  value: /^[\+]?[\d\s\-\(\)]+$/,
                  message: 'Invalid phone number format'
                }
              })}
              type="tel"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+1 (555) 123-4567"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
            )}
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Address
          </label>
          <textarea
            {...register('address')}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Patient's address"
          />
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Emergency Contact</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name
            </label>
            <input
              {...register('emergency_contact_name')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Emergency contact name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Phone
            </label>
            <input
              {...register('emergency_contact_phone', {
                pattern: {
                  value: /^[\+]?[\d\s\-\(\)]+$/,
                  message: 'Invalid phone number format'
                }
              })}
              type="tel"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+1 (555) 123-4567"
            />
            {errors.emergency_contact_phone && (
              <p className="mt-1 text-sm text-red-600">{errors.emergency_contact_phone.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Medical Information */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Medical Information</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Medical History
            </label>
            <textarea
              {...register('medical_history')}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Relevant medical history, past surgeries, chronic conditions, etc."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Known Allergies
            </label>
            <textarea
              {...register('allergies')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Food allergies, drug allergies, environmental allergies, etc."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Medications
            </label>
            <textarea
              {...register('current_medications')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Current medications, dosages, and frequency"
            />
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : patient ? 'Update Patient' : 'Create Patient'}
        </button>
      </div>
    </form>
  )
}