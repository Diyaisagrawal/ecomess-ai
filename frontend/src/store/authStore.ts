import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface AuthStore {
  // State
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  register: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
  setUser: (user: User) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      // Register
      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_URL}/auth/register`, {
            email,
            password,
            name,
          });

          const { user, token, refreshToken } = response.data.data;

          set({
            user,
            token,
            refreshToken,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.error || 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      // Login
      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_URL}/auth/login`, {
            email,
            password,
          });

          const { user, token, refreshToken } = response.data.data;

          set({
            user,
            token,
            refreshToken,
            isLoading: false,
          });
        } catch (error: any) {
          set({
            error: error.response?.data?.error || 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      // Logout
      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          error: null,
        });
      },

      // Refresh token
      refreshAccessToken: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) throw new Error('No refresh token');

        try {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          const { token, refreshToken: newRefreshToken } = response.data.data;

          set({
            token,
            refreshToken: newRefreshToken,
          });
        } catch (error) {
          // If refresh fails, logout user and let the caller redirect
          set({
            user: null,
            token: null,
            refreshToken: null,
          });
          throw error;
        }
      },

      // Set user
      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'auth-store', // localStorage key
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
      }),
    }
  )
);