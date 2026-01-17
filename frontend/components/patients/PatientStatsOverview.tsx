import React from 'react'
import { PatientStatsResponse, PatientDetailResponse } from '@/types'
import Link from 'next/link'

interface PatientStatsOverviewProps {
  stats: PatientStatsResponse
}

export default function PatientStatsOverview({ stats }: PatientStatsOverviewProps) {
  const formatGender = (gender: string) => {
    return gender.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const statCards = [
    {
      title: 'Total Patients',
      value: stats.total_patients,
      icon: '👥',
      color: 'blue',
      subtitle: `${stats.new_patients_this_month} new this month`
    },
    {
      title: 'With Documents',
      value: stats.patients_with_documents,
      icon: '📄',
      color: 'green',
      subtitle: `${Math.round((stats.patients_with_documents / stats.total_patients) * 100) || 0}% of total`
    },
    {
      title: 'New This Month',
      value: stats.new_patients_this_month,
      icon: '✨',
      color: 'purple',
      subtitle: 'Recently registered'
    }
  ]

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 text-blue-700',
      green: 'bg-green-50 border-green-200 text-green-700',
      purple: 'bg-purple-50 border-purple-200 text-purple-700'
    }
    return colors[color] || colors.blue
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className={`p-6 rounded-lg border ${getColorClasses(stat.color)}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-75">{stat.title}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
                <p className="text-xs mt-1 opacity-75">{stat.subtitle}</p>
              </div>
              <div className="text-4xl opacity-75">
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Demographics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gender Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Gender Distribution</h3>
          {Object.keys(stats.patients_by_gender).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.patients_by_gender).map(([gender, count]) => (
                <div key={gender} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">
                    {formatGender(gender)}
                  </span>
                  <div className="flex items-center space-x-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${(count / stats.total_patients) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-900 font-semibold w-12 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No gender data available</p>
          )}
        </div>

        {/* Age Group Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Age Group Distribution</h3>
          {Object.keys(stats.patients_by_age_group).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.patients_by_age_group).map(([ageGroup, count]) => (
                <div key={ageGroup} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">
                    {ageGroup} years
                  </span>
                  <div className="flex items-center space-x-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{
                          width: `${(count / stats.total_patients) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-900 font-semibold w-12 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No age data available</p>
          )}
        </div>
      </div>

      {/* Recent Patients */}
      {stats.recent_patients && stats.recent_patients.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Patients</h3>
          <div className="space-y-3">
            {stats.recent_patients.map((patient) => (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {patient.patient_id}
                  </p>
                  <p className="text-xs text-gray-500">
                    {patient.user_first_name && patient.user_last_name
                      ? `${patient.user_first_name} ${patient.user_last_name}`
                      : 'No user linked'}
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(patient.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
