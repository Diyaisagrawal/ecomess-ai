import { create } from 'zustand';
import { inventoryAPI } from '@/services/api';

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  minThreshold: number;
  maxThreshold: number;
}

interface InventoryStore {
  items: InventoryItem[];
  summary: any;
  alerts: any[];
  loading: boolean;
  error: string | null;

  fetchInventory: (category?: string) => Promise<void>;
  fetchSummary: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  createItem: (data: any) => Promise<void>;
  updateItem: (id: number, data: any) => Promise<void>;
  deleteItem: (id: number) => Promise<void>;
}

export const useInventoryStore = create<InventoryStore>((set) => ({
  items: [],
  summary: null,
  alerts: [],
  loading: false,
  error: null,

  fetchInventory: async (category) => {
    set({ loading: true, error: null });
    try {
      const response = await inventoryAPI.getAll(category);
      set({ items: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch inventory',
        loading: false,
      });
    }
  },

  fetchSummary: async () => {
    try {
      const response = await inventoryAPI.getSummary();
      set({ summary: response.data.data });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch summary' });
    }
  },

  fetchAlerts: async () => {
    try {
      const response = await inventoryAPI.getAlerts();
      set({ alerts: response.data.data });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch alerts' });
    }
  },

  createItem: async (data) => {
    set({ loading: true, error: null });
    try {
      await inventoryAPI.create(data);
      const response = await inventoryAPI.getAll();
      set({ items: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to create item',
        loading: false,
      });
      throw error;
    }
  },

  updateItem: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await inventoryAPI.update(id, data);
      const response = await inventoryAPI.getAll();
      set({ items: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to update item',
        loading: false,
      });
      throw error;
    }
  },

  deleteItem: async (id) => {
    set({ loading: true, error: null });
    try {
      await inventoryAPI.delete(id);
      const response = await inventoryAPI.getAll();
      set({ items: response.data.data, loading: false });
    } catch (error: any) {
      set({
        error: error.message || 'Failed to delete item',
        loading: false,
      });
      throw error;
    }
  },
}));