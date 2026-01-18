import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import api from '@/utils/api'
import toast, { Toaster } from 'react-hot-toast'

interface UserProfile {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
  is_verified: boolean
  created_at: string
}

export default function ProfilePage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Password change state
  const [changingPassword, setChangingPassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Password validation
  const validatePassword = (password: string) => {
    return {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      isValid: password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)
    }
  }

  const passwordValidation = validatePassword(newPassword)

  useEffect(() => {
    if (session?.accessToken) {
      fetchProfile()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken])

  const fetchProfile = async () => {
    if (!session?.accessToken) return

    try {
      const response = await api.get('/users/profile', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setProfile(response.data)
      setFirstName(response.data.first_name)
      setLastName(response.data.last_name)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.accessToken) return

    setUpdating(true)
    try {
      await api.put('/users/profile', 
        { first_name: firstName, last_name: lastName },
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      toast.success('Profile updated successfully!')
      fetchProfile()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update profile')
    } finally {
      setUpdating(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.accessToken) return

    // Validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (!passwordValidation.isValid) {
      toast.error('Please ensure your password meets all requirements')
      return
    }

    setChangingPassword(true)
    try {
      await api.post(
        '/users/change-password',
        { old_password: oldPassword, new_password: newPassword },
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      
      toast.success('Password changed successfully! Logging you out...')
      
      // Clear form
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      
      // Wait a moment for the toast to show, then logout
      setTimeout(async () => {
        // Clear session and redirect
        localStorage.removeItem('access_token')
        localStorage.removeItem('user')
        await signOut({ callbackUrl: '/' })
      }, 1500)
    } catch (error: any) {
      // Handle FastAPI validation errors (can be array or string)
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          // FastAPI validation errors are arrays
          const errorMessages = detail.map((err: any) => 
            `${err.loc?.join('.')}: ${err.msg}`
          ).join(', ')
          toast.error(`Validation error: ${errorMessages}`)
        } else if (typeof detail === 'string') {
          toast.error(detail)
        } else {
          toast.error('Failed to change password')
        }
      } else {
        toast.error('Failed to change password')
      }
    } finally {
      setChangingPassword(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!session?.accessToken || !deletePassword) {
      toast.error('Please enter your password')
      return
    }

    setDeleting(true)
    try {
      await api.delete('/users/account', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        data: { password: deletePassword }
      })
      
      toast.success('Account deleted successfully')
      
      // Clear session and redirect
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      await signOut({ callbackUrl: '/' })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete account')
    } finally {
      setDeleting(false)
      setDeletePassword('')
    }
  }

  const formatRole = (role: string) => {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Head>
        <title>Profile & Settings - MediKeep</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <Navbar 
          title="Profile & Settings" 
          subtitle="Manage your account settings"
        />

        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Profile Information */}
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Profile Information</h2>
              <p className="text-sm text-gray-500">Update your personal information</p>
            </div>
            
            <form onSubmit={handleUpdateProfile} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={profile?.email || ''}
                  disabled
                  className="mt-1 block w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500"
                />
                <p className="mt-1 text-xs text-gray-400">Email cannot be changed</p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Change Password</h2>
              <p className="text-sm text-gray-500">Update your account password</p>
            </div>
            
            <form onSubmit={handleChangePassword} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Current Password</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    newPassword && !passwordValidation.isValid
                      ? 'border-red-300'
                      : newPassword && passwordValidation.isValid
                      ? 'border-green-300'
                      : 'border-gray-300'
                  }`}
                  placeholder="Enter new password"
                />
                
                {newPassword && (
                  <div className="mt-2 space-y-1">
                    <div className={`flex items-center text-xs ${
                      passwordValidation.minLength ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      <span className={`mr-2 ${passwordValidation.minLength ? 'text-green-500' : 'text-gray-400'}`}>
                        {passwordValidation.minLength ? '✓' : '○'}
                      </span>
                      At least 8 characters
                    </div>
                    <div className={`flex items-center text-xs ${
                      passwordValidation.hasUpperCase ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      <span className={`mr-2 ${passwordValidation.hasUpperCase ? 'text-green-500' : 'text-gray-400'}`}>
                        {passwordValidation.hasUpperCase ? '✓' : '○'}
                      </span>
                      One uppercase letter (A-Z)
                    </div>
                    <div className={`flex items-center text-xs ${
                      passwordValidation.hasLowerCase ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      <span className={`mr-2 ${passwordValidation.hasLowerCase ? 'text-green-500' : 'text-gray-400'}`}>
                        {passwordValidation.hasLowerCase ? '✓' : '○'}
                      </span>
                      One lowercase letter (a-z)
                    </div>
                    <div className={`flex items-center text-xs ${
                      passwordValidation.hasNumber ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      <span className={`mr-2 ${passwordValidation.hasNumber ? 'text-green-500' : 'text-gray-400'}`}>
                        {passwordValidation.hasNumber ? '✓' : '○'}
                      </span>
                      One number (0-9)
                    </div>
                  </div>
                )}
                
                {!newPassword && (
                  <p className="mt-1 text-xs text-gray-500">
                    Password must contain at least 8 characters with uppercase, lowercase, and a number
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    confirmPassword && newPassword !== confirmPassword
                      ? 'border-red-300'
                      : confirmPassword && newPassword === confirmPassword && passwordValidation.isValid
                      ? 'border-green-300'
                      : 'border-gray-300'
                  }`}
                  placeholder="Confirm new password"
                />
                {confirmPassword && (
                  <div className="mt-1">
                    {newPassword === confirmPassword && passwordValidation.isValid ? (
                      <p className="text-xs text-green-600 flex items-center">
                        <span className="mr-1">✓</span>
                        Passwords match
                      </p>
                    ) : newPassword !== confirmPassword ? (
                      <p className="text-xs text-red-600 flex items-center">
                        <span className="mr-1">✗</span>
                        Passwords do not match
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">Enter password again to confirm</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={changingPassword || !passwordValidation.isValid || newPassword !== confirmPassword || !oldPassword || !newPassword || !confirmPassword}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingPassword ? 'Changing Password...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Account Information */}
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Account Information</h2>
            </div>
            
            <div className="px-6 py-4 space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Account Type</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatRole(profile?.role || '')}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Account Status</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  profile?.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {profile?.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Email Verified</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  profile?.is_verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {profile?.is_verified ? 'Verified' : 'Not Verified'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-600">Member Since</span>
                <span className="text-sm font-medium text-gray-900">
                  {profile?.created_at ? formatDate(profile.created_at) : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Danger Zone - Delete Account */}
          <div className="bg-white shadow rounded-lg border border-red-200">
            <div className="px-6 py-4 border-b border-red-200 bg-red-50">
              <h2 className="text-lg font-medium text-red-800">Danger Zone</h2>
              <p className="text-sm text-red-600">Irreversible and destructive actions</p>
            </div>
            
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Delete Account</h3>
                  <p className="text-sm text-gray-500">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Account Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Delete Account</h3>
              </div>
              
              <div className="px-6 py-4">
                <div className="mb-4 p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-800">
                    <strong>Warning:</strong> This action is permanent and cannot be undone. 
                    All your data, including your profile and associated records, will be permanently deleted.
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Enter your password to confirm
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Your password"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeletePassword('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting || !deletePassword}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}
