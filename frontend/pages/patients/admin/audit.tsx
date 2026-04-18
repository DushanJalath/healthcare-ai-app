import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import AuditLogViewer from '@/components/audit/AuditLogViewer'
import { UserRole } from '@/types'
import { Toaster } from 'react-hot-toast'

export default function AuditLogsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.CLINIC_ADMIN]}>
      <Head>
        <title>Audit Logs - MediKeep</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Audit Logs"
          subtitle="Track and monitor all system activities"
        />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-gray-700"
            >
              ← Back to Dashboard
            </Link>
          </div>
          <AuditLogViewer showFilters={true} />
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}