import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import { Clinic, UserRole } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

const CLINIC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not specified' },
  { value: 'general_medicine', label: 'General medicine' },
  { value: 'paediatric', label: 'Paediatric' },
  { value: 'obstetrics_gynaecology', label: 'Obstetrics & gynaecology' },
  { value: 'specialized_medical', label: 'Specialized medical' },
  { value: 'surgical', label: 'Surgical' }
]

interface ClinicDetailsForm {
  name: string
  license_number: string
  email: string
  phone: string
  address: string
  clinic_type: string
}

export default function ClinicAdminDetailsPage() {
  const { data: session, update } = useSession()
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingClinic, setSavingClinic] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<ClinicDetailsForm>({
    defaultValues: {
      name: '',
      license_number: '',
      email: '',
      phone: '',
      address: '',
      clinic_type: ''
    }
  })

  const fetchProfile = useCallback(async () => {
    if (!session?.accessToken) return
    try {
      setLoading(true)
      const res = await api.get<Clinic>('/clinic/profile', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setClinic(res.data)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to load clinic profile')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken])

  useEffect(() => {
    if (session?.accessToken) {
      fetchProfile()
    }
  }, [session?.accessToken, fetchProfile])

  useEffect(() => {
    if (!clinic) return
    reset({
      name: clinic.name,
      license_number: clinic.license_number,
      email: clinic.email || '',
      phone: clinic.phone || '',
      address: clinic.address || '',
      clinic_type: clinic.clinic_type || ''
    })
  }, [clinic, reset])

  const onSaveClinicDetails = async (data: ClinicDetailsForm) => {
    if (!session?.accessToken) return
    try {
      setSavingClinic(true)
      const payload: Record<string, unknown> = {
        name: data.name.trim(),
        license_number: data.license_number.trim(),
        email: data.email.trim() || null,
        phone: data.phone.trim() || null,
        address: data.address.trim() || null
      }
      if (data.clinic_type) {
        payload.clinic_type = data.clinic_type
      } else {
        payload.clinic_type = null
      }

      const res = await api.put<Clinic>('/clinic/profile', payload, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setClinic(res.data)
      await update({
        clinicLicenseNumber: res.data.license_number,
        clinicName: res.data.name
      })
      toast.success('Clinic details saved')
    } catch (error: any) {
      const d = error.response?.data?.detail
      toast.error(typeof d === 'string' ? d : 'Could not save clinic details')
    } finally {
      setSavingClinic(false)
    }
  }

  if (loading && !clinic) {
    return (
      <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN]}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN]}>
      <Head>
        <title>Clinic details - MediKeep</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Clinic details"
          subtitle="Edit your clinic name, license, and contact information"
        />

        <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <Link href="/clinic/admin" className="text-medical-600 hover:text-medical-700 font-medium text-sm mb-6 inline-block">
            ← Back to clinic admin
          </Link>

          <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
            <div className="flex items-start gap-3 mb-6">
              <span className="text-3xl flex-shrink-0" aria-hidden>
                📋
              </span>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Clinic details</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Edit your clinic name, license number, and contact information. Updating the license applies to new
                  registrations; existing staff and patients stay linked to your clinic.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSaveClinicDetails)} className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic name</label>
                <input
                  {...register('name', { required: 'Required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                />
                {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic license number</label>
                <input
                  {...register('license_number', { required: 'Required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                />
                {errors.license_number && (
                  <p className="text-sm text-red-600 mt-1">{errors.license_number.message}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Must stay unique across all clinics. Share this code with new staff or patients who register with your
                  clinic.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic contact email</label>
                <input
                  type="email"
                  {...register('email')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  {...register('phone')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  rows={3}
                  {...register('address')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic type</label>
                <select
                  {...register('clinic_type')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900 bg-white"
                >
                  {CLINIC_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={savingClinic}
                className="px-4 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700 disabled:opacity-50"
              >
                {savingClinic ? 'Saving…' : 'Save clinic details'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
