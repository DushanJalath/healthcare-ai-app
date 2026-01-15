import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import api from '@/utils/api'
import toast from 'react-hot-toast'

interface AuditLog {
  id: number
  action: string
  entity_type: string
  entity_id?: string
  entity_name?: string
  description: string
  user_email?: string
  user_role?: string
  ip_address?: string
  success: boolean
  error_message?: string
  created_at: string
  metadata?: any
}

interface AuditLogViewerProps {
  showFilters?: boolean
  patientOnly?: boolean
  maxHeight?: string
}

export default function AuditLogViewer({ 
  showFilters = true, 
  patientOnly = false,
  maxHeight = '600px'
}: AuditLogViewerProps) {
  const { data: session } = useSession()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    action: '',
    entity_type: '',
    date_from: '',
    date_to: '',
    success: ''
  })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetchAuditLogs()
  }, [session, filters, page])

  const fetchAuditLogs = async () => {
    if (!session?.accessToken) return
    
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '20'
      })
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })

      const endpoint = patientOnly ? '/audit/my-activity' : '/audit/logs'
      const response = await api.get(`${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      })
      
      setLogs(response.data.logs)
      setTotal(response.data.total)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const getActionIcon = (action: string) => {
    const icons = {
      'create': '➕',
      'update': '✏️',
      'delete': '🗑️',
      'view': '👁️',
      'download': '⬇️',
      'login': '🔐',
      'logout': '🚪',
      'upload': '📤',
      'assign': '📎',
      'process': '⚙️'
    }
    return icons[action.toLowerCase()] || '📋'
  }

  const getEntityIcon = (entityType: string) => {
    const icons = {
      'user': '👤',
      'patient': '🏥',
      'document': '📄',
      'clinic': '🏢',
      'extraction': '🔍',
      'system': '⚙️'
    }
    return icons[entityType.toLowerCase()] || '📋'
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h ago`
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`
    
    return date.toLocaleDateString()
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">
            {patientOnly ? 'My Activity Log' : 'Audit Logs'}
          </h3>
          <span className="text-sm text-gray-500">{total} total entries</span>
        </div>
      </div>

      {/* Filters */}
      {showFilters && !patientOnly && (
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <select
              value={filters.action}
              onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="view">View</option>
              <option value="download">Download</option>
              <option value="upload">Upload</option>
            </select>

            <select
              value={filters.entity_type}
              onChange={(e) => setFilters(prev => ({ ...prev, entity_type: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">All Entities</option>
              <option value="user">User</option>
              <option value="patient">Patient</option>
              <option value="document">Document</option>
              <option value="clinic">Clinic</option>
            </select>

            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />

            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />

            <button
              onClick={() => {
                setFilters({ action: '', entity_type: '', date_from: '', date_to: '', success: '' })
                setPage(1)
              }}
              className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Logs List */}
      <div style={{ maxHeight, overflowY: 'auto' }}>
        {loading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-6xl mb-4">📋</div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Audit Logs</h4>
            <p className="text-gray-600">No activity logs found for the selected filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 flex items-center">
                    <div className="text-lg mr-2">{getActionIcon(log.action)}</div>
                    <div className="text-lg">{getEntityIcon(log.entity_type)}</div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {log.description}
                    </p>
                    
                    <div className="mt-1 text-xs text-gray-500 space-y-1">
                      <div className="flex items-center space-x-4">
                        {!patientOnly && log.user_email && (
                          <span>User: {log.user_email}</span>
                        )}
                        {log.entity_name && (
                          <span>Entity: {log.entity_name}</span>
                        )}
                        {log.ip_address && (
                          <span>IP: {log.ip_address}</span>
                        )}
                      </div>
                      
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="text-xs text-gray-400">
                          {Object.entries(log.metadata).slice(0, 3).map(([key, value]) => (
                            <span key={key} className="mr-3">
                              {key}: {JSON.stringify(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {!log.success && log.error_message && (
                      <div className="mt-1 text-xs text-red-600 bg-red-50 p-1 rounded">
                        Error: {log.error_message}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-shrink-0 text-xs text-gray-500 text-right">
                    <div>{formatTime(log.created_at)}</div>
                    <div className="text-gray-400">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.success 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {log.success ? '✓' : '✗'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-700">
            Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, total)} of {total} entries
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 20 >= total}
              className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}