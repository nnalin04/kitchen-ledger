import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retried) {
      error.config._retried = true;
      const { refreshToken, setTokens, clearAuth } = useAuthStore.getState();
      if (refreshToken) {
        try {
          const res = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/auth/refresh`,
            { refresh_token: refreshToken }
          );
          setTokens(res.data.data.access_token);
          error.config.headers.Authorization = `Bearer ${res.data.data.access_token}`;
          return apiClient(error.config);
        } catch {
          clearAuth();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
