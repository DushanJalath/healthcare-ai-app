import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Document, Patient, DocumentType, DocumentStatus, UserRole } from '@/types'
import DocumentUpload from './DocumentUpload'
import DocumentList from './DocumentList'
import DocumentSearch from './DocumentSearch'
import DocumentAnalytics from './DocumentAnalytics'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface DocumentManagerProps {
  patientId?: number
}

export default function DocumentManager({ patientId }: DocumentManagerProps) {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<'list' | 'upload' | 'analytics'>('list')
  const [documents, setDocuments] = useState<Document[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [searchFilters, setSearchFilters] = useState({})
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    byStatus: {},
    byType: {},
    storageUsed: 0
  })

  const isClinicUser = session?.user?.role === UserRole.CLINIC_ADMIN || 
                     session?.user?.role === UserRole.CLINIC_STAFF

  useEffect(() => {
    fetchDocuments()
    if (isClinicUser) {
      fetchPatients()
      fetchStats()
    }
  }, [session, refreshTrigger, searchFilters])

  const fetchDocuments = async () => {
    if (!session?.accessToken) return
    
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: '1',
        per_page: '100',
        ...searchFilters
      })
      
      if (patientId) {
        params.append('patient_id', patientId.toString())
      }

      const response = await api.get(`/documents?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })

      setDocuments(response.data.documents)
    } catch (error) {
      toast.error('Failed to fetch documents')
    } finally {
      setLoading(false)
    }
  }

  const fetchPatients = async () => {
    try {
      const response = await api.get('/patients', {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      setPatients(response.data.patients)
    } catch (error) {
      console.error('Failed to fetch patients')
    }
  }

  const fetchStats = async () => {
    try {
      const response = await api.get('/documents/analytics', {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      setStats(response.data)
    } catch (error) {
      console.error('Failed to fetch stats')
    }
  }

  const handleUploadComplete = () => {
    setActiveTab('list')
    setRefreshTrigger(prev => prev + 1)
    // Toast is already shown in DocumentUpload component
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'list'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Documents ({stats.total})
          </button>
          
          {isClinicUser && (
            <>
              <button
                onClick={() => setActiveTab('upload')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'upload'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Upload
              </button>
              
              <button
                onClick={() => setActiveTab('analytics')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'analytics'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Analytics
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' && (
        <div className="space-y-6">
          {/* Search and Filters */}
          <DocumentSearch 
            onFiltersChange={setSearchFilters}
            patients={patients}
          />

          {/* Document List */}
          <DocumentList
            documents={documents}
            patients={patients}
            onRefresh={() => setRefreshTrigger(prev => prev + 1)}
            loading={loading}
          />
        </div>
      )}

      {activeTab === 'upload' && isClinicUser && (
        <DocumentUpload
          patients={patients}
          selectedPatientId={patientId}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {activeTab === 'analytics' && isClinicUser && (
        <DocumentAnalytics stats={stats} />
      )}
    </div>
  )
}