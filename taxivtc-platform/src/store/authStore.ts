import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'passenger' | 'driver' | 'operator' | 'admin';
  passenger?: { id: string };
  driver?: { id: string; status: string };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isHydrating: boolean;
  setAuth: (user: User, token: string) => void;
  hydrateSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isHydrating: true,
      setAuth: (user, token) => set({ user, token }),
      hydrateSession: async () => {
        try {
          const res = await fetch('/api/auth/me');
          if (!res.ok) {
            set({ user: null, token: null, isHydrating: false });
            return;
          }

          const user = await res.json();
          set((state) => ({
            user,
            token: state.token ?? 'session-cookie',
            isHydrating: false,
          }));
        } catch {
          set({ user: null, token: null, isHydrating: false });
        }
      },
      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch {
          // Ignore logout network errors and clear local session anyway.
        }
        set({ user: null, token: null, isHydrating: false });
      },
    }),
    {
      name: 'taxi-auth-storage',
    }
  )
);
