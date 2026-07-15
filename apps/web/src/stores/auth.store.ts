// ============================================================
// POS Yoga — Auth Store (Zustand)
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    await authApi.login(email, password);
    // Fetch user data after login
    const res = await api.get<{ success: boolean; data: UserData }>('/me');
    set({ user: res.data, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Server-side logout failed:', err);
      // Ensure token is cleared locally anyway
      try {
        localStorage.removeItem('pos_yoga_session_token');
      } catch { /* ignore */ }
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  checkSession: async () => {
    try {
      const res = await api.get<{ success: boolean; data: UserData }>('/me');
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
