import { NavLink, Outlet } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';

import { Button } from '@/components/ui/button';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { cn } from '@/lib/utils';
import { useMyProject } from '../hooks/useProject';

const TABS = [
  { to: '/project/overview', label: 'Overview' },
  { to: '/project/milestones', label: 'Milestones' },
  { to: '/project/submissions', label: 'Submissions' },
  { to: '/project/feedback', label: 'Feedback' },
  { to: '/project/activity', label: 'Activity' },
];

/**
 * §10.5 "My Project ▾" — the section shell: resolves the student's project
 * once (`['project','mine']`, shared by every child query), renders the
 * five tab links from §16.3's inventory and hands the rest to `<Outlet/>`.
 * No project at all is a legitimate state (pre-approval), so it explains
 * *why* instead of dead-ending.
 */
export default function ProjectLayout() {
  const project = useMyProject();

  if (project.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading your project…" />
      </div>
    );
  }

  if (project.isError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="Your project could not be loaded right now."
          onRetry={() => void project.refetch()}
        />
      </div>
    );
  }

  if (!project.data) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <EmptyState
          icon={<FolderKanban className="size-5" />}
          eyebrow="No active project"
          title="You don’t have a project yet"
          description="A project appears here as soon as your proposal is approved — then its milestones, submissions, feedback and activity live in this section."
          action={
            <>
              <Button asChild>
                <Linkish to="/proposals">Go to proposals</Linkish>
              </Button>
              <Button asChild variant="outline">
                <Linkish to="/dashboard">Dashboard</Linkish>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const project_ = project.data;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Home</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">My Project</span>
      </nav>

      <header className="mt-3">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          {project_.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project_.student
            ? `${project_.student.firstName} ${project_.student.lastName} · ${project_.status}`
            : project_.status}
        </p>
      </header>

      <nav
        aria-label="Project sections"
        className="mt-4 flex gap-1 overflow-x-auto border-b pb-px"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}

/** Tiny local link helper to keep the empty-state action terse. */
function Linkish({ to, children }: { to: string; children: React.ReactNode }) {
  return <NavLink to={to}>{children}</NavLink>;
}
