// API service for customer profile operations
const API_BASE_URL = '/api';

export const customerAPI = {
  // Get customer profile (authenticated)
  getCustomer: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/customers/profile`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) throw new Error('Failed to fetch customer');
    return response.json();
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

    return response.json();
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
  }
};