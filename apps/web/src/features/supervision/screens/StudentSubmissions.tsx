import { Link } from 'react-router-dom';
import { ArrowRight, Inbox } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/time';
import { SUBMISSION_STYLE } from '../components/chips';
import { useStudentContext } from './StudentDetail';
import { useSubmissions } from '../hooks/useSupervision';

/**
 * §16.3 Submissions (supervisor side) / plan 12.4 — every version the
 * student has sent, each row drilling into the review screen where the
 * decision (§11.6) is recorded.
 */
export default function StudentSubmissions() {
  const { entry } = useStudentContext();
  const projectId = entry.projectId!;
  const submissions = useSubmissions(projectId);

  if (submissions.isPending) return <LoadingState label="Loading submissions…" />;
  if (submissions.isError) {
    return (
      <ErrorState
        message="Submissions could not be loaded right now."
        onRetry={() => void submissions.refetch()}
      />
    );
  }

  const rows = [...submissions.data].sort((a, b) =>
    String(b.submittedAt ?? b.updatedAt).localeCompare(String(a.submittedAt ?? a.updatedAt)),
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-5" />}
        eyebrow="No submissions"
        title="Nothing submitted yet"
        description="Work appears here the moment the student sends a version — then you can download it and record a decision."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Submissions</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} row{rows.length === 1 ? '' : 's'} — open one to download the version and
          decide (§11.6).
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const style = SUBMISSION_STYLE[row.status];
          return (
            <li key={row.id}>
              <Link
                to={`/supervision/${entry.student.id}/submissions/${row.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                    <Badge variant="outline" className={cn(style.className)}>
                      {style.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.submittedAt
                      ? `submitted ${formatRelative(row.submittedAt)}`
                      : `updated ${formatRelative(row.updatedAt)}`}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
