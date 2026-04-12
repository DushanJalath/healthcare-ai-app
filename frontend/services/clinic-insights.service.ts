import api from '@/utils/api'
import type {
  ClinicInsightsChatRequest,
  ClinicInsightsChatResponse,
} from '@/types'

/**
 * Clinic-level insights chat: aggregate answers only (no patient names).
 */
export async function sendClinicInsightsChat(
  body: ClinicInsightsChatRequest,
  accessToken: string
): Promise<ClinicInsightsChatResponse> {
  const payload = {
    question: body.question.trim(),
    chat_history: body.chat_history ?? [],
  }
  const { data } = await api.post<ClinicInsightsChatResponse>(
    '/clinic/insights/chat',
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 120_000,
    }
  )
  return data
}
