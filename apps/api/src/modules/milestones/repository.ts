import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { milestones } from '../../schema/index.js';
import type { MilestoneRow } from './types.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * Note what is NOT here: `overdue` and `state` (§5.6 computed at read) and
 * the §11.4 role matrix — both are service rules. Positions carry no unique
 * constraint (unlike `workflow_stages`): milestone order is rewritten wholesale
 * by reorder, and gaps from a DELETE are legal until the next reorder.
 */

/** Multi-statement units run inside the caller's transaction (§9.1). */
export type WriteExecutor = Pick<typeof db, 'insert' | 'update' | 'delete'>;

/* ------------------------------------------------------------------ reads */

export function listForProject(projectId: string): Promise<MilestoneRow[]> {
  return db.query.milestones.findMany({
    where: eq(milestones.projectId, projectId),
    orderBy: [asc(milestones.position), asc(milestones.createdAt), asc(milestones.id)],
  });
}

/** Returns undefined for unknown *and* malformed ids (never reaches Postgres). */
export function findMilestoneById(id: string): Promise<MilestoneRow | undefined> {
  return db.query.milestones.findFirst({ where: eq(milestones.id, id) });
}

/**
 * Next append position. MAX rather than COUNT: a DELETE leaves a gap, and
 * reusing it would silently reorder relative to rows that did not move.
 */
export async function nextPosition(projectId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${milestones.position})` })
    .from(milestones)
    .where(eq(milestones.projectId, projectId));
  const max = rows[0]?.max;
  return max === null || max === undefined ? 0 : Number(max) + 1;
}

/* ---------------------------------------------------------------- writes */

export async function insertMilestone(
  values: typeof milestones.$inferInsert,
  executor: WriteExecutor = db,
): Promise<MilestoneRow> {
  const [created] = await executor.insert(milestones).values(values).returning();
  return created;
}

export async function insertMilestones(
  values: Array<typeof milestones.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<MilestoneRow[]> {
  if (values.length === 0) return [];
  return executor.insert(milestones).values(values).returning();
}

export async function updateMilestone(
  id: string,
  values: Partial<typeof milestones.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<MilestoneRow | undefined> {
  const [updated] = await executor
    .update(milestones)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(milestones.id, id))
    .returning();
  return updated;
}

export async function deleteMilestone(
  id: string,
  executor: WriteExecutor = db,
): Promise<MilestoneRow | undefined> {
  const [deleted] = await executor.delete(milestones).where(eq(milestones.id, id)).returning();
  return deleted;
}

/**
 * §11.4 status flip, conditioned on the status the guard/service read — a
 * racing second change loses cleanly (undefined → 409) instead of clobbering,
 * the same discipline `transitionProposal` uses (§5.4).
 */
export async function changeStatus(
  id: string,
  fromStatus: MilestoneRow['status'],
  toStatus: MilestoneRow['status'],
  completedAt: Date | null,
  executor: WriteExecutor = db,
): Promise<MilestoneRow | undefined> {
  const [updated] = await executor
    .update(milestones)
    .set({ status: toStatus, completedAt, updatedAt: new Date() })
    .where(and(eq(milestones.id, id), eq(milestones.status, fromStatus)))
    .returning();
  return updated;
}

/** Reorder primitive — scoped to the owning project so an id cannot escape. */
export async function setPosition(
  id: string,
  projectId: string,
  position: number,
  executor: WriteExecutor = db,
): Promise<void> {
  await executor
    .update(milestones)
    .set({ position, updatedAt: new Date() })
    .where(and(eq(milestones.id, id), eq(milestones.projectId, projectId)));
}
