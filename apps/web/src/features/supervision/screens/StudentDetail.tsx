import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, ScrollText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { formatRelative } from '@/lib/utils/time';
import type { CaseloadStudent } from '../data/types';
import { useCaseload } from '../hooks/useSupervision';

/** What every `/supervision/:studentId/*` tab receives from the shell. */
export interface StudentContextValue {
  entry: CaseloadStudent;
}

/** Reader for the tabs — typed by the shell, never re-fetched. */
export function useStudentContext(): StudentContextValue {
  return useOutletContext<StudentContextValue>();
}

const TABS = (studentId: string) => [
  { to: `/supervision/${studentId}/overview`, label: 'Overview' },
  { to: `/supervision/${studentId}/milestones`, label: 'Milestones' },
  { to: `/supervision/${studentId}/submissions`, label: 'Submissions' },
  { to: `/supervision/${studentId}/feedback`, label: 'Feedback' },
];

/**
 * §16.3 "Student/project details" / plan 12.2 — the caseload drill-in:
 * resolves the assignment from the shared caseload query, renders the
 * student's identity, then four tabs (Overview · Milestones · Submissions ·
 * Feedback) mirroring My Project's structure for the supervisor's side of
 * §16.5. A student without a project (ADR-13) is a legitimate state, so it
 * explains *why* instead of dead-ending (§3.4's convention).
 */
export default function StudentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const caseload = useCaseload();

  if (caseload.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading this student…" />
      </div>
    );
  }

  if (caseload.isError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="This student could not be loaded right now."
          onRetry={() => void caseload.refetch()}
          action={
            <Button asChild variant="outline">
              <Link to="/supervision">Back to students</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const entry = caseload.data.students.find((row) => row.student.id === studentId);

  if (!entry) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          title="Not on your caseload"
          message="Only students assigned to you appear here — the list may have changed since you followed the link."
          action={
            <Button asChild variant="outline">
              <Link to="/supervision">Back to students</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const student = entry.student;
  const name = `${student.firstName} ${student.lastName}`;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/supervision" className="hover:text-foreground">
          Students
        </Link>
        <span aria-hidden="true">›</span>
        <span className="truncate text-foreground">{name}</span>
      </nav>

      <header className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">{name}</h1>
          {entry.isPrimary && (
            <Badge variant="outline" className="border-primary/30 text-primary">
              Primary supervisor
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {student.email} · assigned {formatRelative(entry.assignedAt)}
        </p>
        <div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/supervision">
              <ArrowLeft aria-hidden="true" /> Back to students
            </Link>
          </Button>
        </div>
      </header>

      {!entry.projectId ? (
        <div className="mt-6 rounded-xl border border-dashed bg-card p-8 text-center">
          <ScrollText className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-foreground">
            {student.firstName} has no project yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            The tracker starts when a proposal is approved — until then their proposal lives in
            Proposals, and milestones, submissions and feedback arrive with the project.
          </p>
          <div className="mt-4 flex justify-center">
            <Button asChild variant="outline">
              <Link to="/proposals">
                <ScrollText aria-hidden="true" /> Go to proposals
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Student project sections"
            className="mt-5 flex gap-1 overflow-x-auto border-b"
          >
            {TABS(student.id).map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                role="tab"
                className={({ isActive }) =>
                  `-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>

          <div className="mt-5">
            <Outlet context={{ entry } satisfies StudentContextValue} />
          </div>
        </>
      )}
    </div>
  );
}
