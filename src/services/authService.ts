const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v0';

export interface UserResponse {
  id: string;
  email: string;
  is_verified: boolean;
  role: string;
  created_at?: string;
  login_count?: number;
  feedback_triggers?: Record<string, boolean>;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch (error) {
      console.error('Failed to parse error response body:', error);
    }
    throw new Error(detail);
  }
  return response.json();
}

export const authService = {
  async checkStatus(): Promise<UserResponse | null> {
    try {
      return await request<UserResponse>('/auth/verify');
    } catch {
      return null;
    }
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(email: string, password: string, confirmPassword: string): Promise<void> {
    await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, confirm_password: confirmPassword }),
    });
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // Proceed with local cleanup even if the server request fails.
    }
  },

  async verifyEmail(token: string): Promise<void> {
    await request(`/auth/verify-email/${token}`, { method: 'GET' });
  },

  async resendVerification(email: string): Promise<void> {
    await request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(email: string): Promise<void> {
    await request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
};
