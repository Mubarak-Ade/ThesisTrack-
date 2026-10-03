import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { feedback } from '../../schema/index.js';
import type { FeedbackRow, FeedbackWithAuthor } from './types.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * Unlike `reviews` (I8, append-only), feedback is discussion and may be
 * edited or removed under §11.7's authorship rules — so update/delete
 * functions exist here, and the authorization that gates them lives in
 * `authz/feedback-access.ts`.
 */

/** Multi-statement units run inside the caller's transaction. */
export type WriteExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

/* ------------------------------------------------------------------ reads */

export function findFeedbackById(id: string): Promise<FeedbackWithAuthor | undefined> {
  return db.query.feedback.findFirst({
    where: eq(feedback.id, id),
    with: { author: true },
  });
}

/**
 * `GET /projects/:projectId/feedback` — the project's **own** thread:
 * rows with no submission attached. Submission-scoped rows are read through
 * the submission-scoped route, so the two lists partition a project's
 * feedback instead of one silently swallowing the other.
 */
export function listProjectFeedback(projectId: string): Promise<FeedbackWithAuthor[]> {
  return db.query.feedback.findMany({
    where: and(eq(feedback.projectId, projectId), isNull(feedback.submissionId)),
    with: { author: true },
    orderBy: [asc(feedback.createdAt), asc(feedback.id)],
  });
}

/** `GET /submissions/:submissionId/feedback` — that submission's thread. */
export function listSubmissionFeedback(submissionId: string): Promise<FeedbackWithAuthor[]> {
  return db.query.feedback.findMany({
    where: eq(feedback.submissionId, submissionId),
    with: { author: true },
    orderBy: [asc(feedback.createdAt), asc(feedback.id)],
  });
}

/* ----------------------------------------------------------------- writes */

export async function insertFeedback(
  values: { projectId: string; submissionId: string | null; authorId: string; body: string },
  executor: WriteExecutor = db,
): Promise<FeedbackRow> {
  const [row] = await executor.insert(feedback).values(values).returning();
  return row!;
}

export async function updateFeedback(
  id: string,
  body: string,
  executor: WriteExecutor = db,
): Promise<FeedbackRow | undefined> {
  const [row] = await executor
    .update(feedback)
    .set({ body, updatedAt: new Date() })
    .where(eq(feedback.id, id))
    .returning();
  return row;
}

export async function deleteFeedback(
  id: string,
  executor: WriteExecutor = db,
): Promise<FeedbackRow | undefined> {
  const [row] = await executor.delete(feedback).where(eq(feedback.id, id)).returning();
  return row;
}
