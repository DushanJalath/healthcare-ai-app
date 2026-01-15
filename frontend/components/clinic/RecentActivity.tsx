import React from 'react'

interface ActivityItem {
  type: string
  title: string
  timestamp: string
  icon: string
  color: string
}

interface RecentActivityProps {
  activities: ActivityItem[]
}

export default function RecentActivity({ activities }: RecentActivityProps) {
  const getIconComponent = (icon: string) => {
    const icons = {
      'user-plus': '👤',
      'document': '📄',
      'upload': '📤',
      'chart-bar': '📊',
      'alert': '⚠️'
    }
    return icons[icon] || '📋'
  }

  const getColorClasses = (color: string) => {
    const colors = {
      green: 'bg-green-100 text-green-800',
      blue: 'bg-blue-100 text-blue-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      red: 'bg-red-100 text-red-800',
      purple: 'bg-purple-100 text-purple-800'
    }
    return colors[color] || colors.blue
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
        <button className="text-sm text-blue-600 hover:text-blue-800">
          View All
        </button>
      </div>
      
      {activities.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-400 text-4xl mb-2">📋</div>
          <p className="text-gray-500">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getColorClasses(activity.color)}`}>
                {getIconComponent(activity.icon)}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {activity.title}
                </p>
                <p className="text-xs text-gray-500">
                  {formatTime(activity.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}