import { Router } from 'express';

import {
  requireDepartmentScope,
  requireProjectAccess,
  requireRole,
} from '../../authz/index.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './controller.js';
import {
  createWorkflowSchema,
  duplicateWorkflowSchema,
  listWorkflowsQuerySchema,
  patchWorkflowSchema,
  projectIdParamsSchema,
  workflowParamsSchema,
} from './schema.js';

const router = Router();

router.use(requireDepartmentScope());

/**
 * §9.4 guard order, exactly:
 *   authenticate (global) → requireRole → validate(params) → validate(body)
 *   → resource guard → controller
 *
 * §4.6 drives `requireRole`:
 *   workflow read            → supervisor / administrator / coordinator
 *   workflow create/patch/
 *     duplicate              → administrator / coordinator
 *   workflow delete          → administrator
 *   stage read               → project access (owner / assigned supervisor / admin)
 *   stage advance            → assigned supervisor / administrator
 *
 * Coordinator scope (design 2026-11-02, ADR-17): the service narrows reads and
 * writes to the caller's department and 404s the default definition. Deleting
 * remains administrator-only; a coordinator retires a workflow by archiving it
 * through PATCH or by duplicating it as a new version.
 *
 * `responsible_role` on a stage is descriptive only — never an authorization
 * input; these guards are the whole of §4.6's authority.
 */

/* ------------------------------------------------------------ definitions */

router.get(
  '/workflows',
  requireRole('supervisor', 'administrator', 'coordinator'),
  validate(listWorkflowsQuerySchema, 'query'),
  controller.list,
);

router.post(
  '/workflows',
  requireRole('administrator', 'coordinator'),
  validate(createWorkflowSchema),
  controller.create,
);

router.get(
  '/workflows/:workflowId',
  requireRole('supervisor', 'administrator', 'coordinator'),
  validate(workflowParamsSchema, 'params'),
  controller.show,
);

router.patch(
  '/workflows/:workflowId',
  requireRole('administrator', 'coordinator'),
  validate(workflowParamsSchema, 'params'),
  validate(patchWorkflowSchema),
  controller.patch,
);

router.post(
  '/workflows/:workflowId/duplicate',
  requireRole('administrator', 'coordinator'),
  validate(workflowParamsSchema, 'params'),
  validate(duplicateWorkflowSchema),
  controller.duplicate,
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
