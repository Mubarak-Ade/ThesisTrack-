import { z } from 'zod';

/** `:submissionId` on the submission-scoped review routes. */
export const submissionReviewParamsSchema = z.object({
  submissionId: z.string().uuid('Invalid submission id'),
});

/** `:projectId` on `GET /projects/:projectId/reviews`. */
export const projectReviewParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

/**
 * POST /submissions/:submissionId/reviews — §11.6 body `{decision, comment}`.
 *
 * Unlike §11.3 (proposals), §11.6 does **not** require `comment` for
 * `revision_required` / `rejected` — the spec states that rule only where it
 * means it, so it stays optional here.
 */
export const createReviewSchema = z.object({
  decision: z.enum(['approved', 'revision_required', 'rejected']),
  comment: z.string().trim().min(1).max(10000).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
