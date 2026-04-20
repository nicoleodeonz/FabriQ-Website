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

export interface AppointmentDetail {
  id: string;
  type: 'fitting' | 'consultation' | 'measurement' | 'pickup';
  date: string;
  time: string;
  branch: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  cancellationReason?: string;
  rescheduleReason?: string;
  selectedGown?: string;
  selectedGownName?: string;
}

export interface AdminAppointmentDetail extends AppointmentDetail {
  customerName: string;
  customerEmail: string;
  contactNumber: string;
}

export interface CreateAppointmentPayload {
  appointmentType: 'fitting' | 'consultation' | 'measurement' | 'pickup';
  date: string;
  time: string;
  branch: string;
  selectedGown?: string;
  notes?: string;
}

export interface AppointmentAvailabilityParams {
  date: string;
  branch: string;
  excludeId?: string;
}

export const appointmentAPI = {
  getMyAppointments: async (token: string): Promise<AppointmentDetail[]> => {
    const response = await fetch(`${API_BASE_URL}/appointments/mine`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to fetch appointments', body));
    }

    const data = await parseJsonSafe(response);
    return Array.isArray(data?.appointments) ? data.appointments : [];
  },

  createAppointment: async (token: string, payload: CreateAppointmentPayload): Promise<AppointmentDetail> => {
    const response = await fetch(`${API_BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to book appointment', body));
    }

    const data = await parseJsonSafe(response);
    if (!data?.appointment) {
      throw new Error('Failed to book appointment: empty server response.');
    }

    return data.appointment;
  },

  getBookedSlots: async (token: string, params: AppointmentAvailabilityParams): Promise<string[]> => {
    const searchParams = new URLSearchParams({
      date: params.date,
      branch: params.branch,
    });

    if (params.excludeId) {
      searchParams.set('excludeId', params.excludeId);
    }

    const response = await fetch(`${API_BASE_URL}/appointments/availability?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to fetch booked appointment slots', body));
    }

    const data = await parseJsonSafe(response);
    return Array.isArray(data?.bookedTimes) ? data.bookedTimes : [];
  },

  rescheduleAppointment: async (
    token: string,
    id: string,
    payload: { date: string; time: string; branch: string; reason: string }
  ): Promise<AppointmentDetail> => {
    const response = await fetch(`${API_BASE_URL}/appointments/${id}/reschedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to reschedule appointment', body));
    }

    const data = await parseJsonSafe(response);
    if (!data?.appointment) {
      throw new Error('Failed to reschedule appointment: empty server response.');
    }

    return data.appointment;
  },

  getAdminAppointments: async (token: string): Promise<AdminAppointmentDetail[]> => {
    const response = await fetch(`${API_BASE_URL}/appointments/admin`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to fetch admin appointments', body));
    }

    const data = await parseJsonSafe(response);
    return Array.isArray(data?.appointments) ? data.appointments : [];
  },

  updateAppointmentStatus: async (
    token: string,
    id: string,
    status: 'scheduled' | 'completed' | 'cancelled',
    reason?: string
  ): Promise<AdminAppointmentDetail> => {
    const response = await fetch(`${API_BASE_URL}/appointments/${id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, reason }),
    });

    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw new Error(getErrorMessage('Failed to update appointment status', body));
    }

    const data = await parseJsonSafe(response);
    if (!data?.appointment) {
      throw new Error('Failed to update appointment status: empty server response.');
    }

    return data.appointment;
  },
};