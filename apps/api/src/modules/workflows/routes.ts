import { Router } from 'express';

import { requireProjectAccess, requireRole } from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  createWorkflowSchema,
  listWorkflowsQuerySchema,
  patchWorkflowSchema,
  projectIdParamsSchema,
  workflowParamsSchema,
} from './schema.js';

const router = Router();

/**
 * §9.4 guard order, exactly:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → controller
 *
 * §4.6 drives `requireRole`:
 *   workflow read            → supervisor / administrator
 *   workflow create/patch/del→ administrator (the Coordinator)
 *   stage read               → project access (owner / assigned supervisor / admin)
 *   stage advance            → assigned supervisor / administrator
 *
 * `responsible_role` on a stage is descriptive only — never an authorization
 * input; these guards are the whole of §4.6's authority.
 */

/* ------------------------------------------------------------ definitions */

router.get(
  '/workflows',
  requireRole('supervisor', 'administrator'),
  validate(listWorkflowsQuerySchema, 'query'),
  controller.list,
);

router.post(
  '/workflows',
  requireRole('administrator'),
  validate(createWorkflowSchema),
  controller.create,
);

router.get(
  '/workflows/:workflowId',
  requireRole('supervisor', 'administrator'),
  validate(workflowParamsSchema, 'params'),
  controller.show,
);

router.patch(
  '/workflows/:workflowId',
  requireRole('administrator'),
  validate(workflowParamsSchema, 'params'),
  validate(patchWorkflowSchema),
  controller.patch,
);

router.delete(
  '/workflows/:workflowId',
  requireRole('administrator'),
  validate(workflowParamsSchema, 'params'),
  controller.remove,
);

/* -------------------------------------------------------- stage tracking */

router.get(
  '/projects/:projectId/stages',
  validate(projectIdParamsSchema, 'params'),
  requireProjectAccess(), // owner / assigned supervisor / admin (§4.6, §13.3)
  controller.getStages,
);

router.post(
  '/projects/:projectId/stages/advance',
  requireRole('supervisor', 'administrator'),
  validate(projectIdParamsSchema, 'params'),
  requireProjectAccess(), // an unassigned supervisor stops here (§13.3)
  controller.advance,
);

export default router;
