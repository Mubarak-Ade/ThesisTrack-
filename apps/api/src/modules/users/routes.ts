import { Router } from 'express';

import { requireDepartmentScope, requireRole } from '../../authz/index.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { createUserSchema, importUsersSchema, listUsersQuerySchema, updateUserSchema, userIdParamsSchema } from './schema.js';

const router = Router();

// Coordinators resolve to exactly one department before any user route runs.
router.use(requireDepartmentScope());

// All user management is administrator/coordinator-scoped (no public registration).
const manageUsers = requireRole('administrator', 'coordinator');

router.post('/users', manageUsers, validate(createUserSchema), idempotency, controller.create);
router.get('/users', manageUsers, validate(listUsersQuerySchema, 'query'), controller.list);
router.post(
  '/users/import',
  manageUsers,
  validate(importUsersSchema),
  idempotency, // §11.12 — a retried import replays instead of double-provisioning
  controller.importUsers,
);
router.get(
  '/users/:userId',
  manageUsers,
  validate(userIdParamsSchema, 'params'),
  controller.detail,
);
router.patch(
  '/users/:userId',
  manageUsers,
  validate(userIdParamsSchema, 'params'),
  validate(updateUserSchema),
  controller.update,
);
router.post(
  '/users/:userId/invite',
  manageUsers,
  validate(userIdParamsSchema, 'params'),
  controller.invite,
);

export default router;
