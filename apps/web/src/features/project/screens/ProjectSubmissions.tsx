import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/time';
import type { SubmissionStatus } from '../data/types';
import { useMyProject, useSubmissions } from '../hooks/useProject';

const STATUS_STYLE: Record<SubmissionStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-border bg-surface-alt text-muted-foreground' },
  submitted: { label: 'Submitted', className: 'border-primary/30 bg-primary/10 text-primary' },
  under_review: {
    label: 'Under review',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  revision_required: {
    label: 'Revision required',
    className: 'border-warning/40 bg-warning-bg text-warning',
  },
  approved: { label: 'Approved', className: 'border-success/40 bg-success-bg text-success' },
  rejected: { label: 'Rejected', className: 'border-danger/40 bg-danger-bg text-danger' },
};

/**
 * §16.3 Submissions — the work list with one visual status language (the
 * chip set mirrors §16.2's proposal states so a revision-required reads the
 * same everywhere). Row → detail; the primary action starts the composer.
 */
export default function ProjectSubmissions() {
  const projectId = useMyProject().data?.id;
  const submissions = useSubmissions(projectId);

  if (submissions.isPending) return <LoadingState label="Loading submissions…" />;
  if (submissions.isError) {
    return (
      <ErrorState
        message="Submissions could not be loaded."
        onRetry={() => void submissions.refetch()}
      />
    );
  }

  const rows = submissions.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No work submitted yet.'
            : `${rows.length} submission${rows.length === 1 ? '' : 's'} — versions are immutable (I7).`}
        </p>
        <Button asChild size="sm">
          <Link to="/project/submissions/new">
            <Plus aria-hidden="true" /> New submission
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="No submissions"
          description="Write a chapter as text or upload the file — your supervisor reviews whatever you send from here."
          action={
            <Button asChild>
              <Link to="/project/submissions/new">New submission</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((submission) => {
            const style = STATUS_STYLE[submission.status];
            return (
              <li key={submission.id}>
                <Link
                  to={`/project/submissions/${submission.id}`}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{submission.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Updated {formatRelative(submission.updatedAt)}
                      {submission.submittedAt && ` · submitted ${formatRelative(submission.submittedAt)}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('self-start sm:self-auto', style.className)}>
                    {style.label}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
