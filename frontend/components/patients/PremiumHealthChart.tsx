import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/utils/api'

export type HealthTrendMetricId = 'glucose' | 'cholesterol' | 'bp_systolic' | 'heart_rate' | 'weight'

const METRICS: { id: HealthTrendMetricId; label: string; unit: string }[] = [
  { id: 'glucose', label: 'Blood glucose', unit: 'mg/dL' },
  { id: 'cholesterol', label: 'Cholesterol level', unit: 'mg/dL' },
  { id: 'bp_systolic', label: 'Blood pressure (systolic)', unit: 'mmHg' },
  { id: 'heart_rate', label: 'Heart rate', unit: 'bpm' },
  { id: 'weight', label: 'Weight', unit: 'lb' },
]

interface HealthTrendPoint {
  label: string
  value: number
  month_key: string
}

interface HealthTrendsResponse {
  metric: string
  unit: string
  points: HealthTrendPoint[]
  latest_value: number | null
  has_data: boolean
  source?: string
}

type PremiumHealthChartProps = {
  clinicId?: number | null
  /** Same JWT as other patient dashboard calls (NextAuth session), not only localStorage. */
  accessToken: string
}

export default function PremiumHealthChart({ clinicId = null, accessToken }: PremiumHealthChartProps) {
  const [metric, setMetric] = useState<HealthTrendMetricId>('bp_systolic')
  const [series, setSeries] = useState<HealthTrendPoint[]>([])
  const [unit, setUnit] = useState('mmHg')
  const [latest, setLatest] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTrends = useCallback(async () => {
    if (!accessToken?.trim()) {
      setLoading(false)
      setSeries([])
      setLatest(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ metric, months: '6' })
      if (clinicId != null) {
        params.set('clinic_id', String(clinicId))
      }
      const { data } = await api.get<HealthTrendsResponse>(`/patient-dashboard/health-trends?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      setSeries(data.points)
      setUnit(data.unit)
      setLatest(data.latest_value)
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null
      setError(typeof msg === 'string' ? msg : 'Could not load health trends')
      setSeries([])
      setLatest(null)
    } finally {
      setLoading(false)
    }
  }, [metric, clinicId, accessToken])

  useEffect(() => {
    void fetchTrends()
  }, [fetchTrends])

  const data = useMemo(() => series.map((p) => ({ label: p.label, value: p.value })), [series])
  const values = data.map((d) => d.value)
  const minV = values.length ? Math.min(...values) - 2 : 0
  const maxV = values.length ? Math.max(...values) + 2 : 1

  const formatValue = (v: number) => (metric === 'weight' ? v.toFixed(1) : String(Math.round(v)))
  const formatWithUnit = (v: number) => `${formatValue(v)} ${unit}`

  const layout = useMemo(() => {
    const w = 560
    const h = 220
    const padL = 82
    const padR = 14
    const padTop = 28
    const padBottom = 28
    const innerW = w - padL - padR
    const innerH = h - padTop - padBottom
    const range = maxV - minV || 1

    const coords = data.map((d, i) => {
      const x = padL + innerW * (i / Math.max(1, data.length - 1))
      const t = (d.value - minV) / range
      const y = padTop + innerH * (1 - t)
      return { x, y, value: d.value, month: d.label }
    })

    const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(' ')

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((gridT) => {
      const val = maxV - gridT * (maxV - minV)
      const y = padTop + innerH * gridT
      return { y, label: `${formatValue(val)} ${unit}` }
    })

    return {
      w,
      h,
      padL,
      padR,
      padTop,
      padBottom,
      innerW,
      innerH,
      coords,
      polyPoints,
      yTicks,
    }
  }, [data, minV, maxV, metric, unit])

  const currentMeta = METRICS.find((m) => m.id === metric)!

  const latestDisplay =
    latest !== null && latest !== undefined
      ? formatWithUnit(typeof latest === 'number' ? latest : Number(latest))
      : data.length
        ? formatWithUnit(data[data.length - 1].value)
        : null

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Health trends over time</h3>
          <p className="text-sm text-gray-500 mt-1">
            {loading
              ? 'Loading readings from your processed documents…'
              : error
                ? error
                : data.length
                  ? 'Track one metric at a time. Values come from text extracted from your uploaded medical documents.'
                  : 'Track one metric at a time. Upload processed lab or visit documents that mention this metric to see a trend.'}
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <label htmlFor="metric-select" className="text-xs font-medium text-gray-600">
            Metric
          </label>
          <select
            id="metric-select"
            value={metric}
            disabled={loading}
            onChange={(e) => {
              const id = e.target.value as HealthTrendMetricId
              setMetric(id)
              const u = METRICS.find((m) => m.id === id)?.unit
              if (u) setUnit(u)
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-medical-500 focus:ring-1 focus:ring-medical-500 disabled:opacity-50"
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
        {data.length === 0 && !loading ? (
          <div
            className="flex items-center justify-center min-w-[320px] h-[220px] rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-600 px-4 text-center"
            role="status"
          >
            No data points in the last six months for this metric. After documents finish processing, matching
            numbers (for example glucose, cholesterol, or blood pressure) from the document text will appear here.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${layout.w} ${layout.h}`}
            className="w-full min-w-[320px] h-[220px]"
            role="img"
            aria-label={`${currentMeta.label} over time`}
          >
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {layout.yTicks.map((tick, i) => (
              <g key={`grid-${i}`}>
                <line
                  x1={layout.padL}
                  y1={tick.y}
                  x2={layout.w - layout.padR}
                  y2={tick.y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
                <text
                  x={layout.padL - 8}
                  y={tick.y + 3}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize="9"
                  fontFamily="system-ui, sans-serif"
                >
                  {tick.label}
                </text>
              </g>
            ))}
            {data.length > 0 && (
              <>
                <polyline
                  fill="none"
                  stroke="rgb(37 99 235)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={layout.polyPoints}
                />
                {layout.coords.map((c, i) => (
                  <g key={`pt-${i}`}>
                    <text
                      x={c.x}
                      y={c.y - 10}
                      textAnchor="middle"
                      fill="rgb(30 64 175)"
                      fontSize="10"
                      fontWeight="600"
                      fontFamily="system-ui, sans-serif"
                    >
                      {formatWithUnit(c.value)}
                    </text>
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r="4"
                      fill="white"
                      stroke="rgb(37 99 235)"
                      strokeWidth="2"
                    />
                  </g>
                ))}
                {layout.coords.map((c, i) => (
                  <text
                    key={`month-${i}`}
                    x={c.x}
                    y={layout.h - 8}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize="10"
                    fontFamily="system-ui, sans-serif"
                  >
                    {c.month}
                  </text>
                ))}
              </>
            )}
          </svg>
        )}
      </div>

      <p className="mt-2 text-sm text-gray-600">
        Latest reading:{' '}
        {loading ? (
          <span className="font-medium text-gray-400">…</span>
        ) : latestDisplay !== null ? (
          <span className="font-semibold text-gray-900">{latestDisplay}</span>
        ) : (
          <span className="font-medium text-gray-400">—</span>
        )}
      </p>
    </div>
  )
}
