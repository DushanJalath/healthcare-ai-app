import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import { User, UserRole } from '@/types'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

interface StaffFormData {
  email: string
  first_name: string
  last_name: string
  clinic_license: string
}

interface EditStaffFormData {
  email: string
  first_name: string
  last_name: string
}

export default function ClinicAdminStaffPage() {
  const { data: session } = useSession()
  const [staff, setStaff] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors }
  } = useForm<StaffFormData>({
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      clinic_license: ''
    }
  })

  const editForm = useForm<EditStaffFormData>({
    defaultValues: { email: '', first_name: '', last_name: '' }
  })

  useEffect(() => {
    const lic = session?.user?.clinicLicenseNumber
    if (lic) {
      setValue('clinic_license', lic)
    }
  }, [session?.user?.clinicLicenseNumber, setValue])

  useEffect(() => {
    if (editingUser) {
      editForm.reset({
        first_name: editingUser.first_name,
        last_name: editingUser.last_name,
        email: editingUser.email
      })
    }
  }, [editingUser, editForm])

  const fetchStaff = useCallback(async () => {
    if (!session?.accessToken) return
    try {
      setLoading(true)
      const res = await api.get<User[]>('/clinic/staff-members', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setStaff(res.data || [])
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to load staff')
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken])

  useEffect(() => {
    if (session?.accessToken) {
      fetchStaff()
    }
  }, [session?.accessToken, fetchStaff])

  const onRegisterStaff = async (data: StaffFormData) => {
    if (!session?.accessToken) {
      toast.error('Not signed in')
      return
    }
    try {
      setSubmitting(true)
      await api.post(
        '/clinic/staff',
        {
          email: data.email.trim(),
          first_name: data.first_name.trim(),
          last_name: data.last_name.trim(),
          clinic_license: data.clinic_license.trim()
        },
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      toast.success('Staff member created. They will receive login details by email.')
      reset({
        email: '',
        first_name: '',
        last_name: '',
        clinic_license: session?.user?.clinicLicenseNumber || ''
      })
      fetchStaff()
    } catch (e: any) {
      const d = e.response?.data?.detail
      toast.error(typeof d === 'string' ? d : 'Could not register staff')
    } finally {
      setSubmitting(false)
    }
  }

  const onSaveEdit = async (data: EditStaffFormData) => {
    if (!session?.accessToken || !editingUser) return
    try {
      setSavingEdit(true)
      await api.put(
        `/clinic/staff/${editingUser.id}`,
        {
          first_name: data.first_name.trim(),
          last_name: data.last_name.trim(),
          email: data.email.trim()
        },
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      toast.success('Staff member updated')
      setEditingUser(null)
      fetchStaff()
    } catch (e: any) {
      const d = e.response?.data?.detail
      toast.error(typeof d === 'string' ? d : 'Could not update staff')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteStaff = async (u: User) => {
    if (!session?.accessToken) return
    const ok = window.confirm(
      `Remove ${u.first_name} ${u.last_name} from the clinic? They will no longer be able to sign in.`
    )
    if (!ok) return
    try {
      await api.delete(`/clinic/staff/${u.id}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      toast.success('Staff member removed')
      fetchStaff()
    } catch (e: any) {
      const d = e.response?.data?.detail
      toast.error(typeof d === 'string' ? d : 'Could not remove staff')
    }
  }

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  if (loading && staff.length === 0) {
    return (
      <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN]}>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-600" />
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={[UserRole.CLINIC_ADMIN]}>
      <Head>
        <title>Clinic staff - Admin - MediKeep</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Clinic staff"
          subtitle="Register staff with your clinic license; they sign in at the clinic portal"
        />

        <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <Link href="/clinic/admin" className="text-medical-600 hover:text-medical-700 font-medium">
              ← Back to clinic admin
            </Link>
            <Link href="/clinic/users" className="text-medical-600 hover:text-medical-700 font-medium">
              View patients →
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Register clinic staff</h2>
            <p className="text-sm text-gray-600 mb-6">
              Only basic details are required. Enter your clinic license number so this account is tied to your clinic.
              A temporary password is emailed to the staff member; they use the same clinic sign-in page as everyone else.
            </p>

            <form onSubmit={handleSubmit(onRegisterStaff)} className="space-y-4 max-w-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                  <input
                    {...register('first_name', { required: 'Required' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                  />
                  {errors.first_name && <p className="text-sm text-red-600 mt-1">{errors.first_name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                  <input
                    {...register('last_name', { required: 'Required' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                  />
                  {errors.last_name && <p className="text-sm text-red-600 mt-1">{errors.last_name.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work email</label>
                <input
                  type="email"
                  {...register('email', { required: 'Required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                />
                {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic license number</label>
                <input
                  {...register('clinic_license', { required: 'Required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                  placeholder="Must match your clinic"
                />
                {errors.clinic_license && (
                  <p className="text-sm text-red-600 mt-1">{errors.clinic_license.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-medical-600 text-white rounded-md hover:bg-medical-700 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Create staff account'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Staff in your clinic</h2>
              <p className="text-sm text-gray-600 mt-1">{staff.length} staff member{staff.length !== 1 ? 's' : ''}</p>
            </div>
            {staff.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No staff yet. Add someone using the form above.</div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {staff.map((u) => (
                  <li
                    key={u.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">
                        {u.first_name} {u.last_name}
                      </p>
                      <p className="text-sm text-gray-600 truncate">{u.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <p className="text-sm text-gray-500">Added {formatDate(u.created_at)}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingUser(u)}
                          className="text-sm font-medium text-medical-600 hover:text-medical-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStaff(u)}
                          className="text-sm font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {editingUser && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setEditingUser(null)}
            >
              <div
                className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-staff-title"
              >
                <h3 id="edit-staff-title" className="text-lg font-semibold text-gray-900 mb-4">
                  Edit staff member
                </h3>
                <form onSubmit={editForm.handleSubmit(onSaveEdit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                    <input
                      {...editForm.register('first_name', { required: 'Required' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                    />
                    {editForm.formState.errors.first_name && (
                      <p className="text-sm text-red-600 mt-1">{editForm.formState.errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                    <input
                      {...editForm.register('last_name', { required: 'Required' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                    />
                    {editForm.formState.errors.last_name && (
                      <p className="text-sm text-red-600 mt-1">{editForm.formState.errors.last_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      {...editForm.register('email', { required: 'Required' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md [color-scheme:light] text-gray-900"
                    />
                    {editForm.formState.errors.email && (
                      <p className="text-sm text-red-600 mt-1">{editForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="px-4 py-2 text-sm font-medium text-white bg-medical-600 rounded-md hover:bg-medical-700 disabled:opacity-50"
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
