// ============================================================
// POS Yoga — API Client
// ============================================================

const API_BASE = '/api';
const BASE_URL = import.meta.env.PROD ? 'http://72.61.214.92:8080' : '';

import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';

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

  // Build headers — only set Content-Type for requests that carry a body
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Only add Content-Type: application/json when there IS a body
  if (fetchOptions.body) {
    headers['Content-Type'] = 'application/json';
  }

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('Gagal mengonversi file ke base64'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
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

  downloadFile: async (url: string, defaultFilename: string): Promise<void> => {
    let fullUrl = `${BASE_URL}${API_BASE}${url}`;

    const headers: Record<string, string> = {};
    const token = getStoredToken();
    if (IS_NATIVE && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(fullUrl, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Gagal mengunduh berkas (HTTP ' + res.status + ')' }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }

    const blob = await res.blob();

    // Android Capacitor Native Download
    if (IS_CAPACITOR) {
      try {
        const base64Data = await blobToBase64(blob);
        const { Filesystem, Directory } = await import('@capacitor/filesystem');

        // Request permissions
        try { await Filesystem.requestPermissions(); } catch (_) {}

        // Write file to Documents directory
        const writeRes = await Filesystem.writeFile({
          path: defaultFilename,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        });

        toast.success(`File ${defaultFilename} berhasil diunduh!`);

        // Try opening native share sheet so user can view/open/save anywhere
        try {
          const { Share } = await import('@capacitor/share');
          const fileUri = writeRes.uri || (await Filesystem.getUri({ directory: Directory.Documents, path: defaultFilename })).uri;
          await Share.share({
            title: defaultFilename,
            text: 'File Excel Laporan POS Yoga',
            url: fileUri,
            dialogTitle: 'Buka atau Simpan File Excel',
          });
        } catch (shareErr) {
          console.warn('Capacitor share skipped/failed:', shareErr);
        }

        return;
      } catch (capErr: any) {
        console.error('Capacitor filesystem write failed:', capErr);
        toast.error('Gagal menyimpan file: ' + (capErr.message || 'Error lokal'));
      }
    }

    // Fallback for Web Browser & Tauri Desktop
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    a.remove();
  },
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
