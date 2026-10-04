import { z } from 'zod';
import { paginationQuerySchema } from '../../validators/common.js';

/** `:workflowId` path parameter (§11.14). */
export const workflowParamsSchema = z.object({
  workflowId: z.string().uuid('Invalid workflow id'),
});

/** `:projectId` for the stage endpoints — validated before the guard (§9.4). */
export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

/**
 * One element of `stages[]` (FR-CW-02/03). `id` is optional: present means
 * "update this definition row in place" (whole-set edit), absent means "create".
 * Positions are never accepted from the client — the server renumbers by array
 * order, which is what makes contiguity a server guarantee rather than a hope.
 */
export const stageInputSchema = z.object({
  id: z.string().uuid('Invalid stage id').optional(),
  name: z.string().trim().min(1, 'Stage name is required').max(255),
  description: z.string().max(5000).nullable().optional(),
  dueOffsetDays: z.number().int().min(0).max(3650).nullable().optional(),
  deliverable: z.string().max(255).nullable().optional(),
  responsibleRole: z.enum(['student', 'supervisor', 'administrator']).nullable().optional(),
  requiresSubmission: z.boolean().optional(),
  requiresReview: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
});

/** GET /workflows — §11.14 `?program&includeArchived&page&limit`. */
export const listWorkflowsQuerySchema = paginationQuerySchema.extend({
  program: z.string().max(255).optional(),
  // Enum, not coerce.boolean(): z.coerce.boolean('false') is `true`.
  includeArchived: z.enum(['true', 'false']).optional(),
});

/**
 * POST /workflows — exactly §11.14's body. `is_default` is deliberately absent:
 * the fallback flag is owned by `seed-workflows` (§8.10), not by this API.
 */
export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  program: z.string().max(255).nullable().optional(),
  academicSession: z.string().max(32).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  stages: z.array(stageInputSchema).max(50).optional(),
});

/**
 * PATCH /workflows/:workflowId — metadata and/or the whole `stages[]` set
 * (FR-CW-01/02/03). `archived` is the §11.14 "archive instead" affordance:
 * DELETE is 422 for referenced workflows, so archiving has to live here —
 * the same shape §11.2 gives projects (`PATCH … status`).
 *
 * `isDefault` — **PROPOSED delta (2026-10-04, Phase 13 / user sign-off).**
 * §16.3's workflow builder promises a "set default" affordance, but §11.14
 * froze seven endpoints with no default-setting path, so the ADR-16 fallback
 * target could only be moved by `seed-workflows`. The flag therefore joins
 * this body (true clears every other workflow's flag in the same write;
 * false clears this one). The endpoint count is unchanged — the delta is a
 * request-body field like §11.0.2's `program`. POST still never sets it: a
 * newly created workflow never steals the flag. Flips LOCKED in Phase 16.
 */
export const patchWorkflowSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255).optional(),
    program: z.string().max(255).nullable().optional(),
    academicSession: z.string().max(32).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
    archived: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    stages: z.array(stageInputSchema).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    const keys: Array<keyof typeof value> = [
      'name',
      'program',
      'academicSession',
      'description',
      'archived',
      'isDefault',
      'stages',
    ];
    if (keys.every((key) => value[key] === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one field or stages[] is required',
      });
    }
  });

export type WorkflowParams = z.infer<typeof workflowParamsSchema>;
export type StageProjectParams = z.infer<typeof projectIdParamsSchema>;
export type StageInput = z.infer<typeof stageInputSchema>;
export type ListWorkflowsQuery = z.infer<typeof listWorkflowsQuerySchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type PatchWorkflowInput = z.infer<typeof patchWorkflowSchema>;
