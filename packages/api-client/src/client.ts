import axios, { AxiosInstance } from 'axios';

let _client: AxiosInstance | null = null;
let _getToken: (() => string | null) | null = null;
let _onUnauthorized: (() => void) | null = null;

export function initApiClient(config: {
  baseURL: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
}): AxiosInstance {
  _getToken = config.getToken;
  _onUnauthorized = config.onUnauthorized;

  _client = axios.create({
    baseURL: config.baseURL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  // Inject token on every request
  _client.interceptors.request.use((req) => {
    const token = _getToken?.();
    if (token) req.headers.Authorization = `Bearer ${token}`;
    return req;
  });

  // Auto-redirect on 401
  _client.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (error.response?.status === 401 && !error.config._retried) {
        error.config._retried = true;
        _onUnauthorized?.();
      }
      return Promise.reject(error);
    }
  );

  return _client;
}

export function getClient(): AxiosInstance {
  if (!_client) throw new Error('API client not initialized. Call initApiClient() first.');
  return _client;
}
