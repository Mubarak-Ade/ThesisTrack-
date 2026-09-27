import { z } from 'zod';

import { ROLES } from '../../lib/roles.js';
import { paginationQuerySchema } from '../../validators/common.js';

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

/** `/users/:userId` path parameter. */
export const userIdParamsSchema = z.object({
  userId: z.string().uuid('Invalid user id'),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;

/**
 * GET /users — search, filter, paginate:
 *   ?q=ali      matches first name, last name, or email (case-insensitive)
 *   ?role=…     exact role
 *   ?isActive=… exact state ('true'|'false' — never coerce.boolean, it
 *               parses the string 'false' as true)
 */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(255).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * PATCH /users/:userId — partial update; at least one field required.
 * No email: it is the account's identity (a change flow would need
 * re-verification, which is out of scope here).
 */
export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    role: z.enum(ROLES),
    isActive: z.boolean(),
    registrationNumber: z.string().trim().min(1).max(32).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** POST /users/import — bulk provisioning, capped per request. */
export const importUsersSchema = z.object({
  users: z
    .array(createUserSchema)
    .min(1, 'Import must include at least one user')
    .max(500, 'Import is limited to 500 users per request'),
});

export type ImportUsersInput = z.infer<typeof importUsersSchema>;
