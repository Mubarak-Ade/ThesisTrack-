import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getDashboard } from '../data';
import type { DashboardData } from '../data/types';
import QuickActions from '../components/QuickActions';
import RecentActivity from '../components/RecentActivity';
import {
  DepartmentProgressCard,
  ProjectProgressCard,
} from '../components/ProgressCards';
import TasksRail from '../components/TasksRail';
import WorkspaceTable from '../components/WorkspaceTable';

/**
 * Coordinator Dashboard (spec §5.1) — all figures come from `dashboardRepo`
 * (no dashboard endpoint exists; everything here is fixture-backed).
 */
export default function CoordinatorDashboard() {
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
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">Dashboard</span>
      </nav>

      <div className="mt-2">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Overview</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
          Coordinator Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Thesis projects, deadlines and student progress across the department.
        </p>
      </div>

      {!data ? (
        <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading dashboard…
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ProjectProgressCard project={data.project} />
            <DepartmentProgressCard department={data.department} />
          </div>

          {/* Workspace table + tasks/activity rail */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <WorkspaceTable rows={data.workspace} />
            </div>
            <div className="space-y-4">
              <TasksRail tasks={data.tasks} />
              <RecentActivity items={data.activity} />
            </div>
          </div>

          <QuickActions workspace={data.workspace} />
        </div>
      )}
    </div>
  );
}
