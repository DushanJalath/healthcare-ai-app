import React from 'react'

interface TimelineEvent {
  date: string
  type: string
  title: string
  description: string
  icon: string
  color: string
  metadata?: any
}

interface PatientTimelineProps {
  events: TimelineEvent[]
}

export default function PatientTimeline({ events }: PatientTimelineProps) {
  const getIcon = (iconName: string) => {
    const icons = {
      'document': '📄',
      'check-circle': '✅',
      'upload': '📤',
      'process': '⚙️',
      'alert': '⚠️',
      'info': 'ℹ️'
    }
    return icons[iconName] || '📋'
  }

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-100 text-blue-600 border-blue-200',
      green: 'bg-green-100 text-green-600 border-green-200',
      yellow: 'bg-yellow-100 text-yellow-600 border-yellow-200',
      red: 'bg-red-100 text-red-600 border-red-200',
      purple: 'bg-purple-100 text-purple-600 border-purple-200'
    }
    return colors[color] || colors.blue
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 7) return `${diffInDays} days ago`
    
    return date.toLocaleDateString()
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Medical Timeline</h3>
        <div className="text-center py-8">
          <div className="text-gray-400 text-6xl mb-4">📅</div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Timeline Events</h4>
          <p className="text-gray-600">Your medical timeline will appear here as documents are uploaded and processed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">Medical Timeline</h3>
        <span className="text-sm text-gray-500">{events.length} events</span>
      </div>
      
      <div className="flow-root">
        <ul className="-mb-8">
          {events.map((event, index) => (
            <li key={index}>
              <div className="relative pb-8">
                {index !== events.length - 1 && (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                    aria-hidden="true"
                  />
                )}
                
                <div className="relative flex space-x-3">
                  <div>
                    <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white border ${getColorClasses(event.color)}`}>
                      {getIcon(event.icon)}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0 pt-1.5 flex justify-between space-x-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {event.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        {event.description}
                      </p>
                      
                      {event.metadata && (
                        <div className="mt-2">
                          {event.metadata.filename && (
                            <p className="text-xs text-gray-400">
                              File: {event.metadata.filename}
                            </p>
                          )}
                          {event.metadata.type && (
                            <p className="text-xs text-gray-400">
                              Type: {event.metadata.type.replace('_', ' ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right text-sm whitespace-nowrap text-gray-500">
                      <time dateTime={event.date}>
                        {formatDate(event.date)}
                      </time>
                      <p className="text-xs text-gray-400">
                        {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}