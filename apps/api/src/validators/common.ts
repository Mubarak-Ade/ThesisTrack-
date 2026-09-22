import { z } from 'zod';

/** `:id` path parameter — every resource id in the schema is a UUID. */
export const idParamsSchema = z.object({
  id: z.string().uuid('Invalid id'),
});

/** Standard password rules for every flow that sets a password. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128);

/** Standard pagination for list endpoints: `?page=1&limit=20`. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type IdParams = z.infer<typeof idParamsSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
