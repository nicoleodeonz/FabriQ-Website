import { API_BASE_URL } from './apiConfig';

export type ChatAnalyticsGranularity = 'daily' | 'weekly' | 'monthly';
export interface ChatAnalyticsEntry { label: string; count: number; percentage?: number; }
export interface ChatSentimentEntry { date: string; positive: number; neutral: number; negative: number; }
export interface ChatAnalyticsResponse {
  summary: { totalConversations: number; totalCustomerMessages: number; mostCommonIntent: string; mostDiscussedProduct: string; positiveSentimentPercentage: number; peakChatHour: string };
  topics: ChatAnalyticsEntry[];
  intents: ChatAnalyticsEntry[];
  sentimentOverTime: ChatSentimentEntry[];
  sentimentSummary: { positivePercentage: number; neutralPercentage: number; negativePercentage: number };
  discussedProducts: Array<{ productId: string; productName: string; mentions: number }>;
  conversationLength: ChatAnalyticsEntry[];
  peakChatHours: Array<{ hour: string; count: number }>;
}

export async function getChatBehaviorAnalytics(
  token: string,
  options: { startDate?: string; endDate?: string; granularity?: ChatAnalyticsGranularity } = {},
): Promise<ChatAnalyticsResponse> {
  const params = new URLSearchParams();
  if (options.startDate) params.set('startDate', options.startDate);
  if (options.endDate) params.set('endDate', options.endDate);
  if (options.granularity) params.set('granularity', options.granularity);
  const response = await fetch(`${API_BASE_URL}/analytics/chat-behavior?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Failed to load chat behavior analytics.');
  return data as ChatAnalyticsResponse;
}