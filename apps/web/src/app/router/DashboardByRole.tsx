import PendingScreen from '@/components/feedback/PendingScreen';
import CoordinatorDashboard from '@/features/dashboard/screens/CoordinatorDashboard';
import StudentDashboard from '@/features/dashboard/screens/StudentDashboard';
import SupervisorDashboard from '@/features/supervision/screens/SupervisorDashboard';
import { useAuthStore } from '@/stores/auth';

/**
 * §10.3 — "`/dashboard` resolving by role (rather than a fixed list)…
 * it keeps §16.5's promise that the dashboard answers 'where am I and what
 * do I do next' for every role."
 *
 * All three role dashboards ship: the administrator's coordinator dashboard,
 * the student's six-state dashboard (§16.2) and the supervisor's caseload
 * dashboard (plan 12.1).
 */
export default function DashboardByRole() {
  const role = useAuthStore((s) => s.user?.role);

  if (role === 'administrator') return <CoordinatorDashboard />;

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
