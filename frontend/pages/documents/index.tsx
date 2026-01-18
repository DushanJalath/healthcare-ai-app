import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
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
        {/* Header */}
        <div className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Document Management</h1>
                <p className="mt-2 text-gray-600">
                  Securely manage and analyze medical documents
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                <Link
                  href="/dashboard"
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <DocumentManager />
        </div>
      </div>
      
      <Toaster position="top-right" />
    </ProtectedRoute>
  )
}