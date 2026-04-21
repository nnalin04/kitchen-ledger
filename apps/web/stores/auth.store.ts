import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Tenant } from '@kitchenledger/types';

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  setAuth: (user: User, tenant: Tenant, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken?: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tenant: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      setAuth: (user, tenant, accessToken, refreshToken) =>
        set({ user, tenant, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) =>
        set((s) => ({ accessToken, refreshToken: refreshToken ?? s.refreshToken })),
      clearAuth: () =>
        set({ user: null, tenant: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'kl-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        tenant: s.tenant,
      }),
    }
  )
);
