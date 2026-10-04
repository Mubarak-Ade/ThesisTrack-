/**
 * Settings repository (§10.4): the only data import site for the Settings
 * screen. The profile read is live (`GET /auth/me`); the local session store
 * answers as the fallback because it *is* the last known session state, not a
 * fixture. The password-reset write always surfaces errors (Rule 3).
 */
import { api, ApiError, type PublicUser } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';

function warn(scope: string, error: unknown): void {
  console.warn(`[settingsRepo] ${scope}: falling back to the session copy —`, error);
}

/** Live profile (keeps `program`/`registrationNumber` fresh); store on error. */
export async function getProfile(): Promise<{ user: PublicUser; usedFallback: boolean }> {
  try {
    const payload = await api.get<{ user?: unknown }>('/auth/me');
    const u = payload?.user as PublicUser | undefined;
    if (!u || typeof u.id !== 'string') throw new Error('malformed /auth/me');
    return { user: u, usedFallback: false };
  } catch (error) {
    warn('getProfile', error);
    const local = useAuthStore.getState().user;
    if (!local) throw error instanceof ApiError ? error : new Error('No session profile');
    return { user: local, usedFallback: true };
  }
}

/** POST /auth/forgot-password — generic by design; returns the server message. */
export async function sendPasswordReset(email: string): Promise<string> {
  const payload = await api.post<{ message?: unknown }>('/auth/forgot-password', { email });
  return typeof payload?.message === 'string'
    ? payload.message
    : 'If an account exists for that email, a password reset link has been sent.';
}
