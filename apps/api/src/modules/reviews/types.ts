import type { reviews } from '../../schema/index.js';
import type { SubmissionRow, SubmissionStatus } from '../submissions/types.js';
import type { PublicUser, UserRow } from '../users/types.js';

export type ReviewRow = typeof reviews.$inferSelect;
export type ReviewDecision = ReviewRow['decision'];

/** Row joined with its reviewer — every read response carries the PublicUser. */
export interface ReviewWithReviewer extends ReviewRow {
  reviewer: UserRow;
}

/**
 * The API shape of a review (§11.6). Append-only: this view is produced at
 * insert time and can never change — there is no UPDATE route for the row it
 * describes (I8).
 */
export interface ReviewView {
  id: string;
  proposalId: string | null;
  submissionId: string | null;
  decision: ReviewDecision;
  comment: string | null;
  createdAt: Date;
  reviewer: PublicUser;
}

/**
 * `GET /projects/:projectId/reviews` — the cross-submission history (§11.6).
 * Each entry names its submission so a client can group without a second join.
 */
export interface ProjectReviewView extends ReviewView {
  submission: Pick<SubmissionRow, 'id' | 'title'> & { status: SubmissionStatus };
}
