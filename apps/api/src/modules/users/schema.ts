import { z } from 'zod';

import { ROLES } from '../../lib/roles.js';
import { paginationQuerySchema } from '../../validators/common.js';
import {
  normalizeRegistrationNumber,
  STUDENT_REGISTRATION_HINT,
  STUDENT_REGISTRATION_PATTERN,
} from './registration.js';

/**
 * Trimmed, upper-cased, 1–32 characters, nullable. The *shape* rule for
 * students is applied in `superRefine` (create) and in the service (patch,
 * where the target's role is only known after a read) — supervisors and
 * administrators may carry any staff number.
 */
const registrationNumberSchema = z
  .string()
  .transform(normalizeRegistrationNumber)
  .pipe(
    z
      .string()
      .min(1, 'Registration number cannot be empty')
      .max(32, 'Registration number cannot exceed 32 characters'),
  )
  .nullable();

/** Managed department (design 2026-10-28); NULL = unaffiliated. */
const departmentIdSchema = z.string().uuid('Invalid department id').nullable();

/**
 * Admin account provisioning — intentionally *no password field*:
 * the invited user sets their own password during activation.
 */
export const createUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    email: z.string().trim().toLowerCase().email().max(255),
    role: z.enum(ROLES).default('student'),
    // Students always need a registration number, in `FAC/YY/DEPT/NNNNN`
    // form; supervisors may optionally have one (staff number).
    registrationNumber: registrationNumberSchema.optional(),
    departmentId: departmentIdSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role !== 'student') return;
    if (!value.registrationNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationNumber'],
        message: 'Registration number is required for students',
      });
    } else if (!STUDENT_REGISTRATION_PATTERN.test(value.registrationNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationNumber'],
        message: STUDENT_REGISTRATION_HINT,
      });
    }
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** `/users/:userId` path parameter. */
export const userIdParamsSchema = z.object({
  userId: z.string().uuid('Invalid user id'),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;

/**
 * GET /users — search, filter, paginate:
 *   ?q=ali                      matches first name, last name, email, or department name
 *   ?role=…                     exact role
 *   ?isActive=…                 exact state ('true'|'false' — never coerce.boolean,
 *                               it parses the string 'false' as true)
 *   ?departmentId=<uuid>        managed department
 *   ?missingRegistrationNumber=true   students with no number (grandfathering banner)
 */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(255).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  departmentId: z.string().uuid('Invalid department id').optional(),
  missingRegistrationNumber: z
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
    registrationNumber: registrationNumberSchema,
    departmentId: departmentIdSchema,
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
