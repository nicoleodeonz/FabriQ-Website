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

export interface CreateRentalPayload {
  gownId: string;
  startDate: string;
  endDate: string;
  branch: string;
  eventType: string;
}

export interface RentalDetail {
  id: string;
  referenceId?: string;
  gownName: string;
  gownImage?: string | null;
  sku: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'for_payment' | 'paid_for_confirmation' | 'for_pickup' | 'active' | 'completed' | 'cancelled';
  totalPrice: number;
  downpayment: number;
  branch: string;
  eventType: string;
  paymentSubmittedAt?: string | null;
  paymentAmountPaid?: number | null;
  paymentReferenceNumber?: string | null;
  paymentReceiptUrl?: string | null;
  paymentReceiptFilename?: string | null;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  pickupScheduleDate?: string | null;
  pickupScheduleTime?: string | null;
}

export interface SubmitRentalPaymentPayload {
  referenceId: string;
  receiptFile: File;
}

export interface SchedulePickupPayload {
  pickupDate: string;
  pickupTime: string;
}

export interface RentalAvailabilityParams {
  gownId: string;
  startDate?: string;
  endDate?: string;
}

export interface RentalAvailabilityResponse {
  unavailableDates: string[];
  startDate: string | null;
  endDate: string | null;
}

export interface AdminRentalDetail extends RentalDetail {
  customerName: string;
  customerEmail: string;
  contactNumber: string;
}

export const rentalAPI = {
  getAvailability: async (token: string, params: RentalAvailabilityParams): Promise<RentalAvailabilityResponse> => {
    const searchParams = new URLSearchParams();
    searchParams.set('gownId', params.gownId);
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);

    const response = await fetch(`${API_BASE_URL}/rentals/availability?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to fetch rental availability', body));
    }

    const data = await parseJsonSafe(response);
    return {
      unavailableDates: Array.isArray(data?.unavailableDates) ? data.unavailableDates : [],
      startDate: typeof data?.startDate === 'string' ? data.startDate : null,
      endDate: typeof data?.endDate === 'string' ? data.endDate : null,
    };
  },

  getMyRentals: async (token: string): Promise<RentalDetail[]> => {
    const response = await fetch(`${API_BASE_URL}/rentals/mine`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to fetch rentals', body));
    }

    const data = await parseJsonSafe(response);
    return Array.isArray(data?.rentals) ? data.rentals : [];
  },

  createRental: async (token: string, payload: CreateRentalPayload): Promise<RentalDetail> => {
    const response = await fetch(`${API_BASE_URL}/rentals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to submit rental request', body));
    }

    const data = await parseJsonSafe(response);
    if (!data?.rental) {
      throw new Error('Failed to submit rental request: empty server response.');
    }
    return data.rental;
  },

  getAdminRentals: async (token: string): Promise<AdminRentalDetail[]> => {
    const response = await fetch(`${API_BASE_URL}/rentals/admin`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to fetch admin rentals', body));
    }

    const data = await parseJsonSafe(response);
    return Array.isArray(data?.rentals) ? data.rentals : [];
  },

  updateRentalStatus: async (
    token: string,
    id: string,
    status: 'for_payment' | 'paid_for_confirmation' | 'for_pickup' | 'active' | 'cancelled' | 'completed',
    reason?: string
  ): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/rentals/${id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, reason }),
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to update rental status', body));
    }
  },

  submitRentalPayment: async (
    token: string,
    id: string,
    payload: SubmitRentalPaymentPayload
  ): Promise<RentalDetail> => {
    const formData = new FormData();
    formData.append('referenceId', payload.referenceId);
    formData.append('receipt', payload.receiptFile);

    const response = await fetch(`${API_BASE_URL}/rentals/${id}/payment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to submit payment', body));
    }

    const data = await parseJsonSafe(response);
    if (!data?.rental) {
      throw new Error('Failed to submit payment: empty server response.');
    }
    return data.rental;
  },

  schedulePickup: async (
    token: string,
    id: string,
    payload: SchedulePickupPayload
  ): Promise<RentalDetail> => {
    const response = await fetch(`${API_BASE_URL}/rentals/${id}/pickup-schedule`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to schedule pickup', body));
    }

    const data = await parseJsonSafe(response);
    if (!data?.rental) {
      throw new Error('Failed to schedule pickup: empty server response.');
    }
    return data.rental;
  },
};
