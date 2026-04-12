import axios, { AxiosError } from 'axios';
import { forceBrowserLogoutToLogin } from '@/utils/auth-cleanup';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const REFRESH_TIMEOUT_MS = 10_000;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Wait for the ongoing refresh to complete
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        void forceBrowserLogoutToLogin();
        return Promise.reject(error);
      }

      isRefreshing = true;

      try {
        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' }, timeout: REFRESH_TIMEOUT_MS }
        );
        const { access_token } = response.data;
        if (access_token) {
          localStorage.setItem('access_token', access_token);
          processQueue(null, access_token);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        }
        const staleError = new AxiosError(
          'Refresh response missing access_token',
          'ERR_BAD_RESPONSE',
          originalRequest,
          undefined,
          response
        );
        processQueue(staleError, null);
        void forceBrowserLogoutToLogin();
        return Promise.reject(staleError);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        void forceBrowserLogoutToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;