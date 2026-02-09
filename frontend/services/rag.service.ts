import api from '@/utils/api'
import type { RAGChatRequest, RAGChatResponse } from '@/types'

const RAG_TOP_K = 6

/**
 * Send a question to the patient RAG chat endpoint.
 * Uses the patient's indexed documents (vector store) to answer.
 * Requires the logged-in user to be the patient or have clinic access to that patient.
 */
export async function sendRAGChat(
  patientId: number,
  body: RAGChatRequest,
  accessToken: string
): Promise<RAGChatResponse> {
  const payload = {
    question: body.question.trim(),
    top_k: body.top_k ?? RAG_TOP_K,
    chat_history: body.chat_history ?? [],
  }
  const { data } = await api.post<RAGChatResponse>(
    `/patients/${patientId}/rag/chat`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  )
  return data
}
