import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { RAGChatTurn } from '@/types'
import { sendRAGChat } from '@/services/rag.service'
import toast from 'react-hot-toast'

interface MediKeepChatWidgetProps {
  patientId: number
  accessToken: string
  hasDocuments?: boolean
  /** When true, show extra model options in the UI only; API calls are unchanged. */
  isPremium?: boolean
}

type ModelEntry = { id: string; label: string }

const MODEL_GROUPS: { key: string; title: string; subtitle: string; models: ModelEntry[] }[] = [
  {
    key: 'auto',
    title: 'Auto',
    subtitle: 'Efficiency',
    models: [
      { id: 'standard', label: 'MediKeep Standard' },
      { id: 'standard_fast', label: 'MediKeep Standard Fast' },
    ],
  },
  {
    key: 'premium',
    title: 'Premium',
    subtitle: 'Intelligence',
    models: [
      { id: 'premium_clinical', label: 'MediKeep Premium (clinical)' },
      { id: 'premium_reasoning', label: 'MediKeep Premium (reasoning)' },
      { id: 'premium_claude', label: 'MediKeep Premium (extended context)' },
    ],
  },
]

const ALL_MODELS: ModelEntry[] = MODEL_GROUPS.flatMap((g) => g.models)

const STANDARD_MODELS = MODEL_GROUPS.find((g) => g.key === 'auto')!.models
const PREMIUM_MODEL_IDS = new Set(
  MODEL_GROUPS.find((g) => g.key === 'premium')!.models.map((m) => m.id)
)

function isPremiumOnlyModel(id: string): boolean {
  return PREMIUM_MODEL_IDS.has(id)
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 4.5c.5-1.2 1.8-2 3-2 1.5 0 2.8 1 3.3 2.3M12 2.5v2M16.5 6.5c.8-.3 1.7-.5 2.5-.5 2.2 0 4 1.8 4 4 0 .9-.2 1.7-.6 2.4M21 12h-2M19 15.5c.5.7.8 1.6.8 2.5 0 2.2-1.8 4-4 4-.9 0-1.7-.3-2.4-.7M12 21.5v-2M7.5 18.5c-.7.4-1.5.7-2.4.7-2.2 0-4-1.8-4-4 0-.9.3-1.8.8-2.5M3 12h2M4.5 7.5A4 4 0 014 6c0-2.2 1.8-4 4-4 .8 0 1.6.2 2.3.6"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9a3 3 0 100 6 3 3 0 000-6z" />
    </svg>
  )
}

const QUICK_QUESTIONS = [
  'What is MediKeep?',
  'How do I view my documents?',
  'Where is my timeline?',
]

const PREDEFINED_ANSWERS: Record<string, string> = {
  'What is MediKeep?':
    'MediKeep is a secure medical document vault that helps you store, view, and organize your health records in one place. You can also ask questions to better understand your uploaded documents.',
  'How do I view my documents?':
    'Go to the **Documents** tab in your dashboard to view all uploaded files, see processing status, and open a document to review details.',
  'Where is my timeline?':
    'Open the **Timeline** tab in your dashboard to see your recent medical events and document activity in chronological order.',
}

export default function MediKeepChatWidget({
  patientId,
  accessToken,
  hasDocuments = true,
  isPremium = false,
}: MediKeepChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<RAGChatTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string>(ALL_MODELS[0].id)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!modelMenuOpen && !agentMenuOpen) return
    const onDown = (e: MouseEvent) => {
      const el = modelPickerRef.current
      if (el && !el.contains(e.target as Node)) {
        setModelMenuOpen(false)
        setAgentMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [modelMenuOpen, agentMenuOpen])

  useEffect(() => {
    if (!isPremium) {
      setSelectedModelId((id) => (isPremiumOnlyModel(id) ? STANDARD_MODELS[0].id : id))
    }
  }, [isPremium])

  const selectedModelLabel =
    ALL_MODELS.find((m) => m.id === selectedModelId)?.label ?? STANDARD_MODELS[0].label

  const handleSend = async (question?: string) => {
    const text = (question ?? input).trim()
    if (!text || loading) return

    if (!question) setInput('')
    const userTurn: RAGChatTurn = { role: 'user', content: text }
    setMessages((prev) => [...prev, userTurn])

    const predefined = PREDEFINED_ANSWERS[text]
    if (predefined) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: predefined },
      ])
      return
    }

    setLoading(true)

    try {
      const chatHistory: RAGChatTurn[] = [...messages, userTurn]
      const response = await sendRAGChat(
        patientId,
        {
          question: text,
          chat_history: chatHistory,
        },
        accessToken
      )
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.answer },
      ])
    } catch (error: any) {
      const detail =
        error.response?.data?.detail ||
        (typeof error.response?.data?.detail === 'string'
          ? error.response?.data?.detail
          : 'Unable to get an answer. Please try again.')
      toast.error(detail)
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Floating chat button - bottom right, Medikeep styles */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-medical-500 text-white shadow-lg transition hover:bg-medical-600 focus:outline-none focus:ring-2 focus:ring-medical-400 focus:ring-offset-2"
        aria-label="Open MediKeep Assistant"
      >
        <svg
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {/* Pop-up chat panel - BotLoop-style layout, Medikeep styling */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          style={{ height: '520px' }}
        >
          {/* Header - Medikeep medical blue (model UI lives in the dark composer bar for Premium) */}
          <div className="flex items-center gap-3 bg-medical-500 px-4 py-3 text-white">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/95">
              <Image
                src="/medikeep.png"
                alt="MediKeep"
                fill
                sizes="40px"
                className="object-contain p-1"
                priority
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">MediKeep Assistant</p>
              <p className="flex items-center gap-1.5 text-sm text-white/90">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Online
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-lg p-1.5 text-white/90 hover:bg-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Close chat"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chat body */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
            <div className="flex-1 overflow-y-auto p-4">
              {/* Welcome + Quick Questions (scrolls with messages, like first assistant card) */}
              <div className="mb-4">
                <p className="text-sm text-gray-700">
                  Hello! I&apos;m MediKeep Assistant. How can I help you today?
                </p>
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    Quick questions you might have:
                  </p>
                  <div className="space-y-2">
                    {QUICK_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSend(q)}
                        className="flex w-full items-center justify-between rounded-lg border border-medical-200 bg-white px-3 py-2.5 text-left text-sm text-gray-800 transition hover:border-medical-400 hover:bg-medical-50"
                      >
                        {q}
                        <svg className="h-4 w-4 text-medical-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-medical-500 text-white rounded-br-md'
                        : 'bg-white text-gray-900 rounded-bl-md border border-gray-200 shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-medical-400 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-medical-400 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-medical-400 [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area — composer + model list (standard always; premium models locked until subscription) */}
            <div ref={modelPickerRef} className="relative border-t border-gray-200 bg-gradient-to-b from-medical-50/40 to-white">
              {modelMenuOpen && (
                <div
                  className="absolute bottom-full left-2 right-2 z-10 mb-1 flex max-h-[min(340px,52vh)] flex-col overflow-hidden rounded-xl border border-medical-100 bg-white shadow-xl ring-1 ring-medical-100/80"
                  role="listbox"
                  aria-label="Choose assistant model"
                >
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]">
                    {MODEL_GROUPS.map((group) => (
                      <div key={group.key} className="mb-2">
                        <div className="sticky top-0 border-b border-transparent bg-gray-50/95 px-3 py-1.5 backdrop-blur-sm">
                          <span className="text-xs font-semibold text-medical-900">{group.title}</span>{' '}
                          <span className="text-[11px] font-normal text-gray-500">{group.subtitle}</span>
                        </div>
                        <ul className="px-1">
                          {group.models.map((m) => {
                            const locked = group.key === 'premium' && !isPremium
                            const selected = !locked && m.id === selectedModelId
                            if (locked) {
                              return (
                                <li key={m.id}>
                                  <div className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-2 py-2 text-left text-sm text-gray-500">
                                    <BrainIcon className="h-4 w-4 shrink-0 text-gray-400" />
                                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                                    <svg
                                      className="h-3.5 w-3.5 shrink-0 text-gray-400"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                      />
                                    </svg>
                                    <Link
                                      href="/patients/premium"
                                      onClick={() => setModelMenuOpen(false)}
                                      className="shrink-0 rounded-full bg-medical-600 px-2.5 py-0.5 text-[10px] font-semibold text-white hover:bg-medical-700"
                                    >
                                      View plans
                                    </Link>
                                  </div>
                                </li>
                              )
                            }
                            return (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => {
                                    setSelectedModelId(m.id)
                                    setModelMenuOpen(false)
                                  }}
                                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                                    selected
                                      ? 'border border-medical-200 bg-medical-50 text-medical-900'
                                      : 'text-gray-800 hover:bg-medical-50/60'
                                  }`}
                                >
                                  <BrainIcon className={`h-4 w-4 shrink-0 ${selected ? 'text-medical-600' : 'text-gray-400'}`} />
                                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                                  {selected && (
                                    <svg className="h-4 w-4 shrink-0 text-medical-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 bg-gray-50/80 px-2 py-2">
                    <p className="text-center text-[10px] leading-snug text-gray-500">
                      {isPremium
                        ? 'Model choice is for display; replies use the same MediKeep pipeline.'
                        : 'You are on standard models. Subscribe to unlock Premium models in this list.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 px-3 pt-3">
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setAgentMenuOpen((o) => !o)
                        setModelMenuOpen(false)
                      }}
                      className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-sm transition hover:border-medical-200 hover:bg-medical-50"
                    >
                      <span className="text-[13px] text-medical-600" aria-hidden>
                        ∞
                      </span>
                      Agent
                      <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {agentMenuOpen && (
                      <div className="absolute bottom-full left-0 z-20 mb-1 min-w-[180px] overflow-hidden rounded-xl border border-medical-100 bg-white py-1 shadow-lg ring-1 ring-medical-100/60">
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-medical-50"
                          onClick={() => setAgentMenuOpen(false)}
                        >
                          MediKeep Assistant
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-medical-50"
                          onClick={() => setAgentMenuOpen(false)}
                        >
                          General health Q&amp;A
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModelMenuOpen((o) => !o)
                        setAgentMenuOpen(false)
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-full border border-medical-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-gray-900 shadow-sm transition hover:bg-medical-50"
                      aria-expanded={modelMenuOpen}
                      aria-haspopup="listbox"
                    >
                      <span className="truncate text-medical-900">{selectedModelLabel}</span>
                      <svg className="h-3.5 w-3.5 shrink-0 text-medical-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 px-3 pb-3 pt-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message..."
                    disabled={loading || !hasDocuments}
                    className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-medical-500 focus:outline-none focus:ring-2 focus:ring-medical-500/20 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim() || !hasDocuments}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-medical-500 text-medical-500 transition hover:bg-medical-50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              <p className="pb-2.5 text-center text-[10px] text-gray-400">Powered by MediKeep</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
