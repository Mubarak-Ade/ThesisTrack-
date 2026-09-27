import { Router } from 'express';

import { requireAdmin, requireProjectAccess } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import { assignSupervisorSchema, assignmentParamsSchema } from './schema.js';

const router = Router();

/**
 * GET — who supervises this project? Visible to the project's participants
 * (owner student, assigned supervisor) and admins; writes are admin-only.
 */
router.get(
  '/projects/:projectId/supervisor',
  validate(assignmentParamsSchema, 'params'),
  requireProjectAccess(),
  controller.show,
);

router.post(
  '/projects/:projectId/supervisor',
  requireAdmin(),
  validate(assignmentParamsSchema, 'params'),
  validate(assignSupervisorSchema),
  controller.assign,
);

router.patch(
  '/projects/:projectId/supervisor',
  requireAdmin(),
  validate(assignmentParamsSchema, 'params'),
  validate(assignSupervisorSchema),
  controller.change,
);

router.delete(
  '/projects/:projectId/supervisor',
  requireAdmin(),
  validate(assignmentParamsSchema, 'params'),
  controller.end,
);

export default router;
