import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { RAGChatTurn } from '@/types'
import { sendRAGChat } from '@/services/rag.service'
import toast from 'react-hot-toast'

interface MediKeepChatWidgetProps {
  patientId: number
  accessToken: string
  hasDocuments?: boolean
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
}: MediKeepChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<RAGChatTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
        { question: text, chat_history: messages },
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
          {/* Header - Medikeep medical blue */}
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
                <span className="inline-block h-2 w-2 rounded-full bg-tech-400" />
                Online
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-white/90 hover:bg-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
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

            {/* Input area */}
            <div className="border-t border-gray-200 bg-white p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  disabled={loading || !hasDocuments}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-medical-500 focus:outline-none focus:ring-1 focus:ring-medical-500 disabled:bg-gray-100 disabled:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={loading || !input.trim() || !hasDocuments}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-medical-500 text-medical-500 transition hover:bg-medical-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-center text-xs text-gray-400">
                Powered by MediKeep
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
