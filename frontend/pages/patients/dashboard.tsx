import { useSession } from 'next-auth/react'
import Head from 'next/head'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import PatientDashboard from '@/components/patients/PatientDashboard'
import { UserRole } from '@/types'
import { Toaster } from 'react-hot-toast'

export default function PatientDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.PATIENT]}>
      <Head>
        <title>My Dashboard - MediKeep</title>
      </Head>
      
      <PatientDashboard />
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}