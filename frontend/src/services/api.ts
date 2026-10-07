import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await useAuthStore.getState().refreshAccessToken();
        const token = useAuthStore.getState().token;
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

// Waste API
export const wasteAPI = {
  create: (data: any) => api.post('/waste', data),
  getRecords: (filters: any) => api.get('/waste', { params: filters }),
  getStats: (startDate: string, endDate: string) => 
    api.get(`/waste/stats/${startDate}/${endDate}`),
  update: (id: number, data: any) => api.put(`/waste/${id}`, data),
  delete: (id: number) => api.delete(`/waste/${id}`),
};

// Inventory API
export const inventoryAPI = {
  create: (data: any) => api.post('/inventory', data),
  getAll: (category?: string) => 
    api.get('/inventory', { params: { category } }),
  getById: (id: number) => api.get(`/inventory/${id}`),
  update: (id: number, data: any) => api.put(`/inventory/${id}`, data),
  delete: (id: number) => api.delete(`/inventory/${id}`),
  getAlerts: () => api.get('/inventory/alerts/summary'),
  getSummary: () => api.get('/inventory/summary/overview'),
};

// Analytics API
export const analyticsAPI = {
  getDashboard: (days?: number) => 
    api.get('/analytics/dashboard', { params: { days } }),
  getTrends: (metric: string, days?: number) => 
    api.get(`/analytics/trends/${metric}`, { params: { days } }),
  getKPI: () => api.get('/analytics/kpi/today'),
};

// Attendance API
export const attendanceAPI = {
  create: (data: { date: string; count: number; mealType: string; notes?: string }) =>
    api.post('/attendance', data),
  getRecords: (params: any) => api.get('/attendance', { params }),
  getStats: (startDate: string, endDate: string) =>
    api.get('/attendance/stats/range', { params: { startDate, endDate } }),
  getTrends: (metric: 'attendance' | 'waste', days?: number) =>
    api.get(`/analytics/trends/${metric}`, { params: { days } }),
};

// Prediction / ML API
export const predictionAPI = {
  forecastWeek: (mealType: string) =>
    api.get('/predictions/forecast/week', { params: { mealType } }),
  predict: (kind: 'attendance' | 'demand' | 'waste', date: string, mealType: string) =>
    api.post(`/predictions/${kind}`, { date, mealType }),
  models: () => api.get('/predictions/models'),
  recommendations: () => api.get('/predictions/recommendations'),
  accuracy: (type: string, days = 30) =>
    api.get(`/predictions/accuracy/${type}`, { params: { days } }),
  trainTrigger: () => api.post('/predictions/train/trigger'),
  trainStatus: (jobId: string) => api.get(`/predictions/train/status/${jobId}`),
};

export const getErrorMessage = (error: any, fallback = 'Something went wrong') =>
  error?.response?.data?.error || error?.message || fallback;

export default api;