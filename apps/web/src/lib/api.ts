// ============================================================
// POS Yoga — API Client
// ============================================================

const API_BASE = '/api';
const BASE_URL = import.meta.env.PROD ? 'http://72.61.214.92:8080' : '';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

async function request<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let fullUrl = url.startsWith('/auth') 
    ? `${BASE_URL}${url}` 
    : `${BASE_URL}${API_BASE}${url}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    fullUrl += `?${searchParams}`;
  }

  const res = await fetch(fullUrl, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(url: string, params?: Record<string, string>) =>
    request<T>(url, { method: 'GET', params }),

  post: <T>(url: string, body?: any) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body) }),

  put: <T>(url: string, body?: any) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),

  patch: <T>(url: string, body?: any) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(url: string) =>
    request<T>(url, { method: 'DELETE' }),
};

// --- Auth API ---
export const authApi = {
  login: (email: string, password: string) =>
    request<any>('/auth/api/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string, role: string) =>
    request<any>('/auth/api/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    }),

  logout: () =>
    request<any>('/auth/api/sign-out', { method: 'POST' }),

  getSession: () =>
    request<any>('/auth/api/get-session', { method: 'GET' }),
};
