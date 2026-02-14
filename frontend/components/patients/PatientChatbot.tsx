import React, { useState, useRef, useEffect } from 'react'
import { RAGChatTurn } from '@/types'
import { sendRAGChat } from '@/services/rag.service'
import toast from 'react-hot-toast'

interface PatientChatbotProps {
  patientId: number
  accessToken: string
  /** Optional: show when patient has no documents indexed yet */
  hasDocuments?: boolean
}

export default function PatientChatbot({
  patientId,
  accessToken,
  hasDocuments = true,
}: PatientChatbotProps) {
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

  const handleSend = async () => {
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    const userTurn: RAGChatTurn = { role: 'user', content: question }
    setMessages((prev) => [...prev, userTurn])
    setLoading(true)

    try {
      const chatHistory: RAGChatTurn[] = [...messages, userTurn]
      const response = await sendRAGChat(
        patientId,
        {
          question,
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
    <div className="bg-white rounded-lg shadow flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
        <h3 className="text-lg font-semibold text-gray-900">
          Ask about your documents
        </h3>
        <p className="text-sm text-gray-600 mt-0.5">
          Answers are based only on your uploaded medical documents. This is not
          a substitute for professional medical advice.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            {hasDocuments ? (
              <>
                <div className="text-4xl mb-3">💬</div>
                <p className="font-medium text-gray-700">
                  Ask a question about your records
                </p>
                <p className="text-sm mt-1">
                  e.g. &quot;What were my latest lab results?&quot; or
                  &quot;Summarize my prescriptions.&quot;
                </p>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">📄</div>
                <p className="font-medium text-gray-700">
                  No documents indexed yet
                </p>
                <p className="text-sm mt-1">
                  Once your clinic uploads and processes documents for you,
                  you can ask questions here.
                </p>
              </>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-900 rounded-bl-md border border-gray-200'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-600 rounded-2xl rounded-bl-md px-4 py-2.5 border border-gray-200">
              <span className="flex items-center gap-2 text-sm">
                <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question..."
            disabled={loading || !hasDocuments}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim() || !hasDocuments}
            className="px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
