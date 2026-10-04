import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';
import RequireAuth from './RequireAuth';

interface RequireRoleProps {
  /** Roles allowed through — everything else bounces to /forbidden (§10.3). */
  roles: Role[];
  /**
   * Omit when used as a layout route: the matched child screens render in
   * the router Outlet, so a whole role-specific subtree is one guard.
   */
  children?: ReactNode;
}

/**
 * §10.3 route guard — "NEW. wraps role-specific subtrees; mismatch →
 * /forbidden". Composes RequireAuth rather than reimplementing it, so the
 * unknown-spinner and the anonymous → /unauthorized bounce (with
 * `location.state.from`) stay single-sourced and its tests keep passing:
 *
 * - 'unknown'        → RequireAuth's spinner;
 * - 'anonymous'      → RequireAuth's /unauthorized;
 * - wrong role       → /forbidden;
 * - right role       → children (or the Outlet subtree).
 */
export default function RequireRole({ roles, children }: RequireRoleProps) {
  const user = useAuthStore((s) => s.user);
  const allowed = user !== null && roles.includes(user.role);

  return (
    <RequireAuth>
      {allowed ? (children ?? <Outlet />) : <Navigate to="/forbidden" replace />}
    </RequireAuth>
  );
}
