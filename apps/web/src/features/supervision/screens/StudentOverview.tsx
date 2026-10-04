import { Link } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import DeadlineChip from '@/components/project/DeadlineChip';
import MilestoneBar from '@/components/project/MilestoneBar';
import StageTracker from '@/components/project/StageTracker';
import { ApiError } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/time';
import { useStudentContext } from './StudentDetail';
import { useAdvanceStage, useMilestones, useProject, useStageTracker } from '../hooks/useSupervision';

const PROJECT_STATUS_STYLE = {
  active: { label: 'Active', className: 'border-primary/30 bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'border-success/40 bg-success-bg text-success' },
  archived: { label: 'Archived', className: 'border-border bg-surface-alt text-muted-foreground' },
} as const;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'The stage could not be advanced.';
}

/**
 * §16.5 progress display for the supervisor's side: milestone bar + stage
 * tracker side by side (§3.4), with the `advance` action §16.5 grants only
 * supervisor/admin — disabled with the unmet conditions listed whenever
 * §11.14's gates fail, never hidden (StageTracker renders that block).
 */
export default function StudentOverview() {
  const { entry } = useStudentContext();
  const projectId = entry.projectId;

  const project = useProject(projectId);
  const tracker = useStageTracker(projectId);
  const milestones = useMilestones(projectId);
  const advance = useAdvanceStage(projectId ?? '');

  if (project.isPending || tracker.isPending || milestones.isPending) {
    return <LoadingState label="Loading the project…" />;
  }
  if (project.isError || tracker.isError || milestones.isError) {
    return (
      <ErrorState
        message="This project's overview could not be loaded right now."
        onRetry={() => {
          void project.refetch();
          void tracker.refetch();
          void milestones.refetch();
        }}
      />
    );
  }

  const summary = project.data;
  const rows = milestones.data;
  const approved = rows.filter((row) => row.state === 'approved').length;
  const percent = rows.length === 0 ? 0 : Math.round((approved / rows.length) * 100);
  const next = rows.find((row) => row.state !== 'approved' && row.dueAt) ?? null;
  const style = PROJECT_STATUS_STYLE[summary.status];

  async function runAdvance(): Promise<void> {
    try {
      await advance.mutateAsync();
      toast.success('Stage advanced — the tracker now shows the next one.');
    } catch (error) {
      // §11.14's 422 lists the unmet gates; the tracker shows them too.
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="so-project" className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="so-project" className="text-base font-semibold text-foreground">
              {summary.title}
            </h2>
            <Badge variant="outline" className={cn(style.className)}>
              {style.label}
            </Badge>
          </div>
          {summary.description && (
            <p className="mt-2 text-sm text-muted-foreground">{summary.description}</p>
          )}
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Student
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                <Link to={`/supervision/${entry.student.id}`} className="hover:text-primary">
                  {entry.student.firstName} {entry.student.lastName}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Updated
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {formatRelative(summary.updatedAt)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="flex flex-col gap-4">
          <MilestoneBar
            approved={approved}
            total={rows.length}
            percent={percent}
            emptyHint="No milestones yet — add them on the Milestones tab (§11.4)."
          />
          {next && (
            <section
              aria-labelledby="so-next"
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div className="min-w-0">
                <h2 id="so-next" className="text-sm font-semibold text-foreground">
                  Next deadline
                </h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">{next.title}</p>
              </div>
              <DeadlineChip dueAt={next.dueAt} className="shrink-0" />
            </section>
          )}
        </div>
      </div>

      <section aria-labelledby="so-tracker" className="rounded-xl border bg-card p-5">
        <h2 id="so-tracker" className="text-base font-semibold text-foreground">
          Stage tracker
        </h2>
        <div className="mt-3">
          <StageTracker
            tracker={tracker.data}
            advance={{
              unmet: tracker.data.current?.unmet ?? [],
              pending: advance.isPending,
              onAdvance: () => void runAdvance(),
            }}
          />
        </div>
      </section>

      {tracker.data.stages.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderKanban className="size-4" aria-hidden="true" />
          Zero workflow stages materialised (§3.4) — approval ran without a matching workflow
          (ADR-16).
        </p>
      )}
    </div>
  );
}
