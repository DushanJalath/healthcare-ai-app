import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { PublicShareLinkResponse, PublicSharedDocument } from '@/types'
import api from '@/utils/api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function SharedMedicalRecordsPage() {
  const router = useRouter()
  const { token } = router.query

  const [data, setData] = useState<PublicShareLinkResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || typeof token !== 'string') return

    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await api.get<PublicShareLinkResponse>(`/share/${token}`)
        setData(response.data)
        setError(null)
      } catch (err: any) {
        const message =
          err.response?.data?.detail ||
          'This share link is invalid or has expired.'
        setError(message)
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [token])

  const buildFileUrl = (doc: PublicSharedDocument) => {
    return `${API_BASE_URL}${doc.file_url}`
  }

  const title = 'Shared Medical Documents'

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 md:p-8">
          <div className="mb-6 border-b border-gray-200 pb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-600 mt-1">
                This page shows medical documents shared securely by a patient.
              </p>
            </div>
          </div>

          {loading && (
            <div className="py-12 text-center text-gray-600">
              Loading shared documents...
            </div>
          )}

          {!loading && error && (
            <div className="py-12 text-center">
              <p className="text-red-600 font-medium mb-2">Unable to load documents</p>
              <p className="text-gray-600 text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm text-gray-800">
                  <span className="font-semibold">Patient:</span>{' '}
                  {data.patient_first_name || data.patient_last_name
                    ? `${data.patient_first_name || ''} ${data.patient_last_name || ''}`.trim()
                    : data.patient_identifier || 'Unknown'}
                </p>
                <p className="text-sm text-gray-800 mt-1">
                  <span className="font-semibold">Link expires at:</span>{' '}
                  {new Date(data.expires_at).toLocaleString()}
                </p>
              </div>

              {data.documents.length === 0 ? (
                <div className="py-10 text-center text-gray-600">
                  No medical documents are available to display.
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">
                    Medical Documents ({data.documents.length})
                  </h2>
                  <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
                    {data.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-col md:flex-row md:items-center justify-between px-4 py-3 hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 text-sm">
                            {doc.original_filename}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {doc.document_type
                              ? doc.document_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
                              : 'Document'}
                            {' • '}
                            {new Date(doc.upload_date).toLocaleDateString()}
                            {' • '}
                            {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <div className="mt-3 md:mt-0 md:ml-4">
                          <button
                            onClick={() => window.open(buildFileUrl(doc), '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

