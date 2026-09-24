import { create } from 'zustand';
import type { PublicUser } from '@/lib/api/http';

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

interface AuthState {
  /** null until a session exists (never exposes password fields). */
  user: PublicUser | null;
  /** 'unknown' while the boot-time refresh is still in flight (spec §6). */
  status: AuthStatus;
  /** In-memory only — never persisted; the refresh cookie is the truth. */
  accessToken: string | null;
  /**
   * Where an in-progress exit should land. The anonymous route guard fires
   * in a later render than the redirect it races (sign-out / session
   * failure), so its default /unauthorized would otherwise win; declaring
   * the target first makes both actors land on the same URL. null = default.
   */
  exitTo: string | null;
  setExitTo: (to: string | null) => void;
  setSession: (user: PublicUser, accessToken: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',
  accessToken: null,
  exitTo: null,
  setExitTo: (to) => set({ exitTo: to }),
  setSession: (user, accessToken) =>
    set({ user, accessToken, status: 'authenticated', exitTo: null }),
  clear: () => set({ user: null, accessToken: null, status: 'anonymous' }),
}));
