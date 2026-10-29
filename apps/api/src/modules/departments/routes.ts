import { Router } from 'express';

import { requireRole } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  createDepartmentSchema,
  departmentParamsSchema,
  listDepartmentsQuerySchema,
  patchDepartmentSchema,
} from './schema.js';

const router = Router();

/**
 * §9.4 guard order: authenticate (global) → requireRole → validate → handler.
 *
 * The managed list is read by every authenticated account because the user
 * form, the workflow builder and the profile display all need it; only an
 * administrator may define, rename, re-code, archive or reactivate. No route
 * is public, so §12.2's allowlist is unchanged (design 2026-10-28 §5).
 */

router.get(
  '/departments',
  validate(listDepartmentsQuerySchema, 'query'),
  controller.list,
);

router.get(
  '/departments/:departmentId',
  validate(departmentParamsSchema, 'params'),
  controller.show,
);

router.post(
  '/departments',
  requireRole('administrator'),
  validate(createDepartmentSchema),
  controller.create,
);

router.patch(
  '/departments/:departmentId',
  requireRole('administrator'),
  validate(departmentParamsSchema, 'params'),
  validate(patchDepartmentSchema),
  controller.patch,
);

export default router;
