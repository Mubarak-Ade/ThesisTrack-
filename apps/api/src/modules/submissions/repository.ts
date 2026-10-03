import { and, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { milestones, submissionVersions, submissions } from '../../schema/index.js';
import type {
  SubmissionListFilters,
  SubmissionRow,
  SubmissionVersionRow,
  SubmissionWithSubmitter,
} from './types.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * **I7, structurally enforced:** this module exports *insert* operations for
 * `submission_versions` and nothing else — there is no `updateVersion`, no
 * `deleteVersion`, no `patchVersion`. A version is written once and read
 * forever (§5.5 LOCKED, §12 I7); the only statement that can remove version
 * rows is the deletion of the whole *draft* submission (§14.6), which is a
 * `submissions` statement and never targets a version directly.
 */

/** Multi-statement units run inside the caller's transaction. */
export type WriteExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

/* ------------------------------------------------------------------ reads */

export function findSubmissionById(id: string): Promise<SubmissionRow | undefined> {
  return db.query.submissions.findFirst({ where: eq(submissions.id, id) });
}

export function findSubmissionDetailById(id: string): Promise<SubmissionWithSubmitter | undefined> {
  return db.query.submissions.findFirst({
    where: eq(submissions.id, id),
    with: { submitter: true },
  });
}

/** The download guard's read: a version together with its parent submission. */
export function findVersionWithSubmission(
  id: string,
): Promise<(SubmissionVersionRow & { submission: SubmissionRow }) | undefined> {
  return db.query.submissionVersions.findFirst({
    where: eq(submissionVersions.id, id),
    with: { submission: true },
  });
}

export function findVersionById(id: string): Promise<SubmissionVersionRow | undefined> {
  return db.query.submissionVersions.findFirst({ where: eq(submissionVersions.id, id) });
}

/** GET /projects/:projectId/submissions — §11.5 `?milestoneId&status`. */
export async function listSubmissions(
  projectId: string,
  filters: SubmissionListFilters,
): Promise<SubmissionWithSubmitter[]> {
  const conditions: SQL[] = [eq(submissions.projectId, projectId)];
  if (filters.milestoneId) {
    conditions.push(eq(submissions.milestoneId, filters.milestoneId));
  }
  if (filters.status) {
    conditions.push(eq(submissions.status, filters.status));
  }

  return db.query.submissions.findMany({
    where: and(...conditions),
    orderBy: [desc(submissions.createdAt), desc(submissions.id)],
    with: { submitter: true },
  });
}

/** GET /submissions/:submissionId/versions — immutable history, newest first. */
export function listVersions(submissionId: string): Promise<SubmissionVersionRow[]> {
  return db.query.submissionVersions.findMany({
    where: eq(submissionVersions.submissionId, submissionId),
    orderBy: [desc(submissionVersions.versionNumber), desc(submissionVersions.id)],
  });
}

/**
 * `version_number = max + 1` (§11.5) — 1 for a submission with no versions.
 * Read *before* the insert so the server-derived filename can carry the
 * number; `UNIQUE(submission_id, version_number)` stays the race backstop (I7).
 */
export async function nextVersionNumber(
  submissionId: string,
  executor: WriteExecutor = db,
): Promise<number> {
  const rows = await executor
    .select({ next: sql<number>`coalesce(max(${submissionVersions.versionNumber}), 0) + 1` })
    .from(submissionVersions)
    .where(eq(submissionVersions.submissionId, submissionId));
  return Number(rows[0]?.next ?? 1);
}

/** Transaction-scoped read: does this submission carry content yet? */
export async function countVersions(
  submissionId: string,
  executor: WriteExecutor = db,
): Promise<number> {
  const rows = await executor
    .select({ total: sql<number>`count(*)` })
    .from(submissionVersions)
    .where(eq(submissionVersions.submissionId, submissionId));
  return Number(rows[0]?.total ?? 0);
}

/**
 * Milestone reference check for create/patch: the milestone must exist AND
 * belong to the submission's project. Answered as a request error (400) so a
 * caller cannot probe another project's milestone ids through this endpoint.
 */
export async function findMilestoneInProject(
  milestoneId: string,
  projectId: string,
  executor: WriteExecutor = db,
): Promise<{ id: string } | undefined> {
  const rows = await executor
    .select({ id: milestones.id })
    .from(milestones)
    .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)));
  return rows[0];
}

/** §14.6: the bytes a draft submission owns, read before its rows go away. */
export async function listStorageKeys(
  submissionId: string,
  executor: WriteExecutor = db,
): Promise<string[]> {
  const rows = await executor
    .select({ storageKey: submissionVersions.storageKey })
    .from(submissionVersions)
    .where(
      and(
        eq(submissionVersions.submissionId, submissionId),
        isNotNull(submissionVersions.storageKey),
      ),
    );
  return rows.map((row) => row.storageKey as string);
}

/* ----------------------------------------------------------------- writes */

export async function insertSubmission(
  values: typeof submissions.$inferInsert,
  executor: WriteExecutor = db,
): Promise<SubmissionRow> {
  const [created] = await executor.insert(submissions).values(values).returning();
  return created;
}

/** The only kind of version write that exists (§5.5, I7). */
export async function insertVersion(
  values: typeof submissionVersions.$inferInsert,
  executor: WriteExecutor = db,
): Promise<SubmissionVersionRow> {
  const [created] = await executor.insert(submissionVersions).values(values).returning();
  return created;
}

/**
 * Conditional edit — only a `draft` flips, so a state that moved between the
 * workflow guard and this write reports the same 422 instead of silently
 * editing a submitted record.
 */
export async function editSubmissionIfDraft(
  id: string,
  values: { title?: string; milestoneId?: string | null },
  executor: WriteExecutor = db,
): Promise<SubmissionRow | undefined> {
  const [updated] = await executor
    .update(submissions)
    .set({
      // Spread so `undefined` keys never reach SQL (drizzle would write NULL).
      ...(values.title !== undefined ? { title: values.title } : {}),
      ...(values.milestoneId !== undefined ? { milestoneId: values.milestoneId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(submissions.id, id), eq(submissions.status, 'draft')))
    .returning();
  return updated;
}

/** §11.5 submit — `draft` → `submitted`, `submitted_at = now()`. */
export async function markSubmittedIfDraft(
  id: string,
  executor: WriteExecutor = db,
): Promise<SubmissionRow | undefined> {
  const [updated] = await executor
    .update(submissions)
    .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(submissions.id, id), eq(submissions.status, 'draft')))
    .returning();
  return updated;
}

/**
 * §11.5 append-version status, reconciled with the §5.5 LOCKED flow:
 *
 *   revision_required → submitted  (the revision arrow — `submitted_at = now`)
 *   draft             → draft      (the diagram's *optional* attach step: the
 *                                   student still has to call `/submit`)
 *
 * Only those two starting states are legal; any other status returns
 * `undefined` and the service answers with the workflow guard's 422.
 */
export async function markAppendStatus(
  id: string,
  executor: WriteExecutor = db,
): Promise<SubmissionRow | undefined> {
  const flipped = await executor
    .update(submissions)
    .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(submissions.id, id), eq(submissions.status, 'revision_required')))
    .returning();
  if (flipped.length > 0) {
    return flipped[0];
  }
  const [stayed] = await executor
    .update(submissions)
    .set({ updatedAt: new Date() })
    .where(and(eq(submissions.id, id), eq(submissions.status, 'draft')))
    .returning();
  return stayed;
}

/**
 * DELETE /submissions/:submissionId — §14.6: draft only, and the condition is
 * re-checked *inside* the statement so the invariant survives a race. The
 * cascade removes the version rows; `listStorageKeys` already told the service
 * which bytes to unlink.
 */
export async function deleteSubmissionIfDraft(
  id: string,
  executor: WriteExecutor = db,
): Promise<SubmissionRow | undefined> {
  const [removed] = await executor
    .delete(submissions)
    .where(and(eq(submissions.id, id), eq(submissions.status, 'draft')))
    .returning();
  return removed;
}
