import type { FavoriteGown } from '../App';
import { API_BASE_URL } from './apiConfig';

// API service for customer profile operations

export interface CustomerProfileResponse {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: string | null;
  address?: string;
  preferredBranch?: string;
  favoriteGowns?: FavoriteGown[];
}

export const customerAPI = {
  // Get customer profile (authenticated)
  getCustomer: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/customers/profile`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch customer');
    return response.json() as Promise<CustomerProfileResponse>;
  },

  // Update customer profile (authenticated)
  updateCustomer: async (
    token: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber: string;
      address: string;
      preferredBranch: string;
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/customers/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      let message = 'Failed to update customer';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {
        // Keep default message if response body is not JSON.
      }
      throw new Error(message);
    }

    return response.json() as Promise<CustomerProfileResponse>;
  },

  updateFavoriteGowns: async (token: string, favoriteGowns: FavoriteGown[]) => {
    const response = await fetch(`${API_BASE_URL}/customers/favorites`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ favoriteGowns }),
    });

    if (!response.ok) {
      let message = 'Failed to save favorites';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {
        // Keep default message if response body is not JSON.
      }
      throw new Error(message);
    }

    return response.json() as Promise<{ favoriteGowns: FavoriteGown[] }>;
  },

  sendPhoneVerificationCode: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/customers/phone-verification/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      let message = 'Failed to send verification code';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {
        // Keep default message if response body is not JSON.
      }
      throw new Error(message);
    }

    return response.json() as Promise<{ message: string; phoneNumber: string }>;
  },

  verifyPhoneVerificationCode: async (token: string, code: string) => {
    const response = await fetch(`${API_BASE_URL}/customers/phone-verification/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      let message = 'Failed to verify phone number';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {
        // Keep default message if response body is not JSON.
      }
      throw new Error(message);
    }

    return response.json() as Promise<{ message: string; customer: CustomerProfileResponse }>;
  },

  getMeasurements: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/customers/measurements`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch measurements');
    return response.json();
  },

  updateMeasurements: async (
    token: string,
    data: {
      bust: number | null;
      waist: number | null;
      hips: number | null;
      height: number | null;
      shoulderWidth: number | null;
      sleeveLength: number | null;
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/customers/measurements`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      let message = 'Failed to save measurements';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {
        // Keep default message if response body is not JSON.
      }
      throw new Error(message);
    }
    return response.json();
  },

  // Create a new custom order (bespoke)
  createCustomOrder: async (token: string, data: {
    orderType: string;
    eventDate: string;
    preferredColors?: string;
    fabricPreference?: string;
    specialRequests?: string;
    budget?: string;
    branch?: string;
    designImageUrl?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/custom-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      let message = 'Failed to create custom order';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {}
      throw new Error(message);
    }
    return response.json();
  },

  updateCustomOrderConsultationSchedule: async (
    token: string,
    id: string,
    data: { consultationDate: string; consultationTime: string; consultationRescheduleReason?: string }
  ) => {
    const response = await fetch(`${API_BASE_URL}/custom-orders/${id}/consultation-schedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      let message = 'Failed to save consultation schedule';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {}
      throw new Error(message);
    }

    return response.json();
  },

  updateCustomOrderFittingSchedule: async (
    token: string,
    id: string,
    data: { fittingDate: string; fittingTime: string; fittingRescheduleReason?: string }
  ) => {
    const response = await fetch(`${API_BASE_URL}/custom-orders/${id}/fitting-schedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      let message = 'Failed to save fitting schedule';
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {}
      throw new Error(message);
    }

    return response.json();
  },

  // Get all custom orders for the authenticated customer
  getMyCustomOrders: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/custom-orders/my-orders`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch custom orders');
    return response.json();
  }
};