import { db } from '../../config/db.js';
import { BusinessRuleError, ConflictError, ValidationError } from '../../errors/index.js';
import { notify } from '../../lib/notify.js';
import type { Role } from '../../lib/roles.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { ProjectRow } from '../projects/types.js';
import { findActiveSupervisorIdForStudent } from '../supervisor-assignments/service.js';
import * as repo from './repository.js';
import * as templates from './templates.js';
import type {
  ChangeMilestoneStatusInput,
  CreateMilestoneInput,
  PatchMilestoneInput,
  ReorderMilestonesInput,
} from './schema.js';
import type {
  MilestoneRow,
  MilestoneStatus,
  MilestoneTemplateRow,
  MilestoneView,
} from './types.js';

/*
 * §11.4 + §5.6 business rules.
 *
 * Two behaviors this module exists for:
 *   1. the per-role status target matrix — guards decide WHO may call
 *      (owner / assigned supervisor / admin), this decides WHAT a student
 *      may pick (§11.4's restricted chain vs the supervisor's "any");
 *   2. overdue as a COMPUTED read — never stored (§5.6), so no cron and no drift.
 */

/** §5.6 — computed, never written: `due_at < now() AND status ≠ approved`. */
export function isOverdue(row: Pick<MilestoneRow, 'dueAt' | 'status'>, now = Date.now()): boolean {
  return row.dueAt !== null && row.dueAt.getTime() < now && row.status !== 'approved';
}

/** Row + §5.6 computed `overdue` and canonical `state` (overdue overrides). */
export function toMilestoneView(row: MilestoneRow, now = Date.now()): MilestoneView {
  const overdue = isOverdue(row, now);
  return { ...row, overdue, state: overdue ? 'overdue' : row.status };
}

/** For the milestone resource guard (§9.4 layer 2). */
export function getMilestoneById(id: string): Promise<MilestoneRow | undefined> {
  return repo.findMilestoneById(id);
}

/* ------------------------------------------------------------------ reads */

/** GET /projects/:projectId/milestones — every milestone, order + computed. */
export async function listMilestonesFor(project: ProjectRow): Promise<MilestoneView[]> {
  const rows = await repo.listForProject(project.id);
  const now = Date.now();
  return rows.map((row) => toMilestoneView(row, now));
}

/* ----------------------------------------------------------------- writes */

/** POST /projects/:projectId/milestones — appended after the current max. */
export async function createMilestone(
  project: ProjectRow,
  input: CreateMilestoneInput,
): Promise<MilestoneView> {
  const position = await repo.nextPosition(project.id);
  const created = await repo.insertMilestone({
    projectId: project.id,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    position,
    status: 'pending',
  });
  return toMilestoneView(created);
}

/** PATCH /milestones/:milestoneId — supervisor/admin metadata edit (§11.4). */
export async function patchMilestone(
  milestone: MilestoneRow,
  input: PatchMilestoneInput,
): Promise<MilestoneView> {
  const updated = await repo.updateMilestone(milestone.id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt === null ? null : new Date(input.dueAt) } : {}),
  });
  return toMilestoneView(updated ?? milestone);
}

export async function deleteMilestone(milestone: MilestoneRow): Promise<MilestoneView> {
  const removed = await repo.deleteMilestone(milestone.id);
  return toMilestoneView(removed ?? milestone);
}

/* ------------------------------------------------- status matrix (§11.4) */

/**
 * The §11.4 role table, pure — the unit test pins it cell by cell.
 *
 *   student       pending → in_progress → submitted   (the chain, adjacent steps)
 *   supervisor    any target from any state (and sets completed_at on approved)
 *   administrator any target from any state
 *
 * `approved` is never a student target; `overdue` is never ANY target (it is
 * computed, §5.6) — it cannot appear as `to` because the schema refuses it.
 */
export function isStatusTransitionAllowed(
  role: Role,
  from: MilestoneRow['status'],
  to: MilestoneStatus,
): boolean {
  if (role === 'supervisor' || role === 'administrator') {
    return true; // §11.4: "any"
  }
  if (role !== 'student') return false;
  if (from === 'pending' && to === 'in_progress') return true;
  if (from === 'in_progress' && to === 'submitted') return true;
  return false;
}

/**
 * POST /milestones/:milestoneId/status — role gates the target, the write is
 * conditioned on the status that was read (a racing flip → 409, not a
 * clobber). `completed_at` is written when reaching `approved` and cleared
 * when leaving it — the column means "this was approved", so an un-approve
 * must not leave it behind (§11.4 supervisor row).
 */
export async function changeStatus(
  project: ProjectRow,
  milestone: MilestoneRow,
  input: ChangeMilestoneStatusInput,
  user: AuthUser,
): Promise<MilestoneView> {
  const to = input.status;

  if (milestone.status === to) {
    throw new BusinessRuleError(`Milestone is already ${milestone.status}`, [
      { path: 'status', message: `Milestone is already ${milestone.status}` },
    ]);
  }

  if (!isStatusTransitionAllowed(user.role, milestone.status, to)) {
    throw new BusinessRuleError(`Cannot move milestone to '${to}'`, [
      {
        path: 'status',
        message:
          user.role === 'student'
            ? `Students may move a milestone along pending → in_progress → submitted only`
            : `Transition not permitted from status '${milestone.status}'`,
      },
    ]);
  }

  // §15.2 "Milestone completed → supervisor + student" — recipients resolved
  // before the unit (§15.4); the project came from the resource guard.
  const supervisorId = await findActiveSupervisorIdForStudent(project.studentId);

  const completedAt = to === 'approved' ? new Date() : null;
  const updated = await db.transaction(async (tx) => {
    const row = await repo.changeStatus(milestone.id, milestone.status, to, completedAt, tx);
    if (!row) {
      return undefined; // a concurrent transition — the caller answers 409
    }
    // Only the completion announces itself: pending → in_progress → submitted
    // is the student's own progress and §15.2 lists no row for it. The
    // notification and the status flip commit as one unit (§15.4).
    if (to === 'approved') {
      for (const userId of [project.studentId, supervisorId]) {
        if (!userId) continue;
        await notify(
          {
            userId,
            type: 'milestone',
            title: 'Milestone completed',
            message: `Milestone "${milestone.title}" has been completed.`,
            resourceType: 'milestone',
            resourceId: milestone.id,
          },
          tx,
        );
      }
    }
    return row;
  });
  if (!updated) {
    throw new ConflictError('The milestone changed — reload and try again');
  }
  return toMilestoneView(updated);
}

/* -------------------------------------------------------------- reorder */

/**
 * PUT /projects/:projectId/milestones/reorder — one transaction, positions
 * contiguous from 0 (§11.4; 0-based to match §5.4's materialisation, which
 * writes `position = items index`). `order` must be the EXACT set of this
 * project's milestone ids: a partial order would leave silent gaps, and an
 * id from another project would be a cross-project write.
 */
export async function reorderMilestones(
  project: ProjectRow,
  input: ReorderMilestonesInput,
): Promise<MilestoneView[]> {
  const rows = await repo.listForProject(project.id);
  const known = new Set(rows.map((row) => row.id));
  const incoming = new Set(input.order);

  const valid =
    input.order.length === rows.length &&
    incoming.size === input.order.length && // no duplicates
    input.order.every((id) => known.has(id)); // exact set, same project

  if (!valid) {
    throw new BusinessRuleError('Invalid milestone order', [
      {
        path: 'order',
        message: `order must list each of the project's ${rows.length} milestone ids exactly once`,
      },
    ]);
  }

  // Positions have no unique constraint (milestones, unlike workflow_stages),
  // so plain per-row updates inside one transaction are collision-free.
  await db.transaction(async (tx) => {
    for (const [index, id] of input.order.entries()) {
      await repo.setPosition(id, project.id, index, tx);
    }
  });

  const reordered = await repo.listForProject(project.id);
  const now = Date.now();
  return reordered.map((row) => toMilestoneView(row, now));
}

/* --------------------------------------------------------- from-template */

/**
 * POST /projects/:projectId/milestones/from-template — admin materialises a
 * template onto an EXISTING project (§11.4). Offsets anchor to
 * `project.created_at`, the §8.5 formula — a template applied at month three
 * honestly reports those milestones as already due rather than silently
 * re-dating the curriculum.
 */
export async function applyTemplate(
  project: ProjectRow,
  template: MilestoneTemplateRow,
): Promise<MilestoneView[]> {
  if (template.items.length === 0) {
    return []; // empty template → zero milestones, never a failure (§5.4 twin)
  }

  let position = await repo.nextPosition(project.id);
  const base = project.createdAt.getTime();
  const created = await repo.insertMilestones(
    template.items.map((item) => ({
      projectId: project.id,
      title: item.title.slice(0, 255),
      description: item.description,
      position: position++,
      dueAt: new Date(base + item.dueOffsetDays * 86_400_000),
      status: 'pending' as const,
    })),
  );

  const now = Date.now();
  return created.map((row) => toMilestoneView(row, now));
}

/**
 * POST …/from-template — resolves `templateId` with the §5.4 templateId
 * discipline: an unknown *body* id is a 400 on that field, not a 404 (path
 * params get the 404; request data gets the 400), matching how approval's
 * explicit template resolution behaves.
 */
export async function applyTemplateById(
  project: ProjectRow,
  templateId: string,
): Promise<MilestoneView[]> {
  const template = await templates.findTemplateById(templateId);
  if (!template) {
    throw new ValidationError('Invalid template', [
      { path: 'templateId', message: 'Milestone template not found' },
    ]);
  }
  return applyTemplate(project, template);
}
