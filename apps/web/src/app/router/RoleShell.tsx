import ConsoleLayout from '@/app/layouts/ConsoleLayout';
import { navForRole } from '@/app/layouts/console/nav';
import { useStudentNavState } from '@/app/layouts/console/useShellQueries';
import { useAuthStore } from '@/stores/auth';

/**
 * §10.3 — "NEW. picks layout + nav by role". Mounts inside RequireAuth (the
 * route table wraps one in the other), so a session always exists; a missing
 * user falls back to the least-privileged nav — student, pre-approval.
 *
 * Student navigation is state-dependent (§10.5): "My Project ▾" only appears
 * once a project exists or a proposal is approved, resolved from
 * `GET /proposals` + `GET /projects` through TanStack Query (§10.4).
 */
export default function RoleShell() {
  const role = useAuthStore((s) => s.user?.role) ?? 'student';
  const studentApproved = useStudentNavState(role === 'student');

  return <ConsoleLayout nav={navForRole(role, { studentApproved })} />;
}
