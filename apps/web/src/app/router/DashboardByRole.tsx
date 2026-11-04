import PendingScreen from '@/components/feedback/PendingScreen';
import OversightDashboard from '@/features/dashboard/screens/OversightDashboard';
import StudentDashboard from '@/features/dashboard/screens/StudentDashboard';
import SupervisorDashboard from '@/features/supervision/screens/SupervisorDashboard';
import { useAuthStore } from '@/stores/auth';

/**
 * §10.3 — "`/dashboard` resolving by role (rather than a fixed list)…
 * it keeps §16.5's promise that the dashboard answers 'where am I and what
 * do I do next' for every role."
 *
 * The super admin and a coordinator share the oversight dashboard (spec §5.1;
 * design 2026-11-02): its data probes are already scoped by the API, and the
 * screen derives its title/scope label from the session role.
 */
export default function DashboardByRole() {
  const role = useAuthStore((s) => s.user?.role);

  if (role === 'administrator' || role === 'coordinator') return <OversightDashboard />;

  if (role === 'student') return <StudentDashboard />;

  if (role === 'supervisor') {
    return <SupervisorDashboard />;
  }

  return (
    <PendingScreen
      title="Student dashboard"
      description="Where you are in the supervised lifecycle and the single next action — from welcome to an approved project."
    />
  );
}
