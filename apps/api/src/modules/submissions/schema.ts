import { z } from 'zod';

/** `submission_status` members as literals (request shapes live here, §9.6). */
export const SUBMISSION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
] as const;

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

export const submissionParamsSchema = z.object({
  submissionId: z.string().uuid('Invalid submission id'),
});

export const versionParamsSchema = z.object({
  versionId: z.string().uuid('Invalid version id'),
});

/**
 * POST /submissions — §11.5: `draft`, "multipart optional (file) or JSON
 * (`body`)". The file half arrives through multer (see routes.ts), so this
 * schema describes the fields both encodings share.
 */
export const createSubmissionSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
  milestoneId: z.string().uuid('Invalid milestone id').nullable().optional(),
  title: z.string().trim().min(1, 'Title is required').max(500),
  body: z.string().optional(),
});

/**
 * PATCH /submissions/:submissionId — `draft` only (§11.5), at least one field.
 *
 * `body` is content: versions are immutable (I7), so it is accepted only while
 * the submission has **no** version yet and then materialises version 1 (an
 * INSERT, never an UPDATE — the service enforces that rule).
 */
export const patchSubmissionSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(500).optional(),
    milestoneId: z.string().uuid('Invalid milestone id').nullable().optional(),
    body: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.milestoneId === undefined && value.body === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one of title, milestoneId or body is required',
      });
    }
  });

/**
 * POST /submissions/:submissionId/versions — exactly one of a multipart file
 * or a text `body`. Two encodings reach this schema: JSON (`{body}`) and
 * multipart, where `req.body` is still unparsed when §9.4's validate layer
 * runs — multer creates it afterwards — hence `.nullish()` here and the
 * exclusivity check in the controller, which is the first place that can see
 * which half of §14.2 the request actually carried.
 */
export const appendVersionSchema = z
  .object({
    body: z.string().optional(),
  })
  .nullish();

/** GET /projects/:projectId/submissions — §11.5 `?milestoneId&status`. */
export const listSubmissionsQuerySchema = z.object({
  milestoneId: z.string().uuid('Invalid milestone id').optional(),
  status: z.enum(SUBMISSION_STATUSES).optional(),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type SubmissionParams = z.infer<typeof submissionParamsSchema>;
export type VersionParams = z.infer<typeof versionParamsSchema>;
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type PatchSubmissionInput = z.infer<typeof patchSubmissionSchema>;
export type AppendVersionInput = z.infer<typeof appendVersionSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
