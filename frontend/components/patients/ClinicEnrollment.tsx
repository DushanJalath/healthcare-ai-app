import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { ClinicListItem } from '@/types'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface EnrollForm {
  date_of_birth: string
  gender: string
  phone: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  medical_history: string
  allergies: string
  current_medications: string
  notes: string
}

const INITIAL_FORM: EnrollForm = {
  date_of_birth: '',
  gender: '',
  phone: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  medical_history: '',
  allergies: '',
  current_medications: '',
  notes: '',
}

export default function ClinicEnrollment() {
  const { data: session } = useSession()
  const [clinics, setClinics] = useState<ClinicListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [enrollingId, setEnrollingId] = useState<number | null>(null)
  const [unenrollingId, setUnenrollingId] = useState<number | null>(null)
  const [showEnrollModal, setShowEnrollModal] = useState<ClinicListItem | null>(null)
  const [form, setForm] = useState<EnrollForm>(INITIAL_FORM)
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EnrollForm, string>>>({})

  useEffect(() => {
    fetchClinics()
  }, [session?.accessToken])

  const fetchClinics = async () => {
    if (!session?.accessToken) return
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search.trim()) params.append('search', search.trim())
      const response = await api.get(`/clinic-enrollment/clinics?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      setClinics(response.data.clinics)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load clinics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClinics()
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof EnrollForm, string>> = {}
    if (!form.date_of_birth) errors.date_of_birth = 'Date of birth is required'
    if (!form.gender) errors.gender = 'Gender is required'
    if (!form.phone.trim()) errors.phone = 'Phone number is required'
    if (!form.address.trim()) errors.address = 'Address is required'
    if (!form.emergency_contact_name.trim()) errors.emergency_contact_name = 'Emergency contact name is required'
    if (!form.emergency_contact_phone.trim()) errors.emergency_contact_phone = 'Emergency contact phone is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleEnroll = async () => {
    if (!session?.accessToken || !showEnrollModal) return
    if (!validateForm()) {
      toast.error('Please fill in all required fields')
      return
    }
    try {
      setEnrollingId(showEnrollModal.id)
      await api.post(
        `/clinic-enrollment/clinics/${showEnrollModal.id}/enroll`,
        {
          date_of_birth: form.date_of_birth,
          gender: form.gender,
          phone: form.phone.trim(),
          address: form.address.trim(),
          emergency_contact_name: form.emergency_contact_name.trim(),
          emergency_contact_phone: form.emergency_contact_phone.trim(),
          medical_history: form.medical_history.trim() || null,
          allergies: form.allergies.trim() || null,
          current_medications: form.current_medications.trim() || null,
          notes: form.notes.trim() || null,
        },
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      toast.success(`Successfully enrolled in ${showEnrollModal.name}`)
      setShowEnrollModal(null)
      setForm(INITIAL_FORM)
      setFormErrors({})
      fetchClinics()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to enroll')
    } finally {
      setEnrollingId(null)
    }
  }

  const handleUnenroll = async (clinic: ClinicListItem) => {
    if (!session?.accessToken) return
    if (!confirm(`Are you sure you want to leave ${clinic.name}?`)) return
    try {
      setUnenrollingId(clinic.id)
      await api.post(
        `/clinic-enrollment/clinics/${clinic.id}/unenroll`,
        {},
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      toast.success(`Left ${clinic.name}`)
      fetchClinics()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to unenroll')
    } finally {
      setUnenrollingId(null)
    }
  }

  const formatClinicType = (type: string | null) => {
    if (!type) return null
    return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const updateField = (field: keyof EnrollForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
    }
  }

  const inputClass = (field: keyof EnrollForm) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 ${
      formErrors[field] ? 'border-red-400' : 'border-gray-300'
    }`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Find &amp; Join Clinics</h3>
            <p className="text-sm text-gray-500 mt-1">
              Browse available clinics and enroll to receive care and share your records.
            </p>
          </div>
          <div className="flex-shrink-0 w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clinics by name..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Clinics Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
              <div className="h-9 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      ) : clinics.length === 0 ? (
        <div className="bg-white rounded-lg shadow text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🏥</div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Clinics Found</h4>
          <p className="text-gray-600">
            {search ? 'Try a different search term.' : 'No clinics are available at the moment.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clinics.map((clinic) => (
            <div
              key={clinic.id}
              className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 ${
                clinic.is_enrolled ? 'border-l-4 border-green-500' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-gray-900 truncate">{clinic.name}</h4>
                  {clinic.clinic_type && (
                    <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {formatClinicType(clinic.clinic_type)}
                    </span>
                  )}
                </div>
                {clinic.is_enrolled && (
                  <span className="flex-shrink-0 ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Enrolled
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-sm text-gray-600 mb-4">
                {clinic.address && (
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="line-clamp-2">{clinic.address}</span>
                  </div>
                )}
                {clinic.phone && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{clinic.phone}</span>
                  </div>
                )}
                {clinic.email && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{clinic.email}</span>
                  </div>
                )}
              </div>

              {clinic.is_enrolled ? (
                <button
                  onClick={() => handleUnenroll(clinic)}
                  disabled={unenrollingId === clinic.id}
                  className="w-full px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {unenrollingId === clinic.id ? 'Leaving...' : 'Leave Clinic'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowEnrollModal(clinic)
                    setForm(INITIAL_FORM)
                    setFormErrors({})
                  }}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Enroll Now
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Enrollment Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setShowEnrollModal(null)}
            />
            <div className="inline-block w-full max-w-2xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Enroll in {showEnrollModal.name}
                </h3>
                <button
                  onClick={() => setShowEnrollModal(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-5 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-800">
                  Please fill in your details below. This information will be shared with the clinic for your care.
                  Fields marked with <span className="text-red-500 font-bold">*</span> are required.
                </p>
              </div>

              {/* Basic Information */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 pb-1 border-b border-gray-200">Basic Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Date of Birth <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={form.date_of_birth}
                      onChange={(e) => updateField('date_of_birth', e.target.value)}
                      className={inputClass('date_of_birth')}
                      style={{ colorScheme: 'light' }}
                    />
                    {formErrors.date_of_birth && <p className="text-xs text-red-500 mt-0.5">{formErrors.date_of_birth}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Gender <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.gender}
                      onChange={(e) => updateField('gender', e.target.value)}
                      className={inputClass('gender')}
                      style={{ colorScheme: 'light' }}
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                    {formErrors.gender && <p className="text-xs text-red-500 mt-0.5">{formErrors.gender}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      placeholder="e.g. +94 77 123 4567"
                      className={inputClass('phone')}
                    />
                    {formErrors.phone && <p className="text-xs text-red-500 mt-0.5">{formErrors.phone}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Address <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="Your full address"
                      rows={2}
                      className={inputClass('address')}
                    />
                    {formErrors.address && <p className="text-xs text-red-500 mt-0.5">{formErrors.address}</p>}
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 pb-1 border-b border-gray-200">Emergency Contact</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Contact Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.emergency_contact_name}
                      onChange={(e) => updateField('emergency_contact_name', e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className={inputClass('emergency_contact_name')}
                    />
                    {formErrors.emergency_contact_name && <p className="text-xs text-red-500 mt-0.5">{formErrors.emergency_contact_name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Contact Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={form.emergency_contact_phone}
                      onChange={(e) => updateField('emergency_contact_phone', e.target.value)}
                      placeholder="e.g. +94 77 987 6543"
                      className={inputClass('emergency_contact_phone')}
                    />
                    {formErrors.emergency_contact_phone && <p className="text-xs text-red-500 mt-0.5">{formErrors.emergency_contact_phone}</p>}
                  </div>
                </div>
              </div>

              {/* Medical Information */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 pb-1 border-b border-gray-200">Medical Information</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Medical History</label>
                    <textarea
                      value={form.medical_history}
                      onChange={(e) => updateField('medical_history', e.target.value)}
                      placeholder="Previous illnesses, surgeries, conditions..."
                      rows={2}
                      className={inputClass('medical_history')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Allergies</label>
                    <textarea
                      value={form.allergies}
                      onChange={(e) => updateField('allergies', e.target.value)}
                      placeholder="Known allergies to medications, food, etc."
                      rows={2}
                      className={inputClass('allergies')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Current Medications</label>
                    <textarea
                      value={form.current_medications}
                      onChange={(e) => updateField('current_medications', e.target.value)}
                      placeholder="Medications you are currently taking..."
                      rows={2}
                      className={inputClass('current_medications')}
                    />
                  </div>
                </div>
              </div>

              {/* Enrollment Notes */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 pb-1 border-b border-gray-200">Enrollment Details</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="e.g. Referred by Dr. Smith, reason for visit..."
                    rows={2}
                    className={inputClass('notes')}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowEnrollModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnroll}
                  disabled={enrollingId === showEnrollModal.id}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {enrollingId === showEnrollModal.id ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enrolling...
                    </span>
                  ) : (
                    'Confirm Enrollment'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
