import { create } from 'zustand';
import type { PublicUser } from '../lib/http';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

interface AuthState {
  /** null until a session exists (never exposes password fields). */
  user: PublicUser | null;
  /** 'unknown' while the boot-time refresh is still in flight (spec §6). */
  status: AuthStatus;
  /** In-memory only — never persisted; the refresh cookie is the truth. */
  accessToken: string | null;
  setSession: (user: PublicUser, accessToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',
  accessToken: null,
  setSession: (user, accessToken) => set({ user, accessToken, status: 'authenticated' }),
  clear: () => set({ user: null, accessToken: null, status: 'anonymous' }),
}));
