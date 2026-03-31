import React, { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Patient, Document, DocumentType, DocumentStatus, ShareLinkCreateResponse } from '@/types'
import PatientStats from './PatientStats'
import PatientTimeline from './PatientTimeline'
import PatientDocuments from './PatientDocuments'
import ClinicEnrollment from './ClinicEnrollment'
import MediKeepChatWidget from './MediKeepChatWidget'
import PremiumHealthChart from './PremiumHealthChart'
import AuditLogViewer from '@/components/audit/AuditLogViewer'
import Navbar from '@/components/layout/Navbar'
import DocumentExplanationsModal from '@/components/documents/DocumentExplanationsModal'
import { usePremiumSubscription } from '@/hooks/usePremiumSubscription'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface ShareLinkItem {
  id: number
  token: string
  expires_at: string
  created_at: string
  revoked: boolean
  revoked_at: string | null
  view_count: number
  document_ids: string | null
  is_expired: boolean
  status: 'active' | 'expired' | 'revoked'
}

interface PatientDashboardData {
  patient_profile: Patient
  stats: {
    total_documents: number
    recent_documents: number
    processed_documents: number
    pending_documents: number
    storage_used: number
    last_upload: string | null
    document_types: Record<string, number>
  }
  recent_documents: Document[]
  timeline_events: Array<{
    date: string
    type: string
    title: string
    description: string
    icon: string
    color: string
    metadata?: any
  }>
}

type PatientTab =
  | 'overview'
  | 'health_trends'
  | 'documents'
  | 'timeline'
  | 'profile'
  | 'share'
  | 'access'
  | 'medications'
  | 'clinics'

export default function PatientDashboard() {
  const { data: session } = useSession()
  const router = useRouter()
  const userKey = session?.user?.email ?? ''
  const { isPremium, plan } = usePremiumSubscription(userKey)
  const [premiumTabApplied, setPremiumTabApplied] = useState(false)
  const [dashboardData, setDashboardData] = useState<PatientDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<PatientTab>('overview')
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null)
  const [isGeneratingShare, setIsGeneratingShare] = useState(false)
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [hasPaidForShare, setHasPaidForShare] = useState(false)
  const [shareDocuments, setShareDocuments] = useState<Document[]>([])
  const [shareDocumentsLoading, setShareDocumentsLoading] = useState(false)
  const [selectedShareDocumentIds, setSelectedShareDocumentIds] = useState<number[]>([])
  const [shareExpiryHours, setShareExpiryHours] = useState<number>(24)
  const [myShareLinks, setMyShareLinks] = useState<ShareLinkItem[]>([])
  const [myShareLinksLoading, setMyShareLinksLoading] = useState(false)
  const [myShareLinksTotal, setMyShareLinksTotal] = useState(0)
  const [myShareLinksPage, setMyShareLinksPage] = useState(1)
  const [revokingLinkId, setRevokingLinkId] = useState<number | null>(null)
  const [deletingLinkId, setDeletingLinkId] = useState<number | null>(null)
  const [medicationHistory, setMedicationHistory] = useState<any>(null)
  const [medicationHistoryLoading, setMedicationHistoryLoading] = useState(false)
  const [rxExplanationsModal, setRxExplanationsModal] = useState<{
    documentId: number
    loading: boolean
    summary: string
    explanations: string[]
    error: string | null
  } | null>(null)
  const [historyEntries, setHistoryEntries] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showHistoryForm, setShowHistoryForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<any | null>(null)
  const [historyForm, setHistoryForm] = useState({
    title: '',
    condition: '',
    description: '',
    medications: '',
    treating_doctor: '',
    clinic_name: '',
    start_date: '',
    end_date: '',
    status: 'resolved' as 'ongoing' | 'resolved' | 'chronic',
  })
  const [savingEntry, setSavingEntry] = useState(false)

  const storageKey = (key: string) => (userKey ? `${key}_${userKey}` : key)

  useEffect(() => {
    fetchDashboardData()
  }, [session?.accessToken, selectedClinicId])

  useEffect(() => {
    setPremiumTabApplied(false)
  }, [userKey])

  useEffect(() => {
    if (!isPremium || premiumTabApplied) return
    setActiveTab('health_trends')
    setPremiumTabApplied(true)
  }, [isPremium, premiumTabApplied])

  // Reset share state when user changes, then restore from per-user localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !userKey) return

    // Reset in-memory state first
    setHasPaidForShare(false)
    setShareLink(null)
    setShareExpiresAt(null)
    setCardName('')
    setCardNumber('')
    setCardExpiry('')
    setCardCvv('')
    setSelectedShareDocumentIds([])

    const paymentExpiresAt = localStorage.getItem(storageKey('share_payment_expires_at'))
    if (paymentExpiresAt) {
      const paymentExpiryDate = new Date(paymentExpiresAt)
      if (paymentExpiryDate > new Date()) {
        setHasPaidForShare(true)
      } else {
        localStorage.removeItem(storageKey('share_payment_expires_at'))
        localStorage.removeItem(storageKey('share_last_link'))
        localStorage.removeItem(storageKey('share_last_link_expires_at'))
      }
    }

    const storedLink = localStorage.getItem(storageKey('share_last_link'))
    const storedLinkExpiresAt = localStorage.getItem(storageKey('share_last_link_expires_at'))
    if (storedLink && storedLinkExpiresAt) {
      const linkExpiryDate = new Date(storedLinkExpiresAt)
      if (linkExpiryDate > new Date()) {
        setShareLink(storedLink)
        setShareExpiresAt(storedLinkExpiresAt)
      } else {
        localStorage.removeItem(storageKey('share_last_link'))
        localStorage.removeItem(storageKey('share_last_link_expires_at'))
      }
    }
  }, [userKey])

  useEffect(() => {
    if (activeTab === 'share') {
      fetchShareDocuments()
    }
  }, [activeTab, session?.accessToken])

  useEffect(() => {
    if (activeTab === 'access') {
      fetchMyShareLinks()
    }
  }, [activeTab, session?.accessToken, myShareLinksPage])

  useEffect(() => {
    if (activeTab === 'medications') {
      if (!medicationHistory) fetchMedicationHistory()
      fetchHistoryEntries()
    }
  }, [activeTab, session?.accessToken])

  // Helper function to clear session and redirect to landing page
  const clearSessionAndRedirect = async () => {
    // Clear localStorage
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')

    // Sign out from NextAuth session and redirect to landing page
    await signOut({ redirect: false })
    router.push('/')
  }

  const fetchDashboardData = async () => {
    if (!session?.accessToken) return

    try {
      const params = new URLSearchParams()
      if (selectedClinicId) {
        params.append('clinic_id', selectedClinicId.toString())
      }
      const queryString = params.toString()
      const url = `/patient-dashboard/${queryString ? '?' + queryString : ''}`
      const response = await api.get(url, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setDashboardData(response.data)
    } catch (error: any) {
      const status = error.response?.status

      // If patient profile not found (404) or access denied (403), clear session and redirect
      if (status === 404 || status === 403) {
        toast.error('Patient profile not found. Redirecting to home page...')
        await clearSessionAndRedirect()
        return
      }

      toast.error(error.response?.data?.detail || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const fetchShareDocuments = async () => {
    if (!session?.accessToken) return

    try {
      setShareDocumentsLoading(true)
      const params = new URLSearchParams({
        page: '1',
        per_page: '50'
      })

      const response = await api.get(`/patient-dashboard/documents?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })

      setShareDocuments(response.data)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load documents for sharing')
    } finally {
      setShareDocumentsLoading(false)
    }
  }

  const handleGenerateShareLink = async (documentIds: number[]) => {
    if (!dashboardData) return
    if (!documentIds.length) {
      toast.error('Please select at least one document to share')
      return
    }
    try {
      setIsGeneratingShare(true)
      const response = await api.post<ShareLinkCreateResponse>(
        '/share/generate',
        { document_ids: documentIds, expires_in_hours: shareExpiryHours },
        {
          headers: { Authorization: `Bearer ${session?.accessToken}` }
        }
      )
      const { token, expires_at } = response.data
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const url = `${origin}/share/${token}`
      setShareLink(url)
      setShareExpiresAt(expires_at)

      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey('share_last_link'), url)
        localStorage.setItem(storageKey('share_last_link_expires_at'), expires_at as unknown as string)
      }

      const label = shareExpiryHours >= 24 ? `${shareExpiryHours / 24} day` : `${shareExpiryHours} hour`
      toast.success(`Share link generated (valid for ${label}${shareExpiryHours > 24 || (shareExpiryHours < 24 && shareExpiryHours > 1) ? 's' : ''})`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to generate share link')
    } finally {
      setIsGeneratingShare(false)
    }
  }

  const handlePayAndShare = async (event: React.FormEvent) => {
    event.preventDefault()

    // Very basic front-end validation (no real payment processing)
    if (!cardName || !cardNumber || !cardExpiry || !cardCvv) {
      toast.error('Please fill in all card details')
      return
    }

    try {
      setIsProcessingPayment(true)
      // Simulate payment processing delay
      await new Promise((resolve) => setTimeout(resolve, 1500))
      toast.success('Payment of Rs 100 successful')
      setHasPaidForShare(true)

      if (typeof window !== 'undefined') {
        const paymentExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        localStorage.setItem(storageKey('share_payment_expires_at'), paymentExpiry)
      }
    } catch (error) {
      toast.error('Unable to process payment')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  const fetchMyShareLinks = async () => {
    if (!session?.accessToken) return
    try {
      setMyShareLinksLoading(true)
      const params = new URLSearchParams({
        page: myShareLinksPage.toString(),
        per_page: '10'
      })
      const response = await api.get(`/share/my/links?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setMyShareLinks(response.data.links)
      setMyShareLinksTotal(response.data.total)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load share links')
    } finally {
      setMyShareLinksLoading(false)
    }
  }

  const handleRevokeShareLink = async (linkId: number) => {
    if (!session?.accessToken) return
    try {
      setRevokingLinkId(linkId)
      await api.patch(`/share/my/links/${linkId}/revoke`, {}, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      toast.success('Share link revoked successfully')
      fetchMyShareLinks()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to revoke share link')
    } finally {
      setRevokingLinkId(null)
    }
  }

  const handleDeleteShareLink = async (linkId: number) => {
    if (!session?.accessToken) return
    if (!confirm('Are you sure you want to permanently delete this share link?')) return
    try {
      setDeletingLinkId(linkId)
      await api.delete(`/share/my/links/${linkId}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      toast.success('Share link deleted')
      fetchMyShareLinks()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete share link')
    } finally {
      setDeletingLinkId(null)
    }
  }

  const fetchMedicationHistory = async () => {
    if (!session?.accessToken) return
    try {
      setMedicationHistoryLoading(true)
      const response = await api.get('/patient-dashboard/medication-history', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setMedicationHistory(response.data)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load medication history')
    } finally {
      setMedicationHistoryLoading(false)
    }
  }

  const fetchHistoryEntries = async () => {
    if (!session?.accessToken) return
    try {
      setHistoryLoading(true)
      const response = await api.get('/medical-history/my', {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      setHistoryEntries(response.data.entries)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load medical history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const resetHistoryForm = () => {
    setHistoryForm({
      title: '', condition: '', description: '', medications: '',
      treating_doctor: '', clinic_name: '', start_date: '', end_date: '', status: 'resolved',
    })
    setEditingEntry(null)
    setShowHistoryForm(false)
  }

  const openEditForm = (entry: any) => {
    setHistoryForm({
      title: entry.title || '',
      condition: entry.condition || '',
      description: entry.description || '',
      medications: entry.medications || '',
      treating_doctor: entry.treating_doctor || '',
      clinic_name: entry.clinic_name || '',
      start_date: entry.start_date || '',
      end_date: entry.end_date || '',
      status: entry.status || 'resolved',
    })
    setEditingEntry(entry)
    setShowHistoryForm(true)
  }

  const handleSaveHistoryEntry = async () => {
    if (!session?.accessToken) return
    if (!historyForm.title.trim() || !historyForm.start_date) {
      toast.error('Title and start date are required')
      return
    }
    try {
      setSavingEntry(true)
      const payload: any = {
        title: historyForm.title,
        condition: historyForm.condition || null,
        description: historyForm.description || null,
        medications: historyForm.medications || null,
        treating_doctor: historyForm.treating_doctor || null,
        clinic_name: historyForm.clinic_name || null,
        start_date: historyForm.start_date,
        end_date: historyForm.end_date || null,
        status: historyForm.status,
      }

      if (editingEntry) {
        await api.put(`/medical-history/my/${editingEntry.id}`, payload, {
          headers: { Authorization: `Bearer ${session.accessToken}` }
        })
        toast.success('Medical history entry updated')
      } else {
        await api.post('/medical-history/my', payload, {
          headers: { Authorization: `Bearer ${session.accessToken}` }
        })
        toast.success('Medical history entry added')
      }
      resetHistoryForm()
      fetchHistoryEntries()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save entry')
    } finally {
      setSavingEntry(false)
    }
  }

  const handleDeleteHistoryEntry = async (entryId: number) => {
    if (!session?.accessToken) return
    if (!confirm('Are you sure you want to delete this entry?')) return
    try {
      await api.delete(`/medical-history/my/${entryId}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      toast.success('Entry deleted')
      fetchHistoryEntries()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete entry')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handlePrescriptionExplanations = async (documentId: number) => {
    setRxExplanationsModal({
      documentId,
      loading: true,
      summary: '',
      explanations: [],
      error: null
    })
    try {
      const response = await api.get(`/documents/${documentId}/explanations`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` }
      })
      if (response.data.status === 'processing') {
        toast('Text extraction is still in progress. Please try again later.', { icon: 'ℹ️' })
        setRxExplanationsModal(null)
        return
      }
      if (response.data.status === 'not_available') {
        toast.error('No extracted text available for this document.')
        setRxExplanationsModal(null)
        return
      }
      setRxExplanationsModal({
        documentId,
        loading: false,
        summary: response.data.summary || '',
        explanations: Array.isArray(response.data.explanations) ? response.data.explanations : [],
        error: null
      })
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Failed to load explanations.'
      setRxExplanationsModal({
        documentId,
        loading: false,
        summary: '',
        explanations: [],
        error: typeof detail === 'string' ? detail : 'Failed to load explanations.'
      })
    }
  }

  const handleCopyRxExplanations = () => {
    if (!rxExplanationsModal || rxExplanationsModal.loading || rxExplanationsModal.error) return
    const lines = [
      'Summary',
      rxExplanationsModal.summary,
      '',
      'Explanations',
      ...rxExplanationsModal.explanations.map((e) => `• ${e}`)
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Copied to clipboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard Unavailable</h2>
          <p className="text-gray-600 mt-2">Unable to load your dashboard data</p>
          <button
            onClick={fetchDashboardData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Get clinic list with IDs for selector
  const clinics = dashboardData?.patient_profile.clinic_ids && dashboardData?.patient_profile.clinic_names
    ? dashboardData.patient_profile.clinic_ids.map((id, index) => ({
        id,
        name: dashboardData.patient_profile.clinic_names?.[index] || `Clinic ${id}`
      }))
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Profile Dropdown */}
      <Navbar
        title="My Health Dashboard"
        subtitle={`Patient ID: ${dashboardData.patient_profile.patient_id}`}
        clinics={clinics}
        selectedClinicId={selectedClinicId}
        onClinicChange={setSelectedClinicId}
        patientPremium={
          isPremium ? { variant: 'active' } : { variant: 'cta', href: '/patients/premium' }
        }
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div
          className={`rounded-lg shadow p-4 sm:p-6 text-white mb-6 sm:mb-8 ${
            isPremium
              ? 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-700'
              : 'bg-gradient-to-r from-blue-500 to-purple-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl sm:text-2xl font-bold truncate">
                  Welcome, {dashboardData.patient_profile.user_first_name}!
                </h2>
                {isPremium && (
                  <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
                    Premium{plan === 'annual' ? ' · Annual' : plan === 'monthly' ? ' · Monthly' : ''}
                  </span>
                )}
              </div>
              <p className="mt-1 sm:mt-2 opacity-90 text-sm sm:text-base">
                {isPremium
                  ? 'Your premium dashboard: health trends, records, and assistant with premium model labels.'
                  : "Here's an overview of your medical documents and health records"}
              </p>
            </div>
            <div className="text-4xl sm:text-6xl opacity-20 flex-shrink-0 ml-3">
              {isPremium ? '✨' : '🏥'}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <PatientStats stats={dashboardData.stats} />

        {/* Tab Navigation */}
        <div className="mb-6 -mx-4 sm:mx-0">
          <nav className="flex overflow-x-auto gap-x-4 sm:gap-x-6 border-b border-gray-200 px-4 sm:px-0 scrollbar-hide">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('health_trends')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'health_trends'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Health trends{!isPremium ? ' · Premium' : ''}
            </button>
            <button
              onClick={() => setActiveTab('clinics')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'clinics'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Find Clinics
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'documents'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Records ({dashboardData.stats.total_documents})
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'timeline'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setActiveTab('medications')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'medications'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Medications
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'profile'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab('share')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'share'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Share
            </button>
            <button
              onClick={() => setActiveTab('access')}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === 'access'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              Activity
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Documents */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Documents</h3>
              <div className="space-y-4">
                {dashboardData.recent_documents.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 border-b pb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{doc.original_filename}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(doc.upload_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${doc.status === DocumentStatus.PROCESSED
                      ? 'bg-green-100 text-green-800'
                      : doc.status === DocumentStatus.PROCESSING
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                      }`}>
                      {doc.status}
                    </span>
                  </div>
                ))}
                {dashboardData.recent_documents.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No documents yet</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={() => setActiveTab('documents')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">📄</div>
                    <div>
                      <div className="font-medium">View All Documents</div>
                      <div className="text-sm text-gray-500">Browse your medical records</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('timeline')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">📅</div>
                    <div>
                      <div className="font-medium">View Timeline</div>
                      <div className="text-sm text-gray-500">See your medical history</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('clinics')}
                  className="w-full text-left p-3 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">🏥</div>
                    <div>
                      <div className="font-medium text-gray-700">Find &amp; Join Clinics</div>
                      <div className="text-sm text-gray-500">Browse clinics and enroll for care</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('profile')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">👤</div>
                    <div>
                      <div className="font-medium">Update Profile</div>
                      <div className="text-sm text-gray-500">Manage your information</div>
                    </div>
                  </div>
                </button>

                <button
                onClick={() => setActiveTab('share')}
                className="w-full text-left p-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">🔗</div>
                    <div>
                      <div className="font-medium text-gray-600">Share Documents</div>
                      <div className="text-sm text-gray-600">
                      Pay Rs 100 and generate a secure time-limited share link
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {shareLink && (
                <div className="mt-4 p-3 rounded-lg border border-dashed border-blue-500 bg-blue-100">
                  <p className="text-sm font-medium text-blue-900 mb-2">Your share link</p>
                  <div className="flex flex-col space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareLink}
                        className="flex-1 min-w-0 px-2 py-1 text-xs border border-blue-400 rounded-md bg-white text-gray-900"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareLink)
                          toast.success('Link copied to clipboard')
                        }}
                        className="px-2 py-1 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 flex-shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                    {shareExpiresAt && (
                      <p className="text-xs text-gray-600">
                        Expires at:{' '}
                        {new Date(shareExpiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'health_trends' && (
          <div className="space-y-6">
            {isPremium ? (
              <>
                <PremiumHealthChart />
                <div className="bg-white rounded-lg shadow p-6 border border-violet-100">
                  <h3 className="text-md font-medium text-gray-900 mb-2">What you can define</h3>
                  <p className="text-sm text-gray-600">
                    Use the metric dropdown on the chart to focus on one type of result (for example blood glucose,
                    blood pressure, heart rate, or weight). Values shown are demo data; connect real devices or lab
                    imports in a future release.
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow p-8 text-center border border-amber-100">
                <p className="text-lg font-semibold text-gray-900 mb-2">Health trends are a Premium feature</p>
                <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                  See one health metric over time such as blood sugar and switch between metrics. Subscribe to unlock
                  this tab and the premium assistant options in chat.
                </p>
                <Link
                  href="/patients/premium"
                  className="inline-flex items-center rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow hover:from-amber-600 hover:to-orange-700"
                >
                  View plans
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'clinics' && (
          <ClinicEnrollment />
        )}

        {activeTab === 'documents' && (
          <div className="space-y-6">
          
            {/* Documents with filters, download, extracted text */}
            <PatientDocuments />
          </div>
        )}

        {activeTab === 'timeline' && (
          <PatientTimeline events={dashboardData.timeline_events} />
        )}

        {activeTab === 'medications' && (
          <div className="space-y-6">
            {/* Current Medications from profile */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Medication History</h3>
              <p className="text-sm text-gray-500 mb-6">
                Your current medications and prescription documents from all clinics.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">Current Medications</h4>
                  <p className="text-sm text-gray-800 whitespace-pre-line">
                    {dashboardData.patient_profile.current_medications || 'No current medications recorded'}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <h4 className="text-sm font-semibold text-red-800 mb-2">Known Allergies</h4>
                  <p className="text-sm text-gray-800 whitespace-pre-line">
                    {dashboardData.patient_profile.allergies || 'No allergies recorded'}
                  </p>
                </div>
              </div>
            </div>

            {/* Medical History Timeline (LinkedIn-style) */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <div>
                    <h4 className="text-md font-semibold text-gray-900">Sickness &amp; Treatment History</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Track your medical episodes, treatments, and medications over time</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { resetHistoryForm(); setShowHistoryForm(true) }}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 self-start sm:self-auto flex-shrink-0"
                  >
                    + Add Entry
                  </button>
                </div>
              </div>

              {/* Add / Edit Form */}
              {showHistoryForm && (
                <div className="px-6 py-5 border-b border-gray-200 bg-blue-50">
                  <h5 className="text-sm font-semibold text-gray-900 mb-3">
                    {editingEntry ? 'Edit Entry' : 'Add New Medical History Entry'}
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                      <input
                        type="text" value={historyForm.title}
                        onChange={(e) => setHistoryForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Flu Treatment, Diabetes Management"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Condition / Diagnosis</label>
                      <input
                        type="text" value={historyForm.condition}
                        onChange={(e) => setHistoryForm(f => ({ ...f, condition: e.target.value }))}
                        placeholder="e.g. Influenza, Type 2 Diabetes"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Medications Prescribed</label>
                      <textarea
                        value={historyForm.medications}
                        onChange={(e) => setHistoryForm(f => ({ ...f, medications: e.target.value }))}
                        placeholder="e.g. Paracetamol 500mg twice daily, Amoxicillin 250mg 3 times daily"
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Description / Notes</label>
                      <textarea
                        value={historyForm.description}
                        onChange={(e) => setHistoryForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Additional details about the treatment..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Treating Doctor</label>
                      <input
                        type="text" value={historyForm.treating_doctor}
                        onChange={(e) => setHistoryForm(f => ({ ...f, treating_doctor: e.target.value }))}
                        placeholder="Dr. Smith"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Clinic / Hospital</label>
                      <input
                        type="text" value={historyForm.clinic_name}
                        onChange={(e) => setHistoryForm(f => ({ ...f, clinic_name: e.target.value }))}
                        placeholder="City General Hospital"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
                      <input
                        type="date" value={historyForm.start_date}
                        onChange={(e) => setHistoryForm(f => ({ ...f, start_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                        style={{ colorScheme: 'light' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                      <input
                        type="date" value={historyForm.end_date}
                        onChange={(e) => setHistoryForm(f => ({ ...f, end_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                        style={{ colorScheme: 'light' }}
                        disabled={historyForm.status === 'ongoing'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={historyForm.status}
                        onChange={(e) => {
                          const val = e.target.value as 'ongoing' | 'resolved' | 'chronic'
                          setHistoryForm(f => ({ ...f, status: val, end_date: val === 'ongoing' ? '' : f.end_date }))
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
                        style={{ colorScheme: 'light' }}
                      >
                        <option value="resolved">Resolved</option>
                        <option value="ongoing">Ongoing</option>
                        <option value="chronic">Chronic</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 mt-4">
                    <button
                      type="button"
                      onClick={handleSaveHistoryEntry}
                      disabled={savingEntry}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingEntry ? 'Saving...' : editingEntry ? 'Update Entry' : 'Save Entry'}
                    </button>
                    <button
                      type="button"
                      onClick={resetHistoryForm}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline entries */}
              {historyLoading ? (
                <div className="p-6">
                  <div className="animate-pulse space-y-6">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex space-x-4">
                        <div className="w-3 h-3 bg-gray-300 rounded-full mt-1.5" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-1/2" />
                          <div className="h-3 bg-gray-200 rounded w-3/4" />
                          <div className="h-3 bg-gray-200 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-5xl mb-3">🩺</div>
                  <h4 className="text-lg font-medium text-gray-900 mb-1">No Medical History Entries</h4>
                  <p className="text-sm text-gray-500 mb-4">
                    Start building your medical history by adding your past treatments and conditions.
                  </p>
                  <button
                    type="button"
                    onClick={() => { resetHistoryForm(); setShowHistoryForm(true) }}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    + Add Your First Entry
                  </button>
                </div>
              ) : (
                <div className="relative px-6 py-4">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[2.15rem] top-4 bottom-4 w-0.5 bg-gray-200" />

                  <div className="space-y-6">
                    {historyEntries.map((entry: any) => (
                      <div key={entry.id} className="relative flex gap-4">
                        {/* Timeline dot */}
                        <div className={`relative z-10 flex-shrink-0 w-3 h-3 mt-1.5 rounded-full border-2 ${
                          entry.status === 'ongoing' ? 'bg-green-500 border-green-300' :
                          entry.status === 'chronic' ? 'bg-orange-500 border-orange-300' :
                          'bg-blue-500 border-blue-300'
                        }`} />

                        {/* Card */}
                        <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="text-sm font-semibold text-gray-900">{entry.title}</h5>
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                  entry.status === 'ongoing' ? 'bg-green-100 text-green-800' :
                                  entry.status === 'chronic' ? 'bg-orange-100 text-orange-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                                </span>
                              </div>

                              {entry.condition && (
                                <p className="text-xs text-gray-600 mt-0.5">
                                  Diagnosis: {entry.condition}
                                </p>
                              )}

                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(entry.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                {' - '}
                                {entry.end_date
                                  ? new Date(entry.end_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                  : 'Present'}
                              </p>

                              {(entry.clinic_name || entry.treating_doctor) && (
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                                  {entry.clinic_name && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                      {entry.clinic_name}
                                    </span>
                                  )}
                                  {entry.treating_doctor && (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                      {entry.treating_doctor}
                                    </span>
                                  )}
                                </div>
                              )}

                              {entry.medications && (
                                <div className="mt-2 p-2 bg-green-50 rounded border border-green-100">
                                  <p className="text-xs font-medium text-green-800 mb-0.5">Medications</p>
                                  <p className="text-xs text-gray-700 whitespace-pre-line">{entry.medications}</p>
                                </div>
                              )}

                              {entry.description && (
                                <p className="mt-2 text-xs text-gray-600 whitespace-pre-line">{entry.description}</p>
                              )}

                              {entry.created_by_name && (
                                <p className="mt-2 text-xs text-gray-400">
                                  Added by: {entry.created_by_name} on {new Date(entry.created_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex-shrink-0 flex items-center space-x-1 ml-2">
                              <button
                                type="button"
                                onClick={() => openEditForm(entry)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                                title="Edit"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteHistoryEntry(entry.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Prescription Documents */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                  <div>
                    <h4 className="text-md font-semibold text-gray-900">Prescription Documents</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Prescriptions uploaded across all your clinics, with extracted text</p>
                  </div>
                  {medicationHistory && (
                    <span className="text-sm text-gray-500 flex-shrink-0">{medicationHistory.total_prescriptions} prescription{medicationHistory.total_prescriptions !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>

              {medicationHistoryLoading ? (
                <div className="p-6">
                  <div className="animate-pulse space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 bg-gray-200 rounded" />
                    ))}
                  </div>
                </div>
              ) : !medicationHistory || medicationHistory.prescriptions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-5xl mb-3">💊</div>
                  <h4 className="text-lg font-medium text-gray-900 mb-1">No Prescriptions Found</h4>
                  <p className="text-sm text-gray-500">
                    No prescription documents have been uploaded to your records yet.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {medicationHistory.prescriptions.map((rx: any) => (
                    <div key={rx.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">💊</span>
                            <p className="text-sm font-medium text-gray-900">{rx.original_filename}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 ml-7 sm:ml-7">
                            <span>{new Date(rx.upload_date).toLocaleDateString()}</span>
                            <span>{formatFileSize(rx.file_size)}</span>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              rx.status === 'processed' ? 'bg-green-100 text-green-800' :
                              rx.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {rx.status}
                            </span>
                            {rx.extraction_date && (
                              <span className="text-gray-400">
                                Extracted: {new Date(rx.extraction_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {rx.status === 'processed' && (
                            <div className="ml-7 mt-2">
                              <button
                                type="button"
                                onClick={() => handlePrescriptionExplanations(rx.id)}
                                className="text-xs font-medium text-medical-600 hover:text-medical-800"
                              >
                                View explanations
                              </button>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Patient Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Patient ID</label>
                <p className="mt-1 text-sm text-gray-900">{dashboardData.patient_profile.patient_id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                <p className="mt-1 text-sm text-gray-900">
                  {dashboardData.patient_profile.date_of_birth
                    ? new Date(dashboardData.patient_profile.date_of_birth).toLocaleDateString()
                    : 'Not provided'
                  }
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <p className="mt-1 text-sm text-gray-900">{dashboardData.patient_profile.phone || 'Not provided'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Emergency Contact</label>
                <p className="mt-1 text-sm text-gray-900">
                  {dashboardData.patient_profile.emergency_contact_name || 'Not provided'}
                </p>
              </div>
            </div>
            
            {/* Medical Information */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-md font-semibold text-gray-900 mb-3">Medical Information</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medical History</label>
                  <div className="text-sm text-gray-900 bg-gray-50 px-4 py-3 rounded-md border border-gray-200 whitespace-pre-line min-h-[40px]">
                    {dashboardData.patient_profile.medical_history || 'No medical history recorded'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                  <div className="text-sm text-gray-900 bg-red-50 px-4 py-3 rounded-md border border-red-100 whitespace-pre-line min-h-[40px]">
                    {dashboardData.patient_profile.allergies || 'No allergies recorded'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Medications</label>
                  <div className="text-sm text-gray-900 bg-blue-50 px-4 py-3 rounded-md border border-blue-100 whitespace-pre-line min-h-[40px]">
                    {dashboardData.patient_profile.current_medications || 'No current medications recorded'}
                  </div>
                </div>
              </div>
            </div>

            {/* Clinics Section */}
            {(dashboardData.patient_profile.clinic_names && dashboardData.patient_profile.clinic_names.length > 0) || dashboardData.patient_profile.clinic_name ? (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-md font-semibold text-gray-900 mb-3">
                  {dashboardData.patient_profile.clinic_names && dashboardData.patient_profile.clinic_names.length > 1 ? 'My Clinics' : 'My Clinic'}
                </h4>
                {dashboardData.patient_profile.clinic_names && dashboardData.patient_profile.clinic_names.length > 0 ? (
                  <div className="space-y-2">
                    {dashboardData.patient_profile.clinic_names.map((clinicName: string, index: number) => (
                      <div
                        key={index}
                        className="flex items-center text-sm text-gray-900 bg-blue-50 px-4 py-2 rounded-md border border-blue-100"
                      >
                        <svg
                          className="w-5 h-5 text-blue-600 mr-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                        <span className="font-medium">{clinicName}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  dashboardData.patient_profile.clinic_name && (
                    <p className="text-sm text-gray-900 bg-blue-50 px-4 py-2 rounded-md border border-blue-100">
                      {dashboardData.patient_profile.clinic_name}
                    </p>
                  )
                )}
              </div>
            ) : null}
          </div>
        )}

        {activeTab === 'share' && (
          <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Share Documents with Payment</h3>
            <p className="text-sm text-gray-600 mb-4">
              To share your medical documents, please pay <span className="font-semibold">Rs 100</span>. After payment,
              you can select which documents to include and choose how long the share link stays active.
            </p>

            <form onSubmit={handlePayAndShare} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name on Card</label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="4242 4242 4242 4242"
                  maxLength={19}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry (MM/YY)</label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    placeholder="12/29"
                    maxLength={5}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                  <input
                    type="password"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    placeholder="123"
                    maxLength={4}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isProcessingPayment || hasPaidForShare}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
              >
                {hasPaidForShare
                  ? 'Payment active for 24 hours'
                  : isProcessingPayment
                    ? 'Processing payment...'
                    : 'Pay Rs 100'}
              </button>
            </form>

            {/* Document selection appears after successful payment */}
            {hasPaidForShare && (
              <div className="mt-8 border-t border-gray-200 pt-6">
                <h4 className="text-md font-semibold text-gray-900 mb-3">Select Documents to Share</h4>
                {shareDocumentsLoading ? (
                  <p className="text-sm text-gray-500">Loading documents...</p>
                ) : shareDocuments.length === 0 ? (
                  <p className="text-sm text-gray-500">No documents available to share.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                    {shareDocuments.map((doc) => (
                      <label
                        key={doc.id}
                        className="flex items-start space-x-3 px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
                          checked={selectedShareDocumentIds.includes(doc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedShareDocumentIds((prev) => [...prev, doc.id])
                            } else {
                              setSelectedShareDocumentIds((prev) => prev.filter((id) => id !== doc.id))
                            }
                          }}
                        />
                        <div>
                          <p className="font-medium text-gray-900">{doc.original_filename}</p>
                          <p className="text-xs text-gray-500">
                            {doc.document_type} • {new Date(doc.upload_date).toLocaleDateString()}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Access Duration</label>
                  <select
                    value={shareExpiryHours}
                    onChange={(e) => setShareExpiryHours(Number(e.target.value))}
                    className="block w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm text-gray-900 bg-white"
                    style={{ colorScheme: 'light' }}
                  >
                    <option className="bg-white text-gray-900" value={1}>1 hour</option>
                    <option className="bg-white text-gray-900" value={6}>6 hours</option>
                    <option className="bg-white text-gray-900" value={12}>12 hours</option>
                    <option className="bg-white text-gray-900" value={24}>24 hours (1 day)</option>
                    <option className="bg-white text-gray-900" value={48}>48 hours (2 days)</option>
                    <option className="bg-white text-gray-900" value={72}>72 hours (3 days)</option>
                    <option className="bg-white text-gray-900" value={168}>168 hours (7 days)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerateShareLink(selectedShareDocumentIds)}
                  disabled={!selectedShareDocumentIds.length || isGeneratingShare}
                  className="mt-4 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
                >
                  {isGeneratingShare ? 'Generating Link...' : 'Generate Share Link for Selected Documents'}
                </button>
              </div>
            )}

            {shareLink && (
              <div className="mt-6 p-4 rounded-lg border border-dashed border-blue-500 bg-blue-50">
                <p className="text-sm font-medium text-blue-900 mb-2">Your share link</p>
                <div className="flex flex-col space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0">
                    <input
                      type="text"
                      readOnly
                      value={shareLink}
                      className="flex-1 px-2 py-1 text-xs border border-blue-400 rounded-md bg-white text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(shareLink)
                        toast.success('Link copied to clipboard')
                      }}
                      className="px-3 py-1 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800"
                    >
                      Copy
                    </button>
                  </div>
                  {shareExpiresAt && (
                    <p className="text-xs text-gray-600">
                      Expires at: {new Date(shareExpiresAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'access' && (
          <div className="space-y-8">
            {/* Manage Share Links */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Manage Share Links</h3>
                    <p className="text-sm text-gray-500 mt-1">View, monitor, and revoke your shared record links</p>
                  </div>
                  <span className="text-sm text-gray-500 flex-shrink-0">{myShareLinksTotal} total links</span>
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {myShareLinksLoading ? (
                  <div className="p-6">
                    <div className="animate-pulse space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex space-x-4">
                          <div className="w-10 h-10 bg-gray-200 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-3/4" />
                            <div className="h-3 bg-gray-200 rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : myShareLinks.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-5xl mb-3">🔗</div>
                    <h4 className="text-lg font-medium text-gray-900 mb-1">No Share Links Yet</h4>
                    <p className="text-sm text-gray-500">
                      When you share documents, your links will appear here so you can manage them.
                    </p>
                  </div>
                ) : (
                  myShareLinks.map((link) => {
                    const docCount = link.document_ids
                      ? link.document_ids.split(',').filter(Boolean).length
                      : 0
                    const origin = typeof window !== 'undefined' ? window.location.origin : ''
                    const fullUrl = `${origin}/share/${link.token}`

                    return (
                      <div key={link.id} className="px-4 sm:px-6 py-4 hover:bg-gray-50">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                link.status === 'active'
                                  ? 'bg-green-100 text-green-800'
                                  : link.status === 'expired'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}>
                                {link.status === 'active' ? 'Active' : link.status === 'expired' ? 'Expired' : 'Revoked'}
                              </span>
                              <span className="text-xs text-gray-500">
                                Created {new Date(link.created_at).toLocaleDateString()} at{' '}
                                {new Date(link.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 mb-2">
                              <input
                                type="text"
                                readOnly
                                value={fullUrl}
                                className="flex-1 min-w-0 sm:max-w-md px-2 py-1 text-xs border border-gray-300 rounded bg-gray-50 text-gray-700 truncate"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(fullUrl)
                                  toast.success('Link copied')
                                }}
                                className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 flex-shrink-0 self-start sm:self-auto"
                              >
                                Copy
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                              <span>
                                {docCount} document{docCount !== 1 ? 's' : ''} shared
                              </span>
                              <span className="flex items-center">
                                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                {link.view_count} view{link.view_count !== 1 ? 's' : ''}
                              </span>
                              <span>
                                Expires: {new Date(link.expires_at).toLocaleString()}
                              </span>
                              {link.revoked_at && (
                                <span className="text-red-500">
                                  Revoked: {new Date(link.revoked_at).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex-shrink-0 flex flex-row sm:flex-col gap-2">
                            {link.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleRevokeShareLink(link.id)}
                                disabled={revokingLinkId === link.id}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50"
                              >
                                {revokingLinkId === link.id ? 'Revoking...' : 'Revoke Access'}
                              </button>
                            )}
                            {link.status === 'revoked' && (
                              <button
                                type="button"
                                onClick={() => handleDeleteShareLink(link.id)}
                                disabled={deletingLinkId === link.id}
                                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
                              >
                                {deletingLinkId === link.id ? 'Deleting...' : 'Delete'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {myShareLinksTotal > 10 && (
                <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
                  <div className="text-sm text-gray-700">
                    Page {myShareLinksPage} of {Math.ceil(myShareLinksTotal / 10)}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setMyShareLinksPage((p) => Math.max(1, p - 1))}
                      disabled={myShareLinksPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setMyShareLinksPage((p) => p + 1)}
                      disabled={myShareLinksPage * 10 >= myShareLinksTotal}
                      className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Audit / Activity Log */}
            <AuditLogViewer patientOnly={true} showFilters={false} maxHeight="500px" />
          </div>
        )}
      </div>

      <DocumentExplanationsModal
        open={!!rxExplanationsModal}
        loading={rxExplanationsModal?.loading ?? false}
        summary={rxExplanationsModal?.summary ?? ''}
        explanations={rxExplanationsModal?.explanations ?? []}
        error={rxExplanationsModal?.error ?? null}
        onClose={() => setRxExplanationsModal(null)}
        onCopy={handleCopyRxExplanations}
      />

      {/* Floating MediKeep Assistant - pop-up chatbot */}
      <MediKeepChatWidget
        patientId={dashboardData.patient_profile.id}
        accessToken={session?.accessToken ?? ''}
        hasDocuments={(dashboardData.stats.total_documents ?? 0) > 0}
        isPremium={isPremium}
      />
    </div>
  )
}