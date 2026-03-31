import { useMemo, useState } from 'react'

type MetricId = 'glucose' | 'bp_systolic' | 'heart_rate' | 'weight'

const METRICS: { id: MetricId; label: string; unit: string }[] = [
  { id: 'glucose', label: 'Blood glucose', unit: 'mg/dL' },
  { id: 'bp_systolic', label: 'Blood pressure (systolic)', unit: 'mmHg' },
  { id: 'heart_rate', label: 'Heart rate', unit: 'bpm' },
  { id: 'weight', label: 'Weight', unit: 'lb' },
]

/** Deterministic dummy series for demo charts */
function seriesFor(metric: MetricId): { label: string; value: number }[] {
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
  const seeds: Record<MetricId, number[]> = {
    glucose: [118, 122, 115, 128, 120, 116],
    bp_systolic: [128, 126, 130, 124, 122, 118],
    heart_rate: [72, 74, 71, 76, 73, 70],
    weight: [182, 181, 180, 179, 178, 177],
  }
  return months.map((label, i) => ({ label, value: seeds[metric][i] }))
}

export default function PremiumHealthChart() {
  const [metric, setMetric] = useState<MetricId>('glucose')
  const data = useMemo(() => seriesFor(metric), [metric])
  const values = data.map((d) => d.value)
  const min = Math.min(...values) - 2
  const max = Math.max(...values) + 2
  const w = 560
  const h = 220
  const pad = 36
  const innerW = w - pad * 2
  const innerH = h - pad * 2

  const points = data.map((d, i) => {
    const x = pad + (innerW * (i / Math.max(1, data.length - 1)))
    const t = (d.value - min) / (max - min || 1)
    const y = pad + innerH * (1 - t)
    return `${x},${y}`
  })

  const current = METRICS.find((m) => m.id === metric)!

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Health trends over time</h3>
          <p className="text-sm text-gray-500 mt-1">
            Track one metric at a time. Values are sample data for illustration.
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <label htmlFor="metric-select" className="text-xs font-medium text-gray-600">
            Metric
          </label>
          <select
            id="metric-select"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricId)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-medical-500 focus:ring-1 focus:ring-medical-500"
          >
            {METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full min-w-[320px] h-[220px]"
          role="img"
          aria-label={`${current.label} over time`}
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = pad + innerH * t
            return (
              <line
                key={t}
                x1={pad}
                y1={y}
                x2={w - pad}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
            )
          })}
          <polyline
            fill="none"
            stroke="rgb(37 99 235)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.join(' ')}
          />
          {data.map((d, i) => {
            const [x, y] = points[i].split(',').map(Number)
            return (
              <circle key={`pt-${i}`} cx={x} cy={y} r="4" fill="white" stroke="rgb(37 99 235)" strokeWidth="2" />
            )
          })}
          {data.map((d, i) => {
            const x = pad + (innerW * (i / Math.max(1, data.length - 1)))
            return (
              <text key={`lbl-${i}`} x={x} y={h - 8} textAnchor="middle" fill="#6b7280" fontSize="10">
                {d.label}
              </text>
            )
          })}
        </svg>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        Latest reading: <span className="font-semibold text-gray-900">{data[data.length - 1].value}</span>{' '}
        {current.unit}
      </p>
    </div>
  )
}
