import { z } from 'zod';

/** `:projectId` on the project-scoped feedback routes. */
export const projectFeedbackParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

/** `:submissionId` on the submission-scoped feedback routes. */
export const submissionFeedbackParamsSchema = z.object({
  submissionId: z.string().uuid('Invalid submission id'),
});

/** `:feedbackId` on `PATCH`/`DELETE /feedback/:feedbackId`. */
export const feedbackParamsSchema = z.object({
  feedbackId: z.string().uuid('Invalid feedback id'),
});

/**
 * §11.7 body `{body}` — required on create and on edit (there is no other
 * field to patch). Sanitization (ADR-14) and the empty-after-clean rule run
 * in the service, so markup that cleans to nothing still answers here rather
 * than silently storing an invisible row.
 */
const bodyField = z.string().trim().min(1, 'Body is required').max(10000);

export const createFeedbackSchema = z.object({ body: bodyField });
export const patchFeedbackSchema = z.object({ body: bodyField });

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type PatchFeedbackInput = z.infer<typeof patchFeedbackSchema>;
