import { create } from 'zustand';
import { wasteAPI } from '@/services/api';

interface WasteRecord {
  id: number;
  date: string;
  foodItem: string;
  category: string;
  quantityWasted: number;
  quantityPrepared?: number;
  reason?: string;
  mealType: string;
}

interface WasteStore {
  records: WasteRecord[];
  loading: boolean;
  error: string | null;
  
  fetchRecords: (filters?: any) => Promise<void>;
  createRecord: (data: any) => Promise<void>;
  updateRecord: (id: number, data: any) => Promise<void>;
  deleteRecord: (id: number) => Promise<void>;
}

export const useWasteStore = create<WasteStore>((set) => ({
  records: [],
  loading: false,
  error: null,

  fetchRecords: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await wasteAPI.getRecords(filters);
      set({ records: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch records',
        loading: false,
      });
    }
  },

  createRecord: async (data) => {
    set({ loading: true, error: null });
    try {
      await wasteAPI.create(data);
      // Refetch records
      const filters = {};
      const response = await wasteAPI.getRecords(filters);
      set({ records: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to create record',
        loading: false,
      });
      throw error;
    }
  },

  updateRecord: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await wasteAPI.update(id, data);
      const filters = {};
      const response = await wasteAPI.getRecords(filters);
      set({ records: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to update record',
        loading: false,
      });
      throw error;
    }
  },

  deleteRecord: async (id) => {
    set({ loading: true, error: null });
    try {
      await wasteAPI.delete(id);
      const filters = {};
      const response = await wasteAPI.getRecords(filters);
      set({ records: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to delete record',
        loading: false,
      });
      throw error;
    }
  },
}));