import { api, ApiError } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';

/**
 * One sign-out path for the whole console (was Sidebar-local): revoke the
 * refresh session, declare `/login` as the exit target *before* clearing, so
 * the anonymous guard's redirect and ours can only ever land on the same URL.
 *
 * `navigate` is optional — the shell passes its own; screens without one rely
 * on the guard's redirect (same outcome, one render later).
 */
export async function signOut(
  navigate?: (to: string, options?: { replace?: boolean }) => void,
): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    // The interceptor already turned 401/403 into their own redirect —
    // falling through to clear()+navigate would race it.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
    // The cookie may already be gone — local sign-out still proceeds.
  }
  useAuthStore.getState().setExitTo('/login');
  useAuthStore.getState().clear();
  navigate?.('/login', { replace: true });
}
