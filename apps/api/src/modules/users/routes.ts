import { Router } from 'express';

import { requireAdmin } from '../../authz/index.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { createUserSchema, importUsersSchema, listUsersQuerySchema, updateUserSchema, userIdParamsSchema } from './schema.js';

const router = Router();

// All user management is administrator-only (there is no public registration).
router.post('/users', requireAdmin(), validate(createUserSchema), idempotency, controller.create);
router.get('/users', requireAdmin(), validate(listUsersQuerySchema, 'query'), controller.list);
router.post(
  '/users/import',
  requireAdmin(),
  validate(importUsersSchema),
  idempotency, // §11.12 — a retried import replays instead of double-provisioning
  controller.importUsers,
);
router.get(
  '/users/:userId',
  requireAdmin(),
  validate(userIdParamsSchema, 'params'),
  controller.detail,
);
router.patch(
  '/users/:userId',
  requireAdmin(),
  validate(userIdParamsSchema, 'params'),
  validate(updateUserSchema),
  controller.update,
);
router.post(
  '/users/:userId/invite',
  requireAdmin(),
  validate(userIdParamsSchema, 'params'),
  controller.invite,
);

export default router;
