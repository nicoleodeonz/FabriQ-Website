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

export const notificationAPI = {
  sendNotification: async (token: string, payload: { type: NotificationType; recordId: string }) => {
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
      throw new Error(getErrorMessage('Failed to send notification email', body));
    }

    return body;
  },
};