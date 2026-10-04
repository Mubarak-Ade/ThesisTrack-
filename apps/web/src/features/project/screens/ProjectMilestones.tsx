import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { ApiError } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import DeadlineChip from '@/components/project/DeadlineChip';
import { useMilestones, useMilestoneStatus, useMyProject } from '../hooks/useProject';
import type { Milestone, MilestoneState } from '../data/types';

const STATE_CHIP: Record<MilestoneState, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'border-border bg-surface-alt text-muted-foreground' },
  in_progress: {
    label: 'In progress',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  submitted: {
    label: 'Awaiting approval',
    className: 'border-warning/40 bg-warning-bg text-warning',
  },
  approved: { label: 'Approved', className: 'border-success/40 bg-success-bg text-success' },
  overdue: { label: 'Overdue', className: 'border-danger/40 bg-danger-bg text-danger' },
};

/** §11.4 student targets: pending → in_progress → submitted, nothing else. */
function studentAction(milestone: Milestone): { to: 'in_progress' | 'submitted'; label: string } | null {
  if (milestone.status === 'pending') return { to: 'in_progress', label: 'Start milestone' };
  if (milestone.status === 'in_progress') return { to: 'submitted', label: 'Mark submitted' };
  return null;
}

/**
 * §16.3 Milestones — the §5.6 derived state per row (never a stored
 * percentage) plus the student's §11.4 status path. Every transition the API
 * would reject is shown disabled *with the reason* instead of failing on
 * click (§16.2's explanatory convention applied to rows).
 */
export default function ProjectMilestones() {
  const project = useMyProject();
  const projectId = project.data?.id;
  const milestones = useMilestones(projectId);
  const transition = useMilestoneStatus(projectId);

  if (milestones.isPending) return <LoadingState label="Loading milestones…" />;
  if (milestones.isError) {
    return (
      <ErrorState
        message="Milestones could not be loaded."
        onRetry={() => void milestones.refetch()}
      />
    );
  }

  const rows = milestones.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        eyebrow="No milestones"
        title="No milestones defined yet"
        description="Your supervisor defines milestones once the project starts — progress (§5.6) is derived from them the moment they exist."
      />
    );
  }

  async function move(milestone: Milestone, to: 'in_progress' | 'submitted'): Promise<void> {
    try {
      await transition.mutateAsync({ milestoneId: milestone.id, status: to });
      toast.success(`“${milestone.title}” → ${to === 'in_progress' ? 'in progress' : 'submitted'}.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'That transition could not be saved.',
      );
    }
  }

  const busyId = transition.isPending ? transition.variables?.milestoneId : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Progress is derived here: <span className="font-semibold text-foreground">
          {rows.filter((row) => row.status === 'approved').length} of {rows.length}
        </span>{' '}
        milestones approved (§5.6).
      </p>

      <ol className="flex flex-col gap-3">
        {rows.map((milestone, index) => {
          const chip = STATE_CHIP[milestone.state];
          const action = studentAction(milestone);
          const waiting = milestone.status === 'submitted';
          const done = milestone.status === 'approved';
          const student = project.data?.student;

          return (
            <li key={milestone.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-xs font-bold text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{milestone.title}</p>
                      <Badge variant="outline" className={cn(chip.className)}>
                        {chip.label}
                      </Badge>
                      <DeadlineChip dueAt={milestone.dueAt} />
                    </div>
                    {milestone.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{milestone.description}</p>
                    )}
                    {milestone.completedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Completed {new Date(milestone.completedAt).toLocaleDateString()}
                      </p>
                    )}
                    {waiting && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        With {student ? 'you and your supervisor' : 'your supervisor'} — approval
                        is your supervisor’s decision (§4.7).
                      </p>
                    )}
                    {done && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Approved — locked (I6).
                      </p>
                    )}
                  </div>

                  {action && (
                    <Button
                      size="sm"
                      disabled={busyId === milestone.id}
                      onClick={() => void move(milestone, action.to)}
                    >
                      {busyId === milestone.id ? 'Saving…' : action.label}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
