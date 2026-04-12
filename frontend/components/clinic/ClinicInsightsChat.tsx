import React, { useState, useRef, useEffect } from 'react'
import type { ClinicInsightsChatTurn } from '@/types'
import { sendClinicInsightsChat } from '@/services/clinic-insights.service'
import toast from 'react-hot-toast'

const BRAND_BLUE = '#0081C9'

/**
 * Fixed panel height — welcome vs chat must not change outer size.
 * Grid row `minmax(0,1fr)` forces the scroll region to fill space; flex-1 alone can still
 * collapse to content height when switching views in some browsers.
 */
const panelHeightStyle: React.CSSProperties = {
  height: 'min(37.5rem, calc(100vh - 7rem))',
  maxHeight: 'min(37.5rem, calc(100vh - 7rem))',
}

const scrollAreaClass =
  'min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-white [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300/90 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400/90'

interface ClinicInsightsChatProps {
  accessToken: string
}

const QUICK_QUESTIONS = [
  'How many patients are enrolled in our clinic?',
  'How many patients have a condition recorded in medical history?',
  'What kinds of clinic-wide questions can I ask?',
] as const

function AssistantAvatar() {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"
      aria-hidden
    >
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M16 4C10.5 4 6 8.2 6 13.4c0 3.2 1.6 6 4 7.6v3.5c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-3.5c2.4-1.6 4-4.4 4-7.6C26 8.2 21.5 4 16 4z"
          stroke={BRAND_BLUE}
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M12 14c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm6 0c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"
          fill={BRAND_BLUE}
        />
        <path d="M14 19h4" stroke={BRAND_BLUE} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function ClinicInsightsChat({ accessToken }: ClinicInsightsChatProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ClinicInsightsChatTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, open, loading])

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 100)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const sendQuestion = async (question: string) => {
    const q = question.trim()
    if (!q || loading) return

    setInput('')
    const userTurn: ClinicInsightsChatTurn = { role: 'user', content: q }
    setMessages((prev) => [...prev, userTurn])
    setLoading(true)

    try {
      const chatHistory: ClinicInsightsChatTurn[] = [...messages, userTurn]
      const response = await sendClinicInsightsChat(
        {
          question: q,
          chat_history: chatHistory,
        },
        accessToken
      )

      setMessages((prev) => [...prev, { role: 'assistant', content: response.answer }])
    } catch (error: unknown) {
      const err = error as {
        code?: string
        message?: string
        response?: { data?: { detail?: string } }
      }
      let detail: string
      if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
        detail = 'That took too long. Check your connection or try again in a moment.'
      } else {
        detail =
          (typeof err.response?.data?.detail === 'string' && err.response.data.detail) ||
          'Unable to get an answer. Please try again.'
      }
      toast.error(detail)
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  const handleSend = () => {
    void sendQuestion(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-sky-200"
        style={{ backgroundColor: BRAND_BLUE }}
        aria-expanded={open}
        aria-label={open ? 'Hide clinic insights chat' : 'Open clinic insights chat'}
        title={open ? 'Hide chat' : 'Open chat'}
      >
        {/* Same icon when open or closed — avoids a second “X” next to the panel close button */}
        <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
        </svg>
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-[99] grid w-[min(100vw-1.5rem,380px)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl"
          style={panelHeightStyle}
          role="dialog"
          aria-label="Clinic insights chat"
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-start gap-3 px-4 pb-4 pt-4 text-white"
            style={{ backgroundColor: BRAND_BLUE }}
          >
            <AssistantAvatar />
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-lg font-bold leading-tight tracking-tight">Clinic insights</h2>
              <p className="text-xs font-medium text-white/85">MediKeep Assistant</p>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-white/95">
                <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                <span>Online</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 rounded-lg p-1.5 text-white/90 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Close chat"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body: fills space between header and footer; panel height is fixed above */}
          <div className={scrollAreaClass}>
            {messages.length === 0 && !loading && (
              <div className="px-4 pb-4 pt-3">
                <p className="text-[15px] leading-snug text-gray-800">
                  Hello! This is <strong className="font-semibold">clinic insights</strong>—aggregate
                  answers about your clinic (counts and summaries), never patient names. How can I help?
                </p>
                <p className="mt-3 text-sm font-semibold text-gray-700">Quick questions you might have:</p>
                <ul className="mt-2 space-y-2">
                  {QUICK_QUESTIONS.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => void sendQuestion(q)}
                        disabled={loading}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border-2 border-sky-100 bg-sky-50/40 px-3 py-2.5 text-left text-sm font-medium text-gray-800 transition-colors hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="leading-snug">{q}</span>
                        <svg
                          className="h-5 w-5 shrink-0 text-sky-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {messages.length > 0 && (
              <div className="flex flex-col gap-3 px-4 pb-5 pt-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'rounded-br-md text-white'
                          : 'rounded-bl-md border border-gray-100 bg-gray-50 text-gray-900'
                      }`}
                      style={m.role === 'user' ? { backgroundColor: BRAND_BLUE } : undefined}
                    >
                      <p className="break-words whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-md border border-gray-100 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600">
                      <span
                        className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-transparent"
                        style={{ borderTopColor: BRAND_BLUE }}
                      />
                      Thinking…
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-px w-full shrink-0" aria-hidden />
              </div>
            )}
          </div>

          {/* Footer controls + input */}
          <div className="shrink-0 border-t border-gray-100 bg-gray-50/90 px-3 pb-2 pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm">
                <svg className="h-3.5 w-3.5 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeWidth="2"
                    strokeLinecap="round"
                    d="M12 4c-2 4-6 5-6 10a6 6 0 1012 0c0-5-4-6-6-10z"
                  />
                  <path strokeWidth="2" strokeLinecap="round" d="M12 10v4M10 14h4" />
                </svg>
                Agent
              </div>
              <div className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
                MediKeep Standard
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={loading}
                className="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:bg-gray-100"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: BRAND_BLUE }}
                aria-label="Send message"
              >
                <svg className="h-5 w-5 -translate-x-px translate-y-px" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-gray-400">Powered by MediKeep</p>
          </div>
        </div>
      )}
    </>
  )
}
