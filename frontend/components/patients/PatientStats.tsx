import React from 'react'

interface PatientStatsProps {
  stats: {
    total_documents: number
    recent_documents: number
    processed_documents: number
    pending_documents: number
    storage_used: number
    last_upload: string | null
    document_types: Record<string, number>
  }
}

export default function PatientStats({ stats }: PatientStatsProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatLastUpload = (dateString: string | null) => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 7) return `${diffInDays} days ago`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`
    
    return date.toLocaleDateString()
  }

  const statCards = [
    {
      title: 'Total Documents',
      value: stats.total_documents,
      icon: '📄',
      color: 'blue',
      subtitle: `${stats.recent_documents} this week`
    },
    {
      title: 'Processed',
      value: stats.processed_documents,
      icon: '✅',
      color: 'green',
      subtitle: 'AI analysis complete'
    },
    {
      title: 'Pending',
      value: stats.pending_documents,
      icon: '⏳',
      color: stats.pending_documents > 0 ? 'yellow' : 'gray',
      subtitle: 'Being processed'
    },
    {
      title: 'Storage Used',
      value: formatFileSize(stats.storage_used),
      icon: '💾',
      color: 'purple',
      subtitle: 'Total file size'
    }
  ]

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 text-blue-700',
      green: 'bg-green-50 border-green-200 text-green-700',
      yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      purple: 'bg-purple-50 border-purple-200 text-purple-700',
      gray: 'bg-gray-50 border-gray-200 text-gray-700'
    }
    return colors[color] || colors.blue
  }

  return (
    <div className="mb-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className={`p-6 rounded-lg border ${getColorClasses(stat.color)}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-75">{stat.title}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
                <p className="text-xs mt-1 opacity-75">{stat.subtitle}</p>
              </div>
              <div className="text-3xl opacity-75">
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document Types */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Document Types</h3>
          {Object.keys(stats.document_types).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.document_types).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">
                    {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                  <span className="text-sm text-gray-900 font-semibold">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No documents uploaded yet</p>
          )}
        </div>

        {/* Upload Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Activity</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Last Upload</span>
              <span className="text-sm text-gray-900">
                {formatLastUpload(stats.last_upload)}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">This Week</span>
              <span className="text-sm text-gray-900">{stats.recent_documents} documents</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Processing Rate</span>
              <span className="text-sm text-gray-900">
                {stats.total_documents > 0
                  ? Math.round((stats.processed_documents / stats.total_documents) * 100)
                  : 0
                }% complete
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}