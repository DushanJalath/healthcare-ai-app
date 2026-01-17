import axios from 'axios';
import { signOut } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper function to clear session and redirect to landing page
const clearSessionAndRedirect = async (redirectTo: string = '/') => {
  // Clear localStorage
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  
  // Sign out from NextAuth session
  await signOut({ redirect: false });
  
  // Redirect to landing page
  window.location.href = redirectTo;
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

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';
    
    // Handle 401 Unauthorized - clear session and redirect to login
    if (status === 401) {
      await clearSessionAndRedirect('/login');
      return Promise.reject(error);
    }
    
    // Handle 404 Not Found for patient-dashboard routes (patient profile not found)
    // Also handle 403 Forbidden (access denied)
    if ((status === 404 || status === 403) && requestUrl.includes('patient-dashboard')) {
      await clearSessionAndRedirect('/');
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

export default api;