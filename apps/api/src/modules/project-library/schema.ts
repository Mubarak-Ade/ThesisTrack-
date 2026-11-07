import { z } from 'zod';

import { paginationQuerySchema } from '../../validators/common.js';

/**
 * GET /project-library — the library pages at 10 (max 50), not the generic
 * 20/100, because each row carries a snippet and the screen is a reading view.
 */
export const listLibraryQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(200).optional(),
  status: z.enum(['all', 'active', 'completed', 'archived']).default('all'),
  departmentId: z.string().uuid('Invalid department id').optional(),
});

/** GET /project-library/:projectId */
export const projectLibraryParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

/**
 * POST /project-library/similarity-check — the API seam a future manual
 * create/edit form can call. No write, no screen in v1.
 */
export const similarityCheckSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(500),
  description: z.string().trim().min(1, 'Description is required').max(10000),
  excludeProjectId: z.string().uuid('Invalid project id').optional(),
});

export type ListLibraryQuery = z.infer<typeof listLibraryQuerySchema>;
export type ProjectLibraryParams = z.infer<typeof projectLibraryParamsSchema>;
export type SimilarityCheckBody = z.infer<typeof similarityCheckSchema>;
