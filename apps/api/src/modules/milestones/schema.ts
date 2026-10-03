import { z } from 'zod';

/** `/milestone-templates/:templateId` — local shape (§11.4 names the param). */
export const templateParamsSchema = z.object({
  templateId: z.string().uuid('Invalid template id'),
});

export const milestoneParamsSchema = z.object({
  milestoneId: z.string().uuid('Invalid milestone id'),
});

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

/** POST /projects/:projectId/milestones — supervisor/admin create (§11.4). */
export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().max(5000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
});

/** PATCH /milestones/:milestoneId — at least one editable field. */
export const patchMilestoneSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.description === undefined && value.dueAt === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one of title, description or dueAt is required',
      });
    }
  });

/**
 * POST /milestones/:milestoneId/status — §11.4's target values.
 * `overdue` is absent because it is computed, never stored (§5.6); which of
 * these four a role may pick is the §11.4 role matrix, enforced in the service.
 */
export const changeMilestoneStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'submitted', 'approved']),
});

/** PUT /projects/:projectId/milestones/reorder — `{order: uuid[]}` (§11.4). */
export const reorderMilestonesSchema = z.object({
  order: z.array(z.string().uuid('Invalid milestone id')).max(500),
});

/** POST /projects/:projectId/milestones/from-template — `{templateId}`. */
export const fromTemplateSchema = z.object({
  templateId: z.string().uuid('Invalid template id'),
});

/** POST /milestone-templates — admin (§11.4); items default to empty (§8.5). */
export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: z.string().max(5000).nullable().optional(),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Item title is required').max(255),
        description: z.string().max(5000).nullable().optional(),
        dueOffsetDays: z.number().int().min(0).max(3650),
      }),
    )
    .max(50)
    .optional(),
});

/** PATCH /milestone-templates/:templateId — at least one field (ADR-05: whole edit). */
export const patchTemplateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1, 'Item title is required').max(255),
          description: z.string().max(5000).nullable().optional(),
          dueOffsetDays: z.number().int().min(0).max(3650),
        }),
      )
      .max(50)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.name === undefined && value.description === undefined && value.items === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one of name, description or items is required',
      });
    }
  });

export type MilestoneParams = z.infer<typeof milestoneParamsSchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type TemplateParams = z.infer<typeof templateParamsSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type PatchMilestoneInput = z.infer<typeof patchMilestoneSchema>;
export type ChangeMilestoneStatusInput = z.infer<typeof changeMilestoneStatusSchema>;
export type ReorderMilestonesInput = z.infer<typeof reorderMilestonesSchema>;
export type FromTemplateInput = z.infer<typeof fromTemplateSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type PatchTemplateInput = z.infer<typeof patchTemplateSchema>;
export type TemplateItemInput = CreateTemplateInput['items'] extends
  | Array<infer T>
  | undefined
  ? T
  : never;
