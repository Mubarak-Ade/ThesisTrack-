import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, GitBranch, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { useWorkflow, useWorkflowWrite } from '../hooks';
import type { ResponsibleRole, StageInput } from '../data';

/**
 * §16.3 Workflows — the stage editor half (FR-CW-01/02/03): add, edit,
 * remove and reorder stages, then one whole-set PATCH (the server renumbers
 * positions; snapshots are never rewritten — ADR-15). Also carries §16.3's
 * "set default" affordance (PROPOSED `isDefault` delta).
 *
 * LIVE-ONLY: edits save against real definition rows (Rule 3).
 */

interface StageDraft {
  id?: string;
  name: string;
  description: string;
  dueOffsetDays: string; // string in the form; parsed on save
  deliverable: string;
  responsibleRole: '' | ResponsibleRole;
  requiresSubmission: boolean;
  requiresReview: boolean;
  requiresApproval: boolean;
}

function toDraft(stage: {
  id: string;
  name: string;
  description: string | null;
  dueOffsetDays: number | null;
  deliverable: string | null;
  responsibleRole: ResponsibleRole | null;
  requiresSubmission: boolean;
  requiresReview: boolean;
  requiresApproval: boolean;
}): StageDraft {
  return {
    id: stage.id,
    name: stage.name,
    description: stage.description ?? '',
    dueOffsetDays: stage.dueOffsetDays === null ? '' : String(stage.dueOffsetDays),
    deliverable: stage.deliverable ?? '',
    responsibleRole: stage.responsibleRole ?? '',
    requiresSubmission: stage.requiresSubmission,
    requiresReview: stage.requiresReview,
    requiresApproval: stage.requiresApproval,
  };
}

const EMPTY_STAGE: StageDraft = {
  name: '',
  description: '',
  dueOffsetDays: '',
  deliverable: '',
  responsibleRole: '',
  requiresSubmission: false,
  requiresReview: false,
  requiresApproval: false,
};

export default function WorkflowEditor() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const query = useWorkflow(workflowId);
  const write = useWorkflowWrite();

  const [meta, setMeta] = useState({ name: '', program: '', academicSession: '', description: '' });
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [setDefaultOpen, setSetDefaultOpen] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  const detail = query.data;

  // Hydrate local edits once per workflow (post-save re-hydration comes from
  // the mutation response below, so a background refetch never clobbers a
  // half-typed stage).
  useEffect(() => {
    if (!detail || hydratedFor.current === detail.workflow.id) return;
    hydratedFor.current = detail.workflow.id;
    setMeta({
      name: detail.workflow.name,
      program: detail.workflow.program ?? '',
      academicSession: detail.workflow.academicSession ?? '',
      description: detail.workflow.description ?? '',
    });
    setStages(detail.stages.map(toDraft));
  }, [detail]);

  const patchStage = (index: number, patch: Partial<StageDraft>) => {
    setStages((current) => current.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));
  };

  const move = (index: number, delta: number) => {
    setStages((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeStage = (index: number) => {
    setStages((current) => current.filter((_, i) => i !== index));
  };

  const save = () => {
    const trimmed = stages.map((stage) => ({ ...stage, name: stage.name.trim() }));
    const blank = trimmed.findIndex((stage) => !stage.name);
    if (blank !== -1) {
      toast.error(`Stage ${blank + 1} needs a name.`);
      return;
    }
    const payload: StageInput[] = trimmed.map((stage) => ({
      ...(stage.id ? { id: stage.id } : {}),
      name: stage.name,
      description: stage.description.trim() || null,
      dueOffsetDays: stage.dueOffsetDays === '' ? null : Number(stage.dueOffsetDays),
      deliverable: stage.deliverable.trim() || null,
      responsibleRole: stage.responsibleRole === '' ? null : stage.responsibleRole,
      requiresSubmission: stage.requiresSubmission,
      requiresReview: stage.requiresReview,
      requiresApproval: stage.requiresApproval,
    }));

    write.mutate(
      {
        action: 'patch',
        workflowId: workflowId!,
        input: {
          name: meta.name.trim(),
          program: meta.program.trim() || null,
          academicSession: meta.academicSession.trim() || null,
          description: meta.description.trim() || null,
          stages: payload,
        },
      },
      {
        onSuccess: (saved) => {
          if (!saved) return; // patch always answers the definition — union-type guard
          toast.success('Workflow saved — positions renumbered server-side (FR-CW-02).');
          hydratedFor.current = saved.workflow.id;
          setMeta({
            name: saved.workflow.name,
            program: saved.workflow.program ?? '',
            academicSession: saved.workflow.academicSession ?? '',
            description: saved.workflow.description ?? '',
          });
          setStages(saved.stages.map(toDraft));
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const setDefault = () => {
    write.mutate(
      { action: 'patch', workflowId: workflowId!, input: { isDefault: true } },
      {
        onSuccess: () => {
          toast.success('Default flag moved to this workflow (ADR-16).');
          setSetDefaultOpen(false);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  if (query.isPending) return <LoadingState label="Loading workflow…" />;
  if (query.isError || !detail) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="This workflow could not be loaded — it may have been deleted."
          onRetry={() => void query.refetch()}
        />
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link to="/workflows">Back to workflows</Link>
          </Button>
        </div>
      </div>
    );
  }

  const workflow = detail.workflow;

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/workflows" className="transition-colors hover:text-primary">
          Workflows
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">{workflow.name}</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {workflow.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {workflow.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                <Star className="size-3" aria-hidden="true" /> Default
              </span>
            )}
            {workflow.archivedAt && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Archived
              </span>
            )}
            {workflow.description ?? 'Define the stages a project passes through (§3.4).'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!workflow.isDefault && !workflow.archivedAt && (
            <Button type="button" variant="outline" onClick={() => setSetDefaultOpen(true)}>
              <Star aria-hidden="true" />
              Set default
            </Button>
          )}
          <Button type="button" onClick={save} disabled={write.isPending}>
            Save workflow
          </Button>
        </div>
      </header>

      {/* Metadata */}
      <Card className="mt-6">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={meta.name}
              onChange={(event) => setMeta((m) => ({ ...m, name: event.target.value }))}
              className="mt-1.5"
            />
          </label>
          <label className="block">
            <Label htmlFor="wf-program">Program</Label>
            <Input
              id="wf-program"
              value={meta.program}
              onChange={(event) => setMeta((m) => ({ ...m, program: event.target.value }))}
              placeholder="Blank = any program (fallback)"
              className="mt-1.5"
            />
          </label>
          <label className="block">
            <Label htmlFor="wf-session">Academic session</Label>
            <Input
              id="wf-session"
              value={meta.academicSession}
              onChange={(event) => setMeta((m) => ({ ...m, academicSession: event.target.value }))}
              placeholder="e.g. 2026/2027"
              className="mt-1.5"
            />
          </label>
          <label className="block sm:col-span-2">
            <Label htmlFor="wf-desc">Description</Label>
            <Input
              id="wf-desc"
              value={meta.description}
              onChange={(event) => setMeta((m) => ({ ...m, description: event.target.value }))}
              className="mt-1.5"
            />
          </label>
        </CardContent>
      </Card>

      {/* Stage editor */}
      <section aria-label="Stages" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Stages</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Ordered by array position; the server renumbers on save (FR-CW-02). Gates are
              evaluated server-side (§11.14) — stage 1 should stay ungated (§5.9).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStages((current) => [...current, { ...EMPTY_STAGE }])}
          >
            <Plus aria-hidden="true" />
            Add stage
          </Button>
        </div>

        {stages.length === 0 && (
          <Card className="mt-4">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <GitBranch className="size-4 shrink-0" aria-hidden="true" />
              No stages yet — projects materialise ZERO stages for an empty workflow, and
              approval never fails on workflow data (ADR-16).
            </CardContent>
          </Card>
        )}

        <ol className="mt-4 space-y-4">
          {stages.map((stage, index) => (
            <li key={stage.id ?? `new-${index}`}>
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <label className="block">
                        <Label htmlFor={`stage-name-${index}`}>Stage name</Label>
                        <Input
                          id={`stage-name-${index}`}
                          value={stage.name}
                          onChange={(event) => patchStage(index, { name: event.target.value })}
                          placeholder="e.g. Proposal approval"
                          className="mt-1.5"
                        />
                      </label>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move stage ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move stage ${index + 1} down`}
                        disabled={index === stages.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove stage ${index + 1}`}
                        onClick={() => removeStage(index)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <Label htmlFor={`stage-desc-${index}`}>Description</Label>
                      <Input
                        id={`stage-desc-${index}`}
                        value={stage.description}
                        onChange={(event) => patchStage(index, { description: event.target.value })}
                        className="mt-1.5"
                      />
                    </label>
                    <label className="block">
                      <Label htmlFor={`stage-deliv-${index}`}>Deliverable label</Label>
                      <Input
                        id={`stage-deliv-${index}`}
                        value={stage.deliverable}
                        onChange={(event) => patchStage(index, { deliverable: event.target.value })}
                        placeholder="e.g. Proposal PDF"
                        className="mt-1.5"
                      />
                    </label>
                    <label className="block">
                      <Label htmlFor={`stage-due-${index}`}>Due offset (days)</Label>
                      <Input
                        id={`stage-due-${index}`}
                        type="number"
                        min={0}
                        value={stage.dueOffsetDays}
                        onChange={(event) => patchStage(index, { dueOffsetDays: event.target.value })}
                        placeholder="Blank = no due date"
                        className="mt-1.5"
                      />
                    </label>
                    <label className="block">
                      <Label htmlFor={`stage-role-${index}`}>Responsible (descriptive)</Label>
                      <select
                        id={`stage-role-${index}`}
                        value={stage.responsibleRole}
                        onChange={(event) =>
                          patchStage(index, {
                            responsibleRole: event.target.value as StageDraft['responsibleRole'],
                          })
                        }
                        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <option value="">—</option>
                        <option value="student">Student</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="administrator">Coordinator</option>
                      </select>
                    </label>
                    <fieldset className="sm:col-span-2">
                      <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Advance gates (evaluated server-side)
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                        {(
                          [
                            ['requiresSubmission', 'Requires submission'],
                            ['requiresReview', 'Requires review'],
                            ['requiresApproval', 'Requires approval'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="inline-flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={stage[key]}
                              onChange={(event) => patchStage(index, { [key]: event.target.checked })}
                              className="size-4 rounded border-border"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={write.isPending}>
          Save workflow
        </Button>
        <Button asChild variant="outline">
          <Link to="/workflows">Back to list</Link>
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate('/workflows')}>
          Cancel
        </Button>
      </div>

      <ConfirmDialog
        open={setDefaultOpen}
        title="Set as the default workflow?"
        description={
          <>
            Students with no program match resolve to <strong>{workflow.name}</strong> at
            approval (ADR-16). The current default is cleared in the same write.
          </>
        }
        confirmLabel="Set default"
        loading={write.isPending}
        onConfirm={setDefault}
        onCancel={() => setSetDefaultOpen(false)}
      />
    </div>
  );
}
