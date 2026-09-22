import { z } from 'zod';

import { ROLES } from '../../lib/roles.js';

/**
 * Admin account provisioning — intentionally *no password field*:
 * the invited user sets their own password during activation.
 */
export const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(ROLES).default('student'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
