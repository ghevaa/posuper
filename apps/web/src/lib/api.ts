// ============================================================
// POS Yoga — API Client
// ============================================================

const API_BASE = '/api';
const BASE_URL = import.meta.env.PROD ? 'http://72.61.214.92:8080' : '';

import { Capacitor } from '@capacitor/core';

// --- Native Platform Detection & Token Management ---
// Cookies don't reliably work cross-origin in Tauri or Android/iOS WebView (Capacitor),
// so we use Bearer token auth for both instead of relying on cookies.
const IS_TAURI = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
const IS_CAPACITOR = Capacitor.isNativePlatform();
const IS_NATIVE = IS_TAURI || IS_CAPACITOR;
const TOKEN_KEY = 'pos_yoga_session_token';

function getStoredToken(): string | null {
  if (!IS_NATIVE) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch { /* ignore */ }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

// --- Fetch Options ---
interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

// --- Core Request Function ---
async function request<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let fullUrl = url.startsWith('/auth') 
    ? `${BASE_URL}${url}` 
    : `${BASE_URL}${API_BASE}${url}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    fullUrl += `?${searchParams}`;
  }

  // Build headers — add Bearer token when in Tauri
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  const token = getStoredToken();
  if (IS_NATIVE && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// --- API Client ---
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
  login: async (email: string, password: string) => {
    const res = await request<any>('/auth/api/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // In Tauri, store session token for Bearer auth (cookies don't work cross-origin)
    if (IS_NATIVE && res?.session?.token) {
      setStoredToken(res.session.token);
    } else if (IS_NATIVE && res?.token) {
      setStoredToken(res.token);
    }
    return res;
  },

  register: (name: string, email: string, password: string, role: string) =>
    request<any>('/auth/api/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    }),

  logout: async () => {
    const res = await request<any>('/auth/api/sign-out', { method: 'POST' });
    if (IS_NATIVE) clearStoredToken();
    return res;
  },

  getSession: () =>
    request<any>('/auth/api/get-session', { method: 'GET' }),
};
