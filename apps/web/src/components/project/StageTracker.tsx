import { Check, Circle, Dot } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDue } from '@/lib/utils/time';

/** §8.11/§11.14 one materialised stage (snapshot + computed dueAt/overdue). */
export interface ProjectStage {
  id: string;
  position: number;
  status: 'pending' | 'active' | 'completed';
  name: string;
  description: string | null;
  deliverable: string | null;
  responsibleRole: 'student' | 'supervisor' | 'administrator' | null;
  requiresSubmission: boolean;
  requiresReview: boolean;
  requiresApproval: boolean;
  startedAt: string | null;
  completedAt: string | null;
  dueOffsetDays: number | null;
  dueAt: string | null;
  overdue: boolean;
}

/** §11.14 tracker payload — `current` carries the unmet gates (§16.5). */
export interface StageTracker {
  stages: ProjectStage[];
  current: (ProjectStage & { unmet: string[] }) | null;
}

/**
 * §16.5 — "Supervisor/admin additionally see the `advance` action, disabled
 * with the unmet conditions listed when §11.14's gates fail." Passing this
 * prop is what renders the action; students never pass it.
 */
export interface StageAdvance {
  /** Gate names from `current.unmet` (`requires_*`) — empty = gates pass. */
  unmet: string[];
  pending: boolean;
  onAdvance: () => void;
}

/** §11.14 gate names → the words a human acts on (§16.5 lists them plainly). */
const GATE_LABEL: Record<string, string> = {
  requires_submission: 'A submission made during this stage',
  requires_review: 'That submission reviewed',
  requires_approval: 'The review approving it',
};

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
};

function markerFor(stage: ProjectStage, isCurrent: boolean): React.ReactNode {
  if (stage.status === 'completed') {
    return (
      <span
        className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <Check className="size-3.5" />
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span
        className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-primary bg-background text-primary"
        aria-hidden="true"
      >
        <Dot className="size-5" />
      </span>
    );
  }
  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
      aria-hidden="true"
    >
      <Circle className="size-3" />
    </span>
  );
}

/**
 * §16.5 stage tracker (FR-CW-05) — the §3.4 state graphic:
 * `✓` completed · `●` current (labelled "Current") · `○` upcoming, from
 * `GET /projects/:projectId/stages`. The current stage's deliverable,
 * responsible role and computed deadline render inline. It sits **beside**
 * the milestone bar, never merged with it (stages ≠ milestones, §3.4).
 */
export default function StageTracker({
  tracker,
  advance,
}: {
  tracker: StageTracker;
  advance?: StageAdvance;
}) {
  if (tracker.stages.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Process stages</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No workflow stages for this project yet — your department hasn’t configured one, so the
          tracker stays empty (§3.4).
        </p>
      </div>
    );
  }

  const currentId = tracker.current?.id;

  return (
    <section aria-label="Process stages" className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Process stages</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Where this project stands in the department’s process — stages, not milestones.
      </p>

      <ol className="mt-4 flex flex-col">
        {tracker.stages.map((stage, index) => {
          const isCurrent = stage.id === currentId && stage.status !== 'completed';
          const isLast = index === tracker.stages.length - 1;
          const due = stage.dueAt ? formatDue(stage.dueAt) : null;
          return (
            <li
              key={stage.id}
              className={cn('relative flex gap-3 pb-4', isLast && 'pb-0')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {!isLast && (
                <span
                  className="absolute left-3 top-6 h-full w-px bg-border"
                  aria-hidden="true"
                />
              )}
              {markerFor(stage, isCurrent)}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      'text-sm',
                      isCurrent
                        ? 'font-semibold text-foreground'
                        : stage.status === 'completed'
                          ? 'font-medium text-muted-foreground'
                          : 'font-medium text-muted-foreground',
                    )}
                  >
                    {stage.name}
                  </p>
                  {isCurrent && (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                      Current
                    </span>
                  )}
                  {stage.status === 'completed' && (
                    <span className="sr-only">completed</span>
                  )}
                </div>

                {isCurrent && (
                  <div className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
                    {stage.deliverable && (
                      <p>
                        Deliverable: <span className="text-foreground">{stage.deliverable}</span>
                      </p>
                    )}
                    {stage.responsibleRole && (
                      <p>
                        Responsible: <span className="text-foreground">{ROLE_LABEL[stage.responsibleRole] ?? stage.responsibleRole}</span>
                      </p>
                    )}
                    <p>
                      Deadline:{' '}
                      {due && due.label ? (
                        <span className={due.overdue ? 'font-semibold text-danger' : 'text-foreground'}>
                          {due.label}
                        </span>
                      ) : (
                        <span className="text-foreground">none set</span>
                      )}
                    </p>
                  </div>
                )}

                {isCurrent && advance && (
                  <div className="mt-2 rounded-lg border bg-surface-alt/60 p-3">
                    {advance.unmet.length > 0 ? (
                      <>
                        <p className="text-xs font-semibold text-warning">
                          Advance stage — waiting for:
                        </p>
                        <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                          {advance.unmet.map((gate) => (
                            <li key={gate}>{GATE_LABEL[gate] ?? gate}</li>
                          ))}
                        </ul>
                        {/* §16.5: disabled with the unmet conditions listed, never hidden. */}
                        <Button size="sm" variant="outline" className="mt-2" disabled>
                          Advance stage
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          All gates pass — the server re-checks them on advance (§11.14).
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          disabled={advance.pending}
                          onClick={advance.onAdvance}
                        >
                          {advance.pending ? 'Advancing…' : 'Advance stage'}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
