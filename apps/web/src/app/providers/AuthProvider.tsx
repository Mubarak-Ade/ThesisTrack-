import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAuthRedirectHandler } from '@/lib/api/http';
import type { LoginResponse, PublicUser } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';

/**
 * Boot sequence (spec §6): POST /auth/refresh → GET /auth/me once per page
 * load, then flip status from 'unknown' to 'authenticated' | 'anonymous'.
 * A module-level promise keeps React StrictMode's double-mount (and HMR)
 * from firing a second refresh — refresh tokens are single-use.
 */
let bootPromise: Promise<void> | null = null;

async function boot(): Promise<void> {
  try {
    const session = await api.post<LoginResponse>('/auth/refresh');
    const me = await api.get<{ user: PublicUser }>('/auth/me');
    useAuthStore.getState().setSession(me.user, session.accessToken);
  } catch {
    useAuthStore.getState().clear();
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    // Interceptors fire outside the React tree — give them SPA navigation.
    setAuthRedirectHandler((to) => navigate(to, { replace: true }));
    bootPromise ??= boot();
  }, [navigate]);

  return <>{children}</>;
}

/** Test hook: lets each test re-run the boot sequence. */
export function resetAuthBoot(): void {
  bootPromise = null;
}
