import { db } from '../../config/db.js';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../../errors/index.js';
import type { projectStages, workflows } from '../../schema/index.js';
import type { ProjectRow } from '../projects/types.js';
import * as repo from './repository.js';
import type {
  CreateWorkflowInput,
  ListWorkflowsQuery,
  PatchWorkflowInput,
  StageInput,
} from './schema.js';
import type {
  CurrentStageView,
  GateFacts,
  GateFields,
  ProjectStageRow,
  ProjectStageView,
  StageTracker,
  WorkflowDetail,
  WorkflowRow,
  WorkflowStageRow,
} from './types.js';

/*
 * §3.4 / FR-CW-01…08 business rules.
 *
 * Three behaviors this module exists for:
 *   1. whole-set stage edits (server renumbers, positions contiguous —
 *      FR-CW-02) while never touching a live project's snapshot (ADR-15);
 *   2. ADR-16 workflow resolution, shared by both project-creation paths;
 *   3. the §11.14 advance gates, evaluated **server-side** — a caller may be
 *      permitted by §4.6 and still refused by §11.14.
 */

/** Postgres unique_violation — the race loser answers with the same 409. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/** Postgres foreign_key_violation — DELETE's RESTRICT backstop (§8.11). */
function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23503';
}

/** `''` and whitespace are "no value" for the nullable display fields. */
function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/* ------------------------------------------------------------------ reads */

export async function listWorkflows(
  query: ListWorkflowsQuery,
): Promise<{ workflows: WorkflowRow[]; total: number }> {
  const { rows, total } = await repo.listWorkflows({
    program: normalizeText(query.program),
    includeArchived: query.includeArchived === 'true',
    page: query.page,
    limit: query.limit,
  });
  return { workflows: rows, total };
}

export async function getWorkflowDetail(id: string): Promise<WorkflowDetail> {
  const workflow = await repo.findWorkflowById(id);
  if (!workflow) throw new NotFoundError('Workflow');
  return { workflow, stages: await repo.listWorkflowStages(id) };
}

/** Definition stages for materialisation — used by both creation paths. */
export function loadWorkflowStages(workflowId: string): Promise<WorkflowStageRow[]> {
  return repo.listWorkflowStages(workflowId);
}

/**
 * ADR-16 resolution — the exact chain, shared by `POST /projects` (explicit
 * override first) and §5.4 approval (no explicit input, branch 1 absent):
 *
 *   explicit workflowId → the ONE active workflow matching the student's
 *   program → the flagged default → none (zero stages).
 *
 * Approval never fails on workflow data: only an explicit *unknown* id is a
 * request error (400, path `workflowId` — the §5.4 templateId discipline),
 * and every other branch degrades to "no workflow" rather than throwing.
 */
export async function resolveWorkflowForProject(
  explicitWorkflowId: string | null | undefined,
  studentProgram: string | null | undefined,
): Promise<WorkflowRow | undefined> {
  if (explicitWorkflowId) {
    const explicit = await repo.findWorkflowById(explicitWorkflowId);
    if (!explicit) {
      throw new ValidationError('Invalid workflow', [
        { path: 'workflowId', message: 'Workflow not found' },
      ]);
    }
    return explicit;
  }

  const program = normalizeText(studentProgram);
  if (program) {
    const match = await repo.findActiveWorkflowByProgram(program);
    if (match) return match;
  }

  return repo.findDefaultWorkflow();
}

/* ----------------------------------------------------------------- writes */

/** Every stage field the whole-set edit owns — complete by construction. */
interface StageFieldValues {
  name: string;
  description: string | null;
  dueOffsetDays: number | null;
  deliverable: string | null;
  responsibleRole: 'student' | 'supervisor' | 'administrator' | null;
  requiresSubmission: boolean;
  requiresReview: boolean;
  requiresApproval: boolean;
}

function stageFields(stage: StageInput): StageFieldValues {
  // Whole-set semantics (FR-CW-01): the entry IS the definition, so an
  // omitted optional field means "this stage has none", not "leave it alone".
  return {
    name: stage.name,
    description: stage.description ?? null,
    dueOffsetDays: stage.dueOffsetDays ?? null,
    deliverable: stage.deliverable ?? null,
    responsibleRole: stage.responsibleRole ?? null,
    requiresSubmission: stage.requiresSubmission ?? false,
    requiresReview: stage.requiresReview ?? false,
    requiresApproval: stage.requiresApproval ?? false,
  };
}

async function assertProgramSlotFree(
  program: string,
  excludeWorkflowId: string | null,
): Promise<void> {
  const holders = await repo.countOtherActiveWorkflowsForProgram(program, excludeWorkflowId);
  if (holders > 0) {
    throw new ConflictError(`Another active workflow already covers "${program}"`);
  }
}

/** POST /workflows — admin only (§4.6); one active workflow per program. */
export async function createWorkflow(
  actorId: string,
  input: CreateWorkflowInput,
): Promise<WorkflowDetail> {
  const program = normalizeText(input.program);
  if (program) await assertProgramSlotFree(program, null);

  const stages = input.stages ?? [];

  try {
    return await db.transaction(async (tx) => {
      const workflow = await repo.insertWorkflow(
        {
          name: input.name,
          program,
          academicSession: normalizeText(input.academicSession),
          description: normalizeText(input.description),
          isDefault: false, // the flag belongs to seed-workflows (§8.10), not the API
          createdBy: actorId,
        },
        tx,
      );

      const rows: WorkflowStageRow[] = [];
      for (const [index, stage] of stages.entries()) {
        rows.push(
          await repo.insertStage(
            { workflowId: workflow.id, position: index + 1, ...stageFields(stage) },
            tx,
          ),
        );
      }
      return { workflow, stages: rows };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost the one-active-per-program race between pre-check and insert.
      throw new ConflictError(`Another active workflow already covers "${program}"`);
    }
    throw err;
  }
}

/**
 * PATCH /workflows/:workflowId — metadata and/or the whole `stages[]` set.
 *
 * Stage-set rules (FR-CW-01/02 + ADR-15):
 *   - positions are renumbered by array order and are contiguous by
 *     construction — the client never sends a position;
 *   - an `id` must belong to this workflow (402-style misuse → 422);
 *   - a removed stage that projects have materialised → 422: their snapshots
 *     point at it as provenance (RESTRICT), and rewriting history is exactly
 *     what ADR-15 forbids.
 */
export async function patchWorkflow(id: string, input: PatchWorkflowInput): Promise<WorkflowDetail> {
  const workflow = await repo.findWorkflowById(id);
  if (!workflow) throw new NotFoundError('Workflow');

  const willBeActive = input.archived === undefined ? workflow.archivedAt === null : !input.archived;
  const targetProgram =
    input.program !== undefined ? normalizeText(input.program) : workflow.program;
  if (willBeActive && targetProgram) {
    await assertProgramSlotFree(targetProgram, id);
  }

  const metadata: Partial<typeof workflows.$inferInsert> = {};
  if (input.name !== undefined) metadata.name = input.name;
  if (input.program !== undefined) metadata.program = targetProgram;
  if (input.academicSession !== undefined) metadata.academicSession = normalizeText(input.academicSession);
  if (input.description !== undefined) metadata.description = normalizeText(input.description);
  if (input.archived !== undefined) {
    // Re-archiving an archived row keeps its original stamp — archive is a
    // state, not a counter.
    metadata.archivedAt = input.archived ? (workflow.archivedAt ?? new Date()) : null;
  }

  let stages: WorkflowStageRow[] | null = null;

  if (input.stages !== undefined) {
    const existing = await repo.listWorkflowStages(id);
    const knownIds = new Set(existing.map((stage) => stage.id));

    const incomingIds = new Set<string>();
    for (const [index, stage] of input.stages.entries()) {
      if (stage.id !== undefined) {
        if (!knownIds.has(stage.id)) {
          throw new ValidationError('Invalid stages', [
            { path: `stages.${index}.id`, message: 'Stage does not belong to this workflow' },
          ]);
        }
        if (incomingIds.has(stage.id)) {
          throw new ValidationError('Invalid stages', [
            { path: `stages.${index}.id`, message: 'Stage id appears more than once' },
          ]);
        }
        incomingIds.add(stage.id);
      }
    }

    const removedIds = existing.filter((stage) => !incomingIds.has(stage.id)).map((stage) => stage.id);
    if (removedIds.length > 0) {
      const referenced = await repo.countStagesReferencedByProjects(removedIds);
      if (referenced > 0) {
        throw new BusinessRuleError('Cannot remove stages that projects have already materialised', [
          {
            path: 'stages',
            message: 'Materialised stages are frozen history (ADR-15) — edit or add stages instead',
          },
        ]);
      }
    }

    try {
      stages = await db.transaction(async (tx) => {
        // Lift every position out of the 1..n range first: UNIQUE
        // (workflow_id, position) would otherwise collide mid-edit whenever
        // the new order shifts (§8.10).
        await repo.liftStagePositions(id, tx);

        for (const removedId of removedIds) {
          const gone = await repo.deleteStageIfUnreferenced(removedId, id, tx);
          if (!gone) {
            // Pre-check said free; a project materialised it since (or the
            // FK would have fired). Either way: 422, whole edit rolls back.
            throw new BusinessRuleError(
              'Cannot remove stages that projects have already materialised',
              [{ path: 'stages', message: 'Materialised stages are frozen history (ADR-15)' }],
            );
          }
        }

        const applied: WorkflowStageRow[] = [];
        for (const [index, stage] of input.stages!.entries()) {
          const position = index + 1;
          if (stage.id !== undefined) {
            const updated = await repo.updateStage(stage.id, id, { ...stageFields(stage), position }, tx);
            if (!updated) {
              throw new BusinessRuleError('Stage update failed', [
                { path: `stages.${index}.id`, message: 'Stage no longer exists' },
              ]);
            }
            applied.push(updated);
          } else {
            applied.push(
              await repo.insertStage(
                { workflowId: id, position, ...stageFields(stage) },
                tx,
              ),
            );
          }
        }
        return applied;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Stage positions collided — the stage set changed concurrently');
      }
      throw err;
    }
  }

  if (Object.keys(metadata).length > 0) {
    const updated = await repo.updateWorkflow(id, metadata);
    if (!updated) throw new NotFoundError('Workflow'); // deleted concurrently
  }

  return {
    workflow: (await repo.findWorkflowById(id))!,
    stages: stages ?? (await repo.listWorkflowStages(id)),
  };
}

/**
 * DELETE /workflows/:workflowId — §11.14: **422** when any project references
 * it. The spec's "archive instead" is PATCH `{archived: true}` (§11.2 gives
 * projects the same shape), which releases the program slot without touching
 * history — `projects.workflow_id` is RESTRICT for exactly this reason (I15).
 */
export async function deleteWorkflow(id: string): Promise<WorkflowRow> {
  const workflow = await repo.findWorkflowById(id);
  if (!workflow) throw new NotFoundError('Workflow');

  const referenced = await repo.countProjectsReferencing(id);
  if (referenced > 0) {
    throw referencedError();
  }

  try {
    const deleted = await repo.deleteWorkflow(id);
    if (!deleted) throw new NotFoundError('Workflow');
    return deleted;
  } catch (err) {
    // project_stages.workflow_stage_id is RESTRICT too (§8.11) — the count
    // above covers the projects path, this catches the rest as the same 422.
    if (isForeignKeyViolation(err)) throw referencedError();
    throw err;
  }
}

function referencedError(): BusinessRuleError {
  return new BusinessRuleError('Cannot delete a workflow that projects reference', [
    { path: 'workflowId', message: 'Archive it instead — projects keep this definition as history' },
  ]);
}

/* ------------------------------------------------- materialisation helpers */

/**
 * §5.4 step 5 / §11.2 POST /projects — the ADR-15 frozen snapshot.
 *
 * Every descriptive and gating field is COPIED from the definition, exactly
 * like milestone materialisation copies `dueOffsetDays` (ADR-05); after this,
 * editing the workflow cannot move a live project's stages. Stage 1 becomes
 * `active` with `started_at = now()` (§5.9); later edits affect future
 * projects only.
 */
export function buildStageSnapshotValues(
  stages: WorkflowStageRow[],
  projectId: string,
  starterId: string,
): Array<typeof projectStages.$inferInsert> {
  const now = new Date();
  return stages.map((stage, index) => {
    const isFirst = index === 0;
    return {
      projectId,
      workflowStageId: stage.id,
      position: stage.position,
      status: isFirst ? ('active' as const) : ('pending' as const),
      name: stage.name,
      description: stage.description,
      dueOffsetDays: stage.dueOffsetDays,
      deliverable: stage.deliverable,
      responsibleRole: stage.responsibleRole,
      requiresSubmission: stage.requiresSubmission,
      requiresReview: stage.requiresReview,
      requiresApproval: stage.requiresApproval,
      startedAt: isFirst ? now : null,
      startedBy: isFirst ? starterId : null,
      completedAt: null,
      completedBy: null,
    };
  });
}

/** Does this stage gate on anything at all? (§5.9 — see evaluateGates.) */
export function stageHasAnyGate(stage: GateFields): boolean {
  return stage.requiresSubmission || stage.requiresReview || stage.requiresApproval;
}

/**
 * The §11.14 gate table, pure.
 *
 *   requires_submission → a submission exists in the stage window
 *   requires_review     → an in-window submission carries a review
 *   requires_approval   → the project's proposal is `approved` (§5.4 — the
 *                         "proposal-gated" branch) OR an in-window submission
 *                         was reviewed `approved`
 *
 * Returns the unmet gate names, snake_case exactly as the columns are named,
 * so the 422 `details` entries (`path: 'unmet'`) match what §16.5 lists on
 * the disabled advance button. Vacuously empty when no flags are set — that
 * is what makes an ungated stage freely advanceable.
 */
export function evaluateGates(stage: GateFields, facts: GateFacts): string[] {
  const unmet: string[] = [];
  if (stage.requiresSubmission && !facts.submissionInWindow) unmet.push('requires_submission');
  if (stage.requiresReview && !facts.reviewedSubmissionInWindow) unmet.push('requires_review');
  if (
    stage.requiresApproval &&
    !facts.proposalApproved &&
    !facts.approvedReviewedSubmissionInWindow
  ) {
    unmet.push('requires_approval');
  }
  return unmet;
}

/* ------------------------------------------------------------ stage tracker */

function toStageView(row: ProjectStageRow, now: number): ProjectStageView {
  // §8.11: deadline is computed at read — started_at + due_offset_days —
  // never stored, so it can never drift. Overdue mirrors §5.6: only the live
  // stage can be overdue, and only past its computed deadline.
  const dueAt =
    row.startedAt && row.dueOffsetDays !== null
      ? new Date(row.startedAt.getTime() + row.dueOffsetDays * 86_400_000)
      : null;
  const overdue = row.status === 'active' && dueAt !== null && dueAt.getTime() < now;
  return { ...row, dueAt, overdue };
}

/**
 * GET /projects/:projectId/stages — FR-CW-05's tracker. Zero stages is a
 * legitimate 200 (§3.4: a project with no resolved workflow shows an empty
 * tracker, never an error). The current stage carries `unmet` so §16.5 can
 * render the disabled advance action with its reasons without provoking a 422.
 */
export async function getStageTracker(project: ProjectRow): Promise<StageTracker> {
  const rows = await repo.listProjectStages(project.id);
  const now = Date.now();
  const stages = rows.map((row) => toStageView(row, now));

  const activeRow = rows.find((row) => row.status === 'active');
  if (!activeRow) {
    return { stages, current: null }; // finished tracker or no workflow at all
  }

  const facts = await repo.collectGateFacts(project.id, activeRow);
  const current: CurrentStageView = {
    ...toStageView(activeRow, now),
    unmet: evaluateGates(activeRow, facts),
  };
  return { stages, current };
}

/**
 * POST /projects/:projectId/stages/advance — FR-CW-06 in one transaction.
 *
 * The caller's permission (§4.6) and the gates (§11.14) are separate checks:
 * a permitted supervisor still gets 422 with `details[].path = 'unmet'` when
 * conditions fail. Completion + activation are conditional UPDATEs, so a
 * concurrent advance loses cleanly (409) and I16's partial unique index is
 * the final backstop (23505 → 409). The final stage completing leaves ZERO
 * active rows — I16 says *at most* one — and `project.status` is untouched
 * (§5.9: completion and archiving remain admin actions).
 */
export async function advanceStage(project: ProjectRow, actorId: string): Promise<StageTracker> {
  const current = await repo.findActiveStage(project.id);
  if (!current) {
    throw new ConflictError('This project has no active stage to advance');
  }

  const facts = await repo.collectGateFacts(project.id, current);
  const unmet = evaluateGates(current, facts);
  if (unmet.length > 0) {
    throw new BusinessRuleError(
      `Cannot advance — requirements not met: ${unmet.join(', ')}`,
      unmet.map((gate) => ({ path: 'unmet', message: gate })),
    );
  }

  const next = await repo.findNextStage(project.id, current.position);

  try {
    await db.transaction(async (tx) => {
      const completed = await repo.completeStage(current.id, actorId, tx);
      if (!completed) {
        throw new ConflictError('The active stage changed — reload and try again');
      }
      if (next) {
        const activated = await repo.activateStage(next.id, actorId, tx);
        if (!activated) {
          throw new ConflictError('The next stage is no longer pending — reload and try again');
        }
      }
      // No next row: the final stage completed and zero rows are active (I16).
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Two advances raced; the index refuses double-active (I16).
      throw new ConflictError('The stage tracker changed — reload and try again');
    }
    throw err;
  }

  return getStageTracker(project);
}
