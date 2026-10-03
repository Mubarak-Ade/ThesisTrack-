import type { feedback } from '../../schema/index.js';
import type { PublicUser, UserRow } from '../users/types.js';

export type FeedbackRow = typeof feedback.$inferSelect;

/** Row joined with its author — every response carries the PublicUser. */
export interface FeedbackWithAuthor extends FeedbackRow {
  author: UserRow;
}

/**
 * The API shape of a feedback entry (§11.7). `Feedback` is discussion, never
 * a decision (§11.7's baseline §23 distinction): there is no `decision`
 * column here and none may be added.
 */
export interface FeedbackView {
  id: string;
  projectId: string;
  submissionId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: PublicUser;
}
