import { z } from 'zod';
import { paginationQuerySchema } from '../../validators/common.js';

/** `proposal_status` members as literals (request shapes live here, §9.6). */
export const PROPOSAL_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
] as const;

export const proposalParamsSchema = z.object({
  proposalId: z.string().uuid('Invalid proposal id'),
});

export const attachmentParamsSchema = z.object({
  attachmentId: z.string().uuid('Invalid attachment id'),
});

/** POST /proposals — title + abstract always; body optional (ADR-14). */
export const createProposalSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(500),
  abstract: z.string().trim().min(1, 'Abstract is required'),
  body: z.string().optional(),
});

/** PATCH /proposals/:proposalId — at least one editable field (§11.3). */
export const patchProposalSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(500).optional(),
    abstract: z.string().trim().min(1, 'Abstract is required').optional(),
    body: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.abstract === undefined && value.body === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one of title, abstract or body is required',
      });
    }
  });

/** GET /proposals — paging plus §11.3's `?status&studentId`. */
export const listProposalsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PROPOSAL_STATUSES).optional(),
  studentId: z.string().uuid('Invalid student id').optional(),
});

/**
 * POST /proposals/:proposalId/review — `comment` required for
 * `revision_required` and `rejected` (§11.3). `templateId` is the optional
 * §5.4 milestone-template selection; absence falls back to the seeded
 * `Default` template by name, so approval never depends on a lookup.
 */
export const reviewProposalSchema = z
  .object({
    decision: z.enum(['approved', 'revision_required', 'rejected']),
    comment: z.string().trim().min(1).max(10000).optional(),
    templateId: z.string().uuid('Invalid template id').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== 'approved' && !value.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'Comment is required for this decision',
      });
    }
  });

export type ProposalParams = z.infer<typeof proposalParamsSchema>;
export type AttachmentParams = z.infer<typeof attachmentParamsSchema>;
export type CreateProposalInput = z.infer<typeof createProposalSchema>;
export type PatchProposalInput = z.infer<typeof patchProposalSchema>;
export type ListProposalsQuery = z.infer<typeof listProposalsQuerySchema>;
export type ReviewProposalInput = z.infer<typeof reviewProposalSchema>;
