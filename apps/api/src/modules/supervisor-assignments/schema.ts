import { z } from 'zod';

/** `/projects/:projectId/supervisor` path parameters. */
export const assignmentParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

export type AssignmentParams = z.infer<typeof assignmentParamsSchema>;

/**
 * POST/PATCH body. No isPrimary: under the MVP single-active model the
 * active assignment is by definition the primary one.
 */
export const assignSupervisorSchema = z.object({
  supervisorId: z.string().uuid('Invalid supervisor id'),
});

export type AssignSupervisorInput = z.infer<typeof assignSupervisorSchema>;
