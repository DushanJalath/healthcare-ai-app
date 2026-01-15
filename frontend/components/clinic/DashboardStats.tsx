import React from 'react'
import { ClinicDashboardStats } from '@/types'

interface DashboardStatsProps {
  stats: ClinicDashboardStats
}

export default function DashboardStats({ stats }: DashboardStatsProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const statCards = [
    {
      title: 'Total Patients',
      value: stats.total_patients,
      icon: '👥',
      color: 'blue',
      change: `+${stats.patients_this_month} this month`
    },
    {
      title: 'Total Documents',
      value: stats.total_documents,
      icon: '📄',
      color: 'green',
      change: `+${stats.documents_this_month} this month`
    },
    {
      title: 'Storage Used',
      value: formatFileSize(stats.storage_used),
      icon: '💾',
      color: 'purple',
      change: null
    },
    {
      title: 'Processing Queue',
      value: stats.processing_queue,
      icon: '⏳',
      color: stats.processing_queue > 0 ? 'yellow' : 'green',
      change: stats.processing_queue > 0 ? 'needs attention' : 'all processed'
    }
  ]

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 text-blue-700',
      green: 'bg-green-50 border-green-200 text-green-700',
      purple: 'bg-purple-50 border-purple-200 text-purple-700',
      yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      red: 'bg-red-50 border-red-200 text-red-700'
    }
    return colors[color] || colors.blue
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className={`p-6 rounded-lg border-2 ${getColorClasses(stat.color)}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-75">{stat.title}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
              {stat.change && (
                <p className="text-xs mt-1 opacity-75">{stat.change}</p>
              )}
            </div>
            <div className="text-3xl opacity-75">
              {stat.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}