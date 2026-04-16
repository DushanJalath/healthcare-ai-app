import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/utils/api'
import { PatientDetailResponse } from '@/types'

type Props = {
  accessToken: string
}

const MIN_QUERY_LEN = 4
const DEBOUNCE_MS = 400

function patientDisplayName(p: PatientDetailResponse): string {
  const parts = [p.user_first_name, p.user_last_name].filter(Boolean)
  if (parts.length) return parts.join(' ').trim()
  return p.patient_id
}

function formatDobAge(dob: string | null | undefined): string {
  if (!dob) return 'DOB not on file'
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return dob
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return `${birth.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} (${age}y)`
}

export default function PatientPhoneLookup({ accessToken }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientDetailResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim()
      if (trimmed.length < MIN_QUERY_LEN) {
        setResults([])
        setSearched(false)
        setLoading(false)
        return
      }
      setLoading(true)
      setSearched(true)
      try {
        const params = new URLSearchParams({
          page: '1',
          per_page: '20',
          search: trimmed
        })
        const res = await api.get<{ patients: PatientDetailResponse[] }>(`/patients?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        setResults(res.data.patients || [])
      } catch (err: unknown) {
        setResults([])
        const detail =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined
        toast.error(typeof detail === 'string' ? detail : 'Lookup failed')
      } finally {
        setLoading(false)
      }
    },
    [accessToken]
  )

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    timerRef.current = setTimeout(() => {
      runSearch(query)
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, runSearch])

  return (
    <div className="mb-8 bg-white rounded-lg shadow border border-amber-100 overflow-hidden">
      <div className="bg-amber-50 px-4 py-3 border-b border-amber-100">
        <h2 className="text-lg font-semibold text-gray-900">Quick patient lookup</h2>
        <p className="text-sm text-gray-600 mt-0.5">
          Enter a mobile number to show allergies and current medications for patients enrolled in your clinic.
        </p>
      </div>
      <div className="p-4 sm:p-6">
        <label htmlFor="phone-lookup" className="sr-only">
          Mobile phone number
        </label>
        <input
          id="phone-lookup"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 076xxxxxxx or +94xxxxxxxxxx"
          className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent"
        />
        {query.trim().length > 0 && query.trim().length < MIN_QUERY_LEN && (
          <p className="mt-2 text-sm text-gray-500">Type at least {MIN_QUERY_LEN} characters to search.</p>
        )}
        {loading && <p className="mt-4 text-sm text-gray-500">Searching…</p>}
        {!loading && searched && query.trim().length >= MIN_QUERY_LEN && results.length === 0 && (
          <p className="mt-4 text-sm text-amber-800 bg-amber-50 rounded-md px-3 py-2 inline-block">
            No matching patient in your clinic. Check the number or confirm the patient is registered here.
          </p>
        )}
        {!loading && results.length > 0 && (
          <ul className="mt-4 space-y-4">
            {results.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-gray-200 p-4 bg-gray-50/80 hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{patientDisplayName(p)}</p>
                    <p className="text-sm text-gray-600">
                      ID {p.patient_id} · {formatDobAge(p.date_of_birth)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Phone: {p.phone || p.user_phone || '—'}
                    </p>
                  </div>
                  <Link
                    href={`/patients/${p.id}`}
                    className="text-sm font-medium text-medical-600 hover:text-medical-700 whitespace-nowrap"
                  >
                    Open full record →
                  </Link>
                </div>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div>
                    <dt className="font-medium text-red-800">Allergies</dt>
                    <dd className="text-gray-800 whitespace-pre-wrap">{p.allergies?.trim() || 'None recorded'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-900">Medications (active treatment history)</dt>
                    <dd className="text-gray-500 text-xs mt-0.5 mb-1">
                      From treatment episodes whose date range includes today (start on or before today; end missing or on/after
                      today), using medications recorded on each episode.
                    </dd>
                    <dd className="text-gray-800 whitespace-pre-wrap">
                      {p.medications_from_active_treatments?.trim() || 'None listed for active treatment periods'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Current medications (profile)</dt>
                    <dd className="text-gray-500 text-xs mt-0.5 mb-1">Free-text field on the patient record (may differ from history).</dd>
                    <dd className="text-gray-800 whitespace-pre-wrap">{p.current_medications?.trim() || 'None recorded'}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
