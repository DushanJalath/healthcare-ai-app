import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import Navbar from '@/components/layout/Navbar'
import DocumentManager from '@/components/documents/DocumentManager'
import { UserRole } from '@/types'
import { Toaster } from 'react-hot-toast'

export default function DocumentsPage() {
  const { data: session } = useSession()

  return (
    <ProtectedRoute>
      <Head>
        <title>Document Management - MediKeep</title>
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        <Navbar
          title="Document Management"
          subtitle="Securely manage and analyze medical documents"
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
          <DocumentManager />
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}