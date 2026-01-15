import React from 'react'

interface DocumentAnalyticsProps {
  stats: {
    total: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    storageUsed: number
  }
}

export default function DocumentAnalytics({ stats }: DocumentAnalyticsProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      uploaded: 'bg-blue-100 text-blue-800',
      processing: 'bg-yellow-100 text-yellow-800',
      processed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      lab_report: 'bg-purple-100 text-purple-800',
      prescription: 'bg-green-100 text-green-800',
      medical_record: 'bg-blue-100 text-blue-800',
      imaging_report: 'bg-indigo-100 text-indigo-800',
      discharge_summary: 'bg-orange-100 text-orange-800',
      other: 'bg-gray-100 text-gray-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Total Documents</h3>
          <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Storage Used</h3>
          <p className="text-3xl font-bold text-green-600">{formatFileSize(stats.storageUsed)}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Processed</h3>
          <p className="text-3xl font-bold text-purple-600">
            {stats.byStatus.processed || 0}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Processing</h3>
          <p className="text-3xl font-bold text-yellow-600">
            {stats.byStatus.processing || 0}
          </p>
        </div>
      </div>

      {/* Charts and Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Documents by Status</h3>
          <div className="space-y-3">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(status)}`}>
                    {status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <span className="text-lg font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Type Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Documents by Type</h3>
          <div className="space-y-3">
            {Object.entries(stats.byType).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(type)}`}>
                    {type.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </div>
                <span className="text-lg font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Usage Trends (placeholder for future implementation) */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Trends</h3>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
          <p className="text-gray-500">Chart visualization coming soon</p>
        </div>
      </div>
    </div>
  )
}