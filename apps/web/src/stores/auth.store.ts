// ============================================================
// POS Yoga — Auth Store (Zustand)
// Offline-resistant user session persistence
// ============================================================

import { create } from 'zustand';
import { authApi, api } from '../lib/api';
import type { Role } from '@pos-yoga/types';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: Role;
  image: string | null;
}

interface AuthState {
  user: UserData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const CACHED_USER_KEY = 'pos_yoga_cached_user_data';

function getCachedUser(): UserData | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const initialCachedUser = getCachedUser();

export const useAuthStore = create<AuthState>((set) => ({
  user: initialCachedUser,
  isLoading: true,
  isAuthenticated: !!initialCachedUser,

  login: async (email: string, password: string) => {
    await authApi.login(email, password);
    const res = await api.get<{ success: boolean; data: UserData }>('/me');
    if (res.data) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(res.data));
    }
    set({ user: res.data, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Server-side logout failed:', err);
      try {
        localStorage.removeItem('pos_yoga_session_token');
      } catch { /* ignore */ }
    } finally {
      localStorage.removeItem(CACHED_USER_KEY);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  checkSession: async () => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const cachedUser = getCachedUser();

    if (!isOnline && cachedUser) {
      set({ user: cachedUser, isAuthenticated: true, isLoading: false });
      return;
    }

    try {
      const res = await api.get<{ success: boolean; data: UserData }>('/me');
      if (res.data) {
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(res.data));
      }
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      if (cachedUser && (err.message?.includes('fetch') || err.message?.includes('network') || !navigator.onLine)) {
        console.warn('Network offline during checkSession, preserving cached user session');
        set({ user: cachedUser, isAuthenticated: true, isLoading: false });
      } else {
        localStorage.removeItem(CACHED_USER_KEY);
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    }
  },
}));
