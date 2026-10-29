import { z } from 'zod';

import { paginationQuerySchema } from '../../validators/common.js';

/**
 * `:departmentId` path parameter.
 */
export const departmentParamsSchema = z.object({
  departmentId: z.string().uuid('Invalid department id'),
});

/**
 * The `DEPT` segment of a student registration number (`CST/22/SWE/00825`).
 * Trimmed and upper-cased before the shape check, so `swe` is stored as `SWE`.
 * New departments always require one (design 2026-10-28); NULL is reserved for
 * rows created by the legacy backfill, which an admin completes later.
 */
const departmentCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{2,4}$/, 'Code must be 2–4 letters, e.g. SWE'),
  );

/**
 * GET /departments — active rows by default. `includeArchived` and
 * `missingCode` are administrator-only (the service enforces it: the route is
 * readable by any authenticated user, these two views are not).
 */
export const listDepartmentsQuerySchema = paginationQuerySchema.extend({
  // Enum, not coerce.boolean(): z.coerce.boolean('false') is `true`.
  includeArchived: z.enum(['true', 'false']).optional(),
  missingCode: z.enum(['true', 'false']).optional(),
});

/** POST /departments — an administrator defines the managed list. */
export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  code: departmentCodeSchema,
});

/**
 * PATCH /departments/:departmentId — rename, re-code, archive or reactivate.
 * `code` is never nullable here: completing a legacy row's code is the use
 * case, clearing it is not (a re-code is an edit, not a deletion).
 */
export const patchDepartmentSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255).optional(),
    code: departmentCodeSchema.optional(),
    archived: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.name === undefined && value.code === undefined && value.archived === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one of name, code or archived is required',
      });
    }
  });

export type DepartmentParams = z.infer<typeof departmentParamsSchema>;
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type PatchDepartmentInput = z.infer<typeof patchDepartmentSchema>;
