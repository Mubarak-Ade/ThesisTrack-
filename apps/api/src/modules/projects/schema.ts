import { z } from 'zod';
import { paginationQuerySchema } from '../../validators/common.js';

/** GET /projects/:projectId */
export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

/** GET /projects — §11.2 `?status&q&page&limit`, scoped by role in the service. */
export const listProjectsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'completed', 'archived']).optional(),
  q: z.string().trim().max(200).optional(),
});

/**
 * POST /projects — admin manual creation (§11.2: legacy/approved outside the
 * flow). `workflowId` is ADR-16's explicit override, branch 1; without it the
 * student's program match → default → none chain runs (§5.9, same resolution
 * as approval).
 */
export const createProjectSchema = z.object({
  studentId: z.string().uuid('Invalid student id'),
  title: z.string().trim().min(1, 'Title is required').max(500),
  description: z.string().trim().min(1, 'Description is required'),
  workflowId: z.string().uuid('Invalid workflow id').optional(),
});

/** PATCH /projects/:projectId — admin only; at least one field (§11.2). */
export const patchProjectSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(500).optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    status: z.enum(['active', 'completed', 'archived']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.description === undefined && value.status === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one of title, description or status is required',
      });
    }
  });

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;
