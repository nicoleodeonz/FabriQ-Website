import { API_BASE_URL } from './apiConfig';

export type AdminCustomOrderStatus = 'inquiry' | 'design-approval' | 'in-progress' | 'fitting' | 'completed' | 'rejected';

export interface AdminCustomOrderRecord {
  _id?: string;
  id?: string;
  referenceId?: string;
  customerId?: string;
  customerName: string;
  contactNumber?: string;
  email?: string;
  orderType: string;
  eventDate?: string;
  preferredColors?: string;
  fabricPreference?: string;
  specialRequests?: string;
  budget?: string;
  branch?: string;
  consultationDate?: string | null;
  consultationTime?: string | null;
  consultationRescheduleReason?: string | null;
  fittingDate?: string | null;
  fittingTime?: string | null;
  fittingRescheduleReason?: string | null;
  rejectionReason?: string | null;
  status: AdminCustomOrderStatus;
  designImageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(defaultMessage: string, body: unknown) {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return defaultMessage;
}

export const adminCustomOrderAPI = {
  getAllCustomOrders: async (token: string): Promise<AdminCustomOrderRecord[]> => {
    const response = await fetch(`${API_BASE_URL}/custom-orders`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to fetch all custom orders', body));
    }

    const data = await parseJsonSafe(response);
    return Array.isArray(data) ? data : [];
  },

  updateCustomOrderStatus: async (
    token: string,
    id: string,
    status: AdminCustomOrderStatus,
    reason?: string,
  ): Promise<AdminCustomOrderRecord> => {
    const response = await fetch(`${API_BASE_URL}/custom-orders/${id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status, reason })
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to update custom order status', body));
    }

    const data = await parseJsonSafe(response);
    if (!data?.order) {
      throw new Error('Failed to update custom order status: empty server response.');
    }

    return data.order as AdminCustomOrderRecord;
  }
};
