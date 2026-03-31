import React from 'react'

export interface DocumentExplanationsModalProps {
  open: boolean
  loading: boolean
  summary: string
  explanations: string[]
  error: string | null
  onClose: () => void
  onCopy: () => void
}

export default function DocumentExplanationsModal({
  open,
  loading,
  summary,
  explanations,
  error,
  onClose,
  onCopy,
}: DocumentExplanationsModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden />
        <div className="inline-block w-full max-w-4xl transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all sm:my-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Explanations</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-500" aria-label="Close">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="mb-4 text-sm text-gray-500">
            Plain-language summary and simple points to help you understand this document.
          </p>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-medical-500 border-t-transparent" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {!loading && !error && (
            <div className="max-h-[28rem] space-y-6 overflow-y-auto pr-1">
              <section>
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-medical-800">Summary</h4>
                <div className="rounded-lg border border-medical-100 bg-medical-50/50 p-4 text-sm leading-relaxed text-gray-800">
                  {summary || '—'}
                </div>
              </section>
              <section>
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-medical-800">Explanations</h4>
                {explanations.length === 0 ? (
                  <p className="text-sm text-gray-500">No explanation points were generated.</p>
                ) : (
                  <ul className="list-inside list-disc space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
                    {explanations.map((line, i) => (
                      <li key={i} className="leading-relaxed">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onCopy}
              disabled={loading || !!error || !summary}
              className="rounded-lg bg-medical-600 px-4 py-2 text-sm font-medium text-white hover:bg-medical-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Copy to clipboard
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
