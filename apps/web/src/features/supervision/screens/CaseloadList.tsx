import { Link } from 'react-router-dom';
import { ArrowRight, UsersRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { formatRelative } from '@/lib/utils/time';
import { useCaseload } from '../hooks/useSupervision';

/**
 * §16.3 "Assigned students" / plan 12.2 — `GET /supervisors/me/students`
 * rendered as **one card per student** (§6.2 I13: N students, never a
 * single-student assumption in layout or copy), drilling into the student's
 * project detail at `/supervision/:studentId`.
 */
export default function CaseloadList() {
  const caseload = useCaseload();

  if (caseload.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading your students…" />
      </div>
    );
  }

  if (caseload.isError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="Your caseload could not be loaded right now."
          onRetry={() => void caseload.refetch()}
        />
      </div>
    );
  }

  const { students, usedFallback } = caseload.data;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Assigned students
        </h1>
        <p className="text-sm text-muted-foreground">
          {students.length === 0
            ? 'One row per active assignment (I13).'
            : `${students.length} student${students.length === 1 ? '' : 's'} on your caseload.`}
        </p>
      </header>

      {usedFallback && (
        <div className="mt-4">
          <SampleDataBanner />
        </div>
      )}

      {students.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed bg-card p-8 text-center">
          <UsersRound className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-foreground">No students assigned yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Students appear here as soon as an administrator assigns you to them — then their
            project, stages and submissions are one click away.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {students.map((entry) => (
            <li key={entry.assignmentId}>
              <Link
                to={`/supervision/${entry.student.id}`}
                className="flex h-full flex-col gap-1.5 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {entry.student.firstName} {entry.student.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.student.email}
                    </p>
                  </div>
                  {entry.isPrimary && (
                    <Badge variant="outline" className="shrink-0 border-primary/30 text-primary">
                      Primary
                    </Badge>
                  )}
                </div>
                <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {entry.projectId ? 'Project assigned' : 'No project yet'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      assigned {formatRelative(entry.assignedAt)}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
