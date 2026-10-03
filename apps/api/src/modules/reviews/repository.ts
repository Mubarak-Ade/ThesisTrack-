import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { milestones, reviews, submissions, users } from '../../schema/index.js';
import type { SubmissionRow, SubmissionStatus } from '../submissions/types.js';
import type { UserRow } from '../users/types.js';
import type { ReviewDecision, ReviewRow, ReviewWithReviewer } from './types.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * **I8, structurally enforced:** this module exports `insertReview` and reads.
 * There is no `updateReview`, no `deleteReview`, no `patchReview` — a review
 * row is written once and read forever (§12 I8, §11.6 REJECTED endpoints).
 * A test asserts this export surface, which is why no PATCH/DELETE route for
 * reviews can be written at all.
 */

/** Multi-statement units run inside the caller's transaction. */
export type WriteExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

/* ------------------------------------------------------------------ reads */

export function listReviewsForSubmission(submissionId: string): Promise<ReviewWithReviewer[]> {
  return db.query.reviews.findMany({
    where: eq(reviews.submissionId, submissionId),
    with: { reviewer: true },
    orderBy: [desc(reviews.createdAt), desc(reviews.id)],
  });
}

/**
 * `GET /projects/:projectId/reviews` — every review across the project's
 * submissions (§11.6 "cross-submission history"). Proposal reviews hang off
 * `proposals` instead (§11.3's own list) and are deliberately out of scope.
 */
export function listReviewsForProject(
  projectId: string,
): Promise<Array<{ review: ReviewRow; submission: SubmissionRow; reviewer: UserRow }>> {
  return db
    .select({ review: reviews, submission: submissions, reviewer: users })
    .from(reviews)
    .innerJoin(submissions, eq(reviews.submissionId, submissions.id))
    .innerJoin(users, eq(reviews.reviewerId, users.id))
    .where(eq(submissions.projectId, projectId))
    .orderBy(desc(reviews.createdAt), desc(reviews.id));
}

/* ----------------------------------------------------------------- writes */

/**
 * The one write that exists for `reviews` (I8). The conditional UPDATE below
 * is the second half of the same guarantee: a decision only lands while the
 * submission is still in an §11.6 input status, so a concurrent decision
 * turns into a refused row rather than two histories.
 */
export async function insertReview(
  values: {
    submissionId: string;
    reviewerId: string;
    decision: ReviewDecision;
    comment: string | null;
  },
  executor: WriteExecutor = db,
): Promise<ReviewRow> {
  const [row] = await executor.insert(reviews).values(values).returning();
  return row!;
}

/**
 * §5.5's decision applied to the submission — `approved` / `revision_required`
 * / `rejected` — but only if it is still in one of the accepted input states
 * (`WHERE … status IN (…)`). Zero rows back = the status moved underneath us.
 */
export async function applyDecisionIfReviewable(
  submissionId: string,
  decision: ReviewDecision,
  accepted: readonly SubmissionStatus[],
  executor: WriteExecutor = db,
): Promise<SubmissionRow | undefined> {
  const [row] = await executor
    .update(submissions)
    .set({ status: decision, updatedAt: new Date() })
    .where(and(eq(submissions.id, submissionId), inArray(submissions.status, [...accepted])))
    .returning();
  return row;
}

/**
 * §5.5's milestone side effect: on `approved`, the submission's milestone
 * becomes `approved` with `completed_at` set. `COALESCE` preserves a
 * completion time an earlier path already wrote, and `status <> 'approved'`
 * makes a repeat call a no-op instead of shifting the timestamp. Returns the
 * row **only when it actually flipped** — §15.2's "Milestone completed"
 * trigger fires on the transition, not on the attempt.
 */
export async function approveMilestoneIfPending(
  milestoneId: string,
  executor: WriteExecutor = db,
): Promise<{ id: string; title: string } | undefined> {
  const [row] = await executor
    .update(milestones)
    .set({
      status: 'approved',
      completedAt: sql`COALESCE(${milestones.completedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(and(eq(milestones.id, milestoneId), ne(milestones.status, 'approved')))
    .returning({ id: milestones.id, title: milestones.title });
  return row;
}
