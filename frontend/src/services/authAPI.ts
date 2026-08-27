import { API_BASE_URL } from './apiConfig';

interface AuthResponse {
  token: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    phoneNumber?: string;
    phoneVerified?: boolean;
    phoneVerifiedAt?: string | null;
    mustChangePassword?: boolean;
  };
}

interface PendingAuthResponse {
  message: string;
  email: string;
  expiresInMinutes: number;
  signupToken: string;
}

interface PhoneVerificationResponse {
  message: string;
  phoneNumber: string;
  verified: boolean;
  signupToken: string;
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
  signUp: async (payload: { firstName: string; lastName: string; email: string; password: string; phoneNumber?: string; signupToken: string }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(await parseError(response));
      }
      return (await response.json()) as PendingAuthResponse;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Unable to reach the signup service. Check the API URL and backend deployment.');
      }

      throw error;
    }
  },

  sendSignUpPhoneVerificationCode: async (payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phoneNumber: string;
    signupToken?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/auth/signup/phone/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    return (await response.json()) as PhoneVerificationResponse;
  },

  verifySignUpPhoneVerificationCode: async (payload: { email: string; code: string; signupToken: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/signup/phone/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await parseError(response));
    }
    return (await response.json()) as PhoneVerificationResponse;
  },

  verifySignUp: async (payload: { email: string; code: string; signupToken: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/signup/verify`, {
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

  logout: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return (await response.json()) as { message: string };
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
  },

  requestPasswordReset: async (payload: { email: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return (await response.json()) as PendingAuthResponse;
  },

  verifyPasswordResetCode: async (payload: { email: string; code: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return (await response.json()) as { message: string; verified: boolean };
  },

  resetPassword: async (payload: { email: string; code: string; newPassword: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return (await response.json()) as { message: string; requireReauth?: boolean };
  }
};
