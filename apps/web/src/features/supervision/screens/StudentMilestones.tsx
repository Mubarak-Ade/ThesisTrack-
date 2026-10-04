import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarPlus, Check, PencilLine, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import DeadlineChip from '@/components/project/DeadlineChip';
import { ApiError } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/time';
import { MILESTONE_STYLE } from '../components/chips';
import type { Milestone } from '../data/types';
import { useStudentContext } from './StudentDetail';
import {
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useMilestoneStatus,
  usePatchMilestone,
  useReorderMilestones,
} from '../hooks/useSupervision';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

/** §11.4 supervisor may set any status — the chain covers the natural path. */
function supervisorAction(
  milestone: Milestone,
): { to: Milestone['status']; label: string } | null {
  if (milestone.status === 'pending') return { to: 'in_progress', label: 'Start' };
  if (milestone.status === 'in_progress') return { to: 'submitted', label: 'Mark submitted' };
  if (milestone.status === 'submitted') return { to: 'approved', label: 'Approve' };
  return null;
}

interface FormState {
  title: string;
  description: string;
  dueAt: string;
}

const EMPTY: FormState = { title: '', description: '', dueAt: '' };

function toForm(milestone: Milestone): FormState {
  return {
    title: milestone.title,
    description: milestone.description ?? '',
    dueAt: milestone.dueAt ? milestone.dueAt.slice(0, 10) : '',
  };
}

function MilestoneForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  busy: boolean;
  submitLabel: string;
  onSubmit: (value: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('A title is required.');
      return;
    }
    setError(null);
    onSubmit({ ...form, title: form.title.trim() });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border bg-surface-alt/40 p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ms-title" className="text-sm font-medium text-foreground">
          Title
        </label>
        <Input
          id="ms-title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          placeholder="Proposal approved"
          aria-invalid={error ? 'true' : undefined}
        />
        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ms-description" className="text-sm font-medium text-foreground">
          Description <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="ms-description"
          rows={3}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="What 'done' means for this milestone…"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ms-due" className="text-sm font-medium text-foreground">
          Deadline <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="ms-due"
          type="date"
          value={form.dueAt}
          onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * §16.3 Milestones (supervisor side) / plan 12.5 — create, edit, reorder and
 * re-deadline the §11.4 rows (assigned supervisor / admin write path), plus
 * the §5.6 state chips. Status moves follow §11.4's "supervisor: any" through
 * the contextual chain; `approved` stamps `completed_at` server-side.
 */
export default function StudentMilestones() {
  const { entry } = useStudentContext();
  const projectId = entry.projectId!;

  const milestones = useMilestones(projectId);
  const create = useCreateMilestone(projectId);
  const patch = usePatchMilestone();
  const remove = useDeleteMilestone();
  const reorder = useReorderMilestones(projectId);
  const changeStatus = useMilestoneStatus();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (milestones.isPending) return <LoadingState label="Loading milestones…" />;
  if (milestones.isError) {
    return (
      <ErrorState
        message="Milestones could not be loaded right now."
        onRetry={() => void milestones.refetch()}
      />
    );
  }

  const rows = [...milestones.data].sort((a, b) => a.position - b.position);
  const busy = create.isPending || patch.isPending || remove.isPending || reorder.isPending;

  function payloadOf(form: FormState): { title: string; description: string | null; dueAt: string | null } {
    return {
      title: form.title,
      description: form.description.trim() ? form.description.trim() : null,
      dueAt: form.dueAt ? new Date(`${form.dueAt}T00:00:00.000Z`).toISOString() : null,
    };
  }

  async function runCreate(form: FormState): Promise<void> {
    try {
      await create.mutateAsync(payloadOf(form));
      setAdding(false);
      toast.success('Milestone added.');
    } catch (error) {
      toast.error(errorMessage(error, 'The milestone could not be added.'));
    }
  }

  async function runPatch(id: string, form: FormState): Promise<void> {
    try {
      await patch.mutateAsync({ milestoneId: id, input: payloadOf(form) });
      setEditingId(null);
      toast.success('Milestone updated.');
    } catch (error) {
      toast.error(errorMessage(error, 'The milestone could not be updated.'));
    }
  }

  async function runRemove(id: string): Promise<void> {
    try {
      await remove.mutateAsync(id);
      toast.success('Milestone deleted.');
    } catch (error) {
      toast.error(errorMessage(error, 'The milestone could not be deleted.'));
    }
  }

  async function move(index: number, delta: number): Promise<void> {
    const order = rows.map((row) => row.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    try {
      await reorder.mutateAsync(order);
    } catch (error) {
      toast.error(errorMessage(error, 'The order could not be saved.'));
    }
  }

  async function runStatus(id: string, next: Milestone['status']): Promise<void> {
    try {
      await changeStatus.mutateAsync({ milestoneId: id, status: next });
      toast.success(next === 'approved' ? 'Milestone approved.' : 'Status updated.');
    } catch (error) {
      toast.error(errorMessage(error, 'The status could not be changed.'));
    }
  }

  const deleting = rows.find((row) => row.id === confirmId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Milestones</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? 'Define the steps this project is judged by (§11.4).'
              : `${rows.length} milestone${rows.length === 1 ? '' : 's'} — ordered, dated, §5.6 state computed at read.`}
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)} disabled={busy}>
            <CalendarPlus aria-hidden="true" /> Add milestone
          </Button>
        )}
      </div>

      {adding && (
        <MilestoneForm
          initial={EMPTY}
          busy={create.isPending}
          submitLabel="Create milestone"
          onSubmit={(form) => void runCreate(form)}
          onCancel={() => setAdding(false)}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          eyebrow="No milestones"
          title="This project has no milestones yet"
          description="Add the first one — students see the same list, with §4.5's status path from their side."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((milestone, index) => {
            const chip = MILESTONE_STYLE[milestone.state];
            const action = supervisorAction(milestone);
            return (
              <li key={milestone.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-alt text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{milestone.title}</p>
                          {milestone.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {milestone.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn(chip.className)}>
                              {chip.label}
                            </Badge>
                            <DeadlineChip dueAt={milestone.dueAt} />
                            {milestone.completedAt && (
                              <span className="text-xs text-muted-foreground">
                                completed {formatRelative(milestone.completedAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <div className="flex flex-col">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Move ${milestone.title} up`}
                            disabled={index === 0 || busy}
                            onClick={() => void move(index, -1)}
                          >
                            <ArrowUp className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Move ${milestone.title} down`}
                            disabled={index === rows.length - 1 || busy}
                            onClick={() => void move(index, 1)}
                          >
                            <ArrowDown className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Edit ${milestone.title}`}
                          disabled={busy}
                          onClick={() => setEditingId(editingId === milestone.id ? null : milestone.id)}
                        >
                          <PencilLine className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Delete ${milestone.title}`}
                          disabled={busy}
                          onClick={() => setConfirmId(milestone.id)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                        {action && (
                          <Button
                            size="sm"
                            disabled={busy || changeStatus.isPending}
                            onClick={() => void runStatus(milestone.id, action.to)}
                          >
                            {action.to === 'approved' && <Check className="size-4" aria-hidden="true" />}
                            {action.label}
                          </Button>
                        )}
                      </div>
                    </div>

                    {editingId === milestone.id && (
                      <MilestoneForm
                        initial={toForm(milestone)}
                        busy={patch.isPending}
                        submitLabel="Save changes"
                        onSubmit={(form) => void runPatch(milestone.id, form)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        destructive
        title="Delete this milestone?"
        description={
          deleting
            ? `“${deleting.title}” is removed for good — submissions tied to it keep their own history. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete milestone"
        loading={remove.isPending}
        onConfirm={() => {
          const id = deleting?.id;
          setConfirmId(null);
          if (id) void runRemove(id);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
