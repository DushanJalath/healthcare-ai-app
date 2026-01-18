import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import Link from 'next/link'
import Image from 'next/image'
import { UserRole } from '@/types'

interface LoginFormData {
  email: string
  password: string
}

interface LoginFormProps {
  userType?: 'clinic' | 'patient'
}

export default function LoginForm({ userType }: LoginFormProps = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>()

  const getRedirectPathForRole = (role: string) => {
    if (role === UserRole.PATIENT) return '/patients/dashboard'
    if (role === UserRole.CLINIC_ADMIN || role === UserRole.CLINIC_STAFF) return '/clinic/dashboard'
    if (role === UserRole.ADMIN) return '/dashboard'
    return '/'
  }

  const getTitle = () => {
    if (userType === 'clinic') return 'Clinic Sign In'
    if (userType === 'patient') return 'Patient Sign In'
    return 'Sign in to your account'
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false
      })

      if (result?.error) {
        toast.error('Invalid email or password')
      } else {
        toast.success('Login successful!')

        // Get the session to determine user role
        const session = await getSession()
        if (session?.user?.role) {
          router.push(getRedirectPathForRole(session.user.role))
        } else {
          // Fallback based on userType prop or default
          if (userType === 'clinic') {
            router.push('/clinic/dashboard')
          } else if (userType === 'patient') {
            router.push('/patients/dashboard')
          } else {
            router.push('/dashboard')
          }
        }
      }
    } catch (error) {
      toast.error('Login failed. Please try again.')
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
              width={200}
              height={200}
              className="object-contain"
              priority
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {getTitle()}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link href="/register" className="font-medium text-medical-600 hover:text-medical-700">
              create a new account
            </Link>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
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
                autoComplete="email"
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-medical-500 focus:border-medical-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="sr-only">
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
                autoComplete="current-password"
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-medical-500 focus:border-medical-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-medical-600 hover:bg-medical-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-medical-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}