import { z } from 'zod';

/** GET /projects/:projectId */
export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project id'),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
