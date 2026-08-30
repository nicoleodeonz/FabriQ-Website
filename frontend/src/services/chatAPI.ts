import { API_BASE_URL } from './apiConfig';

async function parseJsonSafe(response: Response): Promise<any | null> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getErrorMessage(fallback: string, body: any | null): string {
  if (body && typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  return fallback;
}

export interface ChatMessageRecord {
  _id: string;
  id?: string;
  conversationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  sender: 'customer' | 'admin' | 'system';
  adminId?: string;
  adminName?: string;
  uid?: string;
  name?: string;
  chat?: string;
  time?: string;
  date?: string;
  text: string;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface AdminConversationSummary {
  conversationId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  unreadCount: number;
  lastMessageText: string;
  lastMessageAt: string | null;
}

export interface PostChatMessagePayload {
  customerId?: string;
  guestToken?: string;
  uid?: string;
  name?: string;
  chat?: string;
  text: string;
  time?: string;
  date?: string;
  sender?: 'customer' | 'admin';
}

export interface PostChatbotReplyPayload {
  conversationId?: string;
  customerId?: string;
  guestToken?: string;
  userQuery: string;
  uid?: string;
  name?: string;
  time?: string;
  date?: string;
}

export interface PostAdminReplyPayload {
  text: string;
  adminId?: string;
  adminName?: string;
}

export const chatAPI = {
  postChatMessage: async (payload: PostChatMessagePayload): Promise<{ message: ChatMessageRecord; conversationId: string }> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to send chat message', body));
    }
    return {
      message: (body as any)?.message as ChatMessageRecord,
      conversationId: String((body as any)?.conversationId || ''),
    };
  },

  getAdminUnreadCount: async (token: string): Promise<number> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages/admin/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to fetch unread count', body));
    }
    return Number((body as any)?.unreadCount || 0);
  },

  getAdminConversations: async (token: string): Promise<AdminConversationSummary[]> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages/admin/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to fetch conversations', body));
    }
    return (body as any)?.conversations || [];
  },

  getAdminConversationMessages: async (token: string, conversationId: string): Promise<ChatMessageRecord[]> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages/admin/conversations/${encodeURIComponent(conversationId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to fetch conversation messages', body));
    }
    return (body as any)?.messages || [];
  },

  postChatbotReply: async (payload: PostChatbotReplyPayload): Promise<{ message: ChatMessageRecord | null; conversationId: string; skipped?: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to get chatbot reply', body));
    }
    return {
      message: (body as any)?.message as ChatMessageRecord | null,
      conversationId: String((body as any)?.conversationId || ''),
      skipped: Boolean((body as any)?.skipped),
    };
  },

  postAdminReply: async (
    token: string,
    conversationId: string,
    payload: PostAdminReplyPayload,
  ): Promise<ChatMessageRecord> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages/admin/conversations/${encodeURIComponent(conversationId)}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to send reply', body));
    }
    return (body as any)?.message as ChatMessageRecord;
  },

  markAdminConversationOpen: async (token: string, conversationId: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages/admin/conversations/${encodeURIComponent(conversationId)}/open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to mark conversation as open', body));
    }
  },

  markAdminConversationClosed: async (token: string, conversationId: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/chat-messages/admin/conversations/${encodeURIComponent(conversationId)}/open`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to close conversation', body));
    }
  },
};
