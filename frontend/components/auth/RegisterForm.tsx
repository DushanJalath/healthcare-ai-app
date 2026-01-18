import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/utils/api'
import { UserRole } from '@/types'

interface RegisterFormData {
  email: string
  password: string
  confirmPassword: string
  first_name: string
  last_name: string
  role: UserRole
  clinic_name?: string
  clinic_license?: string
}

export default function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<RegisterFormData>()

  const watchRole = watch('role')
  const watchPassword = watch('password')

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true)

    try {
      await api.post('/auth/register', {
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
        clinic_name: data.clinic_name,
        clinic_license: data.clinic_license
      })

      toast.success('Account created successfully! Please login.')
      router.push('/')
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Registration failed'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center mb-6">
            <Image
              src="/medikeep.png"
              alt="MediKeep Logo"
              width={120}
              height={120}
              className="object-contain"
              priority
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/" className="font-medium text-medical-600 hover:text-medical-700">
              Go to login
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  {...register('first_name', { required: 'First name is required' })}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
                />
                {errors.first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  {...register('last_name', { required: 'Last name is required' })}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
                />
                {errors.last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^\S+@\S+$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Account Type
              </label>
              <select
                {...register('role', { required: 'Role is required' })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
              >
                <option value="">Select role</option>
                <option value={UserRole.PATIENT}>Patient</option>
                <option value={UserRole.CLINIC_ADMIN}>Clinic Administrator</option>
                <option value={UserRole.CLINIC_STAFF}>Clinic Staff</option>
              </select>
              {errors.role && (
                <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
              )}
            </div>

            {watchRole === UserRole.CLINIC_ADMIN && (
              <>
                <div>
                  <label htmlFor="clinic_name" className="block text-sm font-medium text-gray-700">
                    Clinic Name
                  </label>
                  <input
                    {...register('clinic_name', { required: 'Clinic name is required' })}
                    type="text"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
                  />
                  {errors.clinic_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.clinic_name.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="clinic_license" className="block text-sm font-medium text-gray-700">
                    Clinic License Number
                  </label>
                  <input
                    {...register('clinic_license', { required: 'License number is required' })}
                    type="text"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
                  />
                  {errors.clinic_license && (
                    <p className="mt-1 text-sm text-red-600">{errors.clinic_license.message}</p>
                  )}
                </div>
              </>
            )}

            {watchRole === UserRole.CLINIC_STAFF && (
              <div>
                <label htmlFor="clinic_license" className="block text-sm font-medium text-gray-700">
                  Clinic License Number
                </label>
                <input
                  {...register('clinic_license', { required: 'Clinic license number is required' })}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
                  placeholder="Enter your clinic's license number"
                />
                {errors.clinic_license && (
                  <p className="mt-1 text-sm text-red-600">{errors.clinic_license.message}</p>
                )}
                <p className="mt-1 text-sm text-gray-500">
                  Enter the license number of the clinic you are joining.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  }
                })}
                type="password"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: value => value === watchPassword || 'Passwords do not match'
                })}
                type="password"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-medical-500 focus:border-medical-500"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-medical-600 hover:bg-medical-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-medical-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}