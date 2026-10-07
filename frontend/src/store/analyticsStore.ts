import { create } from 'zustand';
import { analyticsAPI } from '@/services/api';

interface AnalyticsStore {
  dashboardMetrics: any;
  trendData: any[];
  kpiData: any;
  loading: boolean;
  error: string | null;

  fetchDashboard: (days?: number) => Promise<void>;
  fetchTrends: (metric: string, days?: number) => Promise<void>;
  fetchKPI: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  dashboardMetrics: null,
  trendData: [],
  kpiData: null,
  loading: false,
  error: null,

  fetchDashboard: async (days = 30) => {
    set({ loading: true, error: null });
    try {
      const response = await analyticsAPI.getDashboard(days);
      set({ dashboardMetrics: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch dashboard',
        loading: false,
      });
    }
  },

  fetchTrends: async (metric, days = 30) => {
    set({ loading: true, error: null });
    try {
      const response = await analyticsAPI.getTrends(metric, days);
      set({ trendData: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch trends',
        loading: false,
      });
    }
  },

  fetchKPI: async () => {
    try {
      const response = await analyticsAPI.getKPI();
      set({ kpiData: response.data.data });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch KPI' });
    }
  },
}));