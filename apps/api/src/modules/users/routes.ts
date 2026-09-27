import { Router } from 'express';

import { requireAdmin } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { createUserSchema, importUsersSchema, listUsersQuerySchema, updateUserSchema, userIdParamsSchema } from './schema.js';

const router = Router();

// All user management is administrator-only (there is no public registration).
router.post('/users', requireAdmin(), validate(createUserSchema), controller.create);
router.get('/users', requireAdmin(), validate(listUsersQuerySchema, 'query'), controller.list);
router.post('/users/import', requireAdmin(), validate(importUsersSchema), controller.importUsers);
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
