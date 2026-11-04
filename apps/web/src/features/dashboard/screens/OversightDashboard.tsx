import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { useAuthStore } from '@/stores/auth';
import { getDashboard } from '../data';
import type { DashboardData } from '../data/types';
import { exportWorkspaceCsv } from '../lib/exportWorkspace';
import QuickActions from '../components/QuickActions';
import RecentActivity from '../components/RecentActivity';
import {
  DepartmentProgressCard,
  ProjectProgressCard,
} from '../components/ProgressCards';
import TasksRail from '../components/TasksRail';
import WorkspaceTable from '../components/WorkspaceTable';

/**
 * Oversight Dashboard (spec §5.1) — shared by the super admin (institution
 * wide) and a coordinator (their department, design 2026-11-02). All figures
 * come from `dashboardRepo` (live API first; fixture fallback announces
 * itself via SampleDataBanner), and every probe is already role-scoped by the
 * API. Only the chrome differs: title, breadcrumb and scope label.
 */
export default function OversightDashboard() {
  const user = useAuthStore((s) => s.user);
  const isCoordinator = user?.role === 'coordinator';
  const title = isCoordinator ? 'Coordinator Dashboard' : 'Super Admin Dashboard';
  const breadcrumb = isCoordinator ? 'Coordinator' : 'Super Admin';
  const scope = isCoordinator
    ? (user?.department?.name ?? 'Your department')
    : 'All departments';

  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let alive = true;
    void getDashboard().then((next) => {
      if (alive) setData(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Breadcrumb (spec §3): ADMIN › DASHBOARD */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>{breadcrumb}</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Dashboard</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Scope: {scope}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => data && exportWorkspaceCsv(data.workspace)}
            disabled={!data}
          >
            Export Data
          </Button>
        </div>
      </header>

      {!data ? (
        <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading dashboard…
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Fixture fallback announces itself (§10.4). */}
          {data.usedFallback && <SampleDataBanner />}
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ProjectProgressCard project={data.project} />
            <DepartmentProgressCard department={data.department} />
          </div>

          {/* Workspace table | Tasks rail */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <WorkspaceTable rows={data.workspace} total={data.workspaceTotal} />
            </div>
            <div className="min-w-0">
              <TasksRail tasks={data.tasks} />
            </div>
          </div>

          {/* Recent Activity | Quick Actions */}
          <div className="grid gap-4 lg:grid-cols-2">
            <RecentActivity items={data.activity} />
            <QuickActions actions={data.quickActions} workspace={data.workspace} />
          </div>
        </div>
      )}
    </div>
  );
}
