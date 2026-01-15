import React from 'react'

interface Alert {
  type: 'info' | 'warning' | 'error'
  title: string
  message: string
  action?: string
}

interface SystemAlertsProps {
  alerts: Alert[]
  onActionClick?: (action: string) => void
}

export default function SystemAlerts({ alerts, onActionClick }: SystemAlertsProps) {
  const getAlertStyles = (type: string) => {
    const styles = {
      info: 'bg-blue-50 border-blue-200 text-blue-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      error: 'bg-red-50 border-red-200 text-red-800'
    }
    return styles[type] || styles.info
  }

  const getIcon = (type: string) => {
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌'
    }
    return icons[type] || icons.info
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Status</h3>
        <div className="text-center py-4">
          <div className="text-green-500 text-4xl mb-2">✅</div>
          <p className="text-green-700 font-medium">All systems operational</p>
          <p className="text-sm text-gray-500">No alerts or issues detected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        System Alerts ({alerts.length})
      </h3>
      
      <div className="space-y-3">
        {alerts.map((alert, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border-l-4 ${getAlertStyles(alert.type)}`}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 mr-3 text-lg">
                {getIcon(alert.type)}
              </div>
              
              <div className="flex-1">
                <h4 className="font-medium">{alert.title}</h4>
                <p className="text-sm mt-1 opacity-75">{alert.message}</p>
                
                {alert.action && onActionClick && (
                  <button
                    onClick={() => onActionClick(alert.action!)}
                    className="mt-2 text-sm font-medium underline hover:no-underline"
                  >
                    Take Action
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}