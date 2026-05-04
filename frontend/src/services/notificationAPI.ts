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

export type NotificationType = 'rental' | 'appointment' | 'bespoke';

export interface CustomerNotificationEntry {
  id: string;
  type: NotificationType;
  status: string;
  title: string;
  message: string;
  itemLabel: string;
  date: string;
  dateType: string;
  time: string;
  location: string;
  metadata: {
    recordId?: string;
    customerId?: string;
    [key: string]: unknown;
  } | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface SendNotificationPayload {
  type: NotificationType;
  recordId: string;
  messageBody?: string;
  deliveryMethod?: 'sms' | 'email' | 'both';
}

export const notificationAPI = {
  getMyNotifications: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/notifications/mine`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to fetch notifications', body));
    }

    return (body as { notifications?: CustomerNotificationEntry[] })?.notifications || [];
  },

  markNotificationRead: async (token: string, id: string) => {
    const response = await fetch(`${API_BASE_URL}/notifications/mine/${id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to mark notification as read', body));
    }

    return (body as { notification?: CustomerNotificationEntry })?.notification || null;
  },

  sendNotification: async (token: string, payload: SendNotificationPayload) => {
    const response = await fetch(`${API_BASE_URL}/notifications/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(getErrorMessage('Failed to send notification', body));
    }

    return body;
  },
};