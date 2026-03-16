const API_BASE_URL = '/api';

interface AuthResponse {
  token: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    phoneNumber?: string;
  };
}

const parseError = async (response: Response) => {
  let message = 'An unexpected error occurred.';
  try {
    const data = await response.json();
    if (data && data.message) message = data.message;
  } catch {
    // ignore
  }
  return message;
};

export const authAPI = {
  signUp: async (payload: { firstName: string; lastName: string; email: string; password: string; phoneNumber: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    return (await response.json()) as AuthResponse;
  },

  login: async (payload: { email: string; password: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    return (await response.json()) as AuthResponse;
  },

  getMe: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error('Failed to fetch current user.');
    }
    return (await response.json()) as { user: AuthResponse['user'] };
  },

  changePassword: async (
    token: string,
    payload: { currentPassword: string; newPassword: string }
  ) => {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Current password is incorrect.');
      }
      throw new Error(await parseError(response));
    }

    return (await response.json()) as { message: string; requireReauth?: boolean };
  }
};
