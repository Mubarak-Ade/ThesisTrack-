import type { ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Any /invite/* route that needs a token renders only when `?token=` is
 * present; otherwise the link is malformed → /login (spec §3).
 */
export default function InviteTokenGuard({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();

  if (!params.get('token')) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
