import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

/**
 * Route guard (spec §3):
 * - 'unknown'     → boot refresh still in flight: minimal spinner, no
 *                   redirect flicker;
 * - 'anonymous'   → /unauthorized, preserving the intended destination in
 *                   location.state.from;
 * - 'authenticated' → render.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const exitTo = useAuthStore((s) => s.exitTo);
  const location = useLocation();

  if (status === 'unknown') {
    return (
      <div className="min-h-screen grid place-items-center" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (status === 'anonymous') {
    return (
      <Navigate
        to={exitTo ?? '/unauthorized'}
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }

  return <>{children}</>;
}
