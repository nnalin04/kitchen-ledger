import { create } from 'zustand';
import { apiClient } from '../lib/api/client';
import { storeTokens, getTokens, clearTokens } from '../lib/storage';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Tenant {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tenant: null,
  accessToken: null,
  isLoading: false,
  isAuthenticated: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await apiClient.post('/api/auth/login', { email, password });
      await storeTokens(data.access_token, data.refresh_token);
      set({
        user: data.user,
        tenant: data.tenant,
        accessToken: data.access_token,
        isAuthenticated: true,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch {}
    await clearTokens();
    set({ user: null, tenant: null, accessToken: null, isAuthenticated: false });
  },

  refreshToken: async () => {
    const tokens = await getTokens();
    if (!tokens) return;

    const { data } = await apiClient.post('/api/auth/refresh', {
      refresh_token: tokens.refreshToken,
    });
    await storeTokens(data.access_token, data.refresh_token);
    set({ accessToken: data.access_token });
  },

  hydrateFromStorage: async () => {
    set({ isLoading: true });
    try {
      const tokens = await getTokens();
      if (!tokens) return;

      const { data } = await apiClient.get('/api/auth/me');
      set({
        user: data.user,
        tenant: data.tenant,
        accessToken: tokens.accessToken,
        isAuthenticated: true,
      });
    } catch {
      await clearTokens();
    } finally {
      set({ isLoading: false });
    }
  },
}));
